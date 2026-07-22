import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnv, loadUserConfig, repoRoot, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection } from "../../shared/src/store.js";
import { chat, providerStatus } from "../../llm/src/llm.js";

/**
 * P20 two-lane orchestrator. State machine per brief:
 *   approved -> scripted -> rendered|awaiting-capture -> qc -> ready -> published
 * Synthetic lane is zero-touch (approve->ready, no human step). Capture lane
 * generates a shot list, waits for a dropped recording, then runs the EXISTING
 * AI Cut editor. Every transition is timestamped for the kanban + stuck alerts.
 */

const STUCK_H = { default: 24, trend: 6 };
const CAPTURE_HINT = /\b(build|tutorial|walkthrough|let'?s code|screen ?record|step[- ]by[- ]step|from scratch|live demo)\b/i;

/* ---------------- lane routing ---------------- */

export async function routeLane(brief) {
  const text = `${brief.topic} ${brief.payload?.core_idea || ""} ${(brief.payload?.yt_short?.beats || []).join(" ")}`;
  const heuristic = CAPTURE_HINT.test(text) ? "capture" : "synthetic";
  if (providerStatus().active) {
    try {
      const res = await chat({
        task: "score",
        maxTokens: 200,
        system:
          `Route a video brief to a production lane for: ${NICHE_CONTEXT}. ` +
          '"synthetic" = explainer/verdict/data-story/news-take/listicle (fully rendered). ' +
          '"capture" = build/tutorial needing real screen recording. Reply ONLY JSON: {"lane":"synthetic|capture","why":"<6 words>"}',
        user: text.slice(0, 300),
      });
      const p = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
      if (p.lane === "synthetic" || p.lane === "capture") return { lane: p.lane, why: p.why, mode: "llm" };
    } catch {
      /* heuristic */
    }
  }
  return { lane: heuristic, why: heuristic === "capture" ? "build/tutorial keywords" : "default", mode: "heuristic" };
}

/* ---------------- state machine ---------------- */

export function setState(briefId, state, extra = {}) {
  const briefs = collection("briefs");
  const b = briefs.get(briefId);
  if (!b) throw new Error(`no brief ${briefId}`);
  const now = new Date().toISOString();
  const pipeline = b.pipeline || { history: [] };
  pipeline.state = state;
  pipeline.updatedAt = now;
  pipeline.history = [...(pipeline.history || []), { state, at: now }].slice(-20);
  return briefs.update(briefId, { pipeline: { ...pipeline, ...extra } });
}

export function stuckReason(brief) {
  const p = brief.pipeline;
  if (!p || ["ready", "published"].includes(p.state)) return null;
  const hoursIn = (Date.now() - new Date(p.updatedAt).getTime()) / 36e5;
  const limit = brief.kind === "trend" ? STUCK_H.trend : STUCK_H.default;
  if (hoursIn > limit) return `stuck ${Math.round(hoursIn)}h in "${p.state}" (limit ${limit}h for ${brief.kind})`;
  return null;
}

/* ---------------- shot list (capture lane) ---------------- */

function shotList(brief) {
  const beats = brief.payload?.yt_short?.beats || [];
  const track = brief.payload?.yt_short?.hook_variants?.[0] || brief.topic;
  return {
    talkingTrack: [track, ...beats].filter(Boolean),
    shots: (beats.length ? beats : [brief.topic]).map((b, i) => `Shot ${i + 1}: ${b}`),
    generatedAt: new Date().toISOString(),
  };
}

/* ---------------- the conveyor ---------------- */

/**
 * Advance a brief through its lane. Synthetic runs to "ready" in one call.
 * Capture stops at "awaiting-capture" until a file is dropped (captureFile).
 */
export async function produce(briefId, { captureFile = null, profiles = "yt_short" } = {}) {
  loadEnv();
  const briefs = collection("briefs");
  let brief = briefs.get(briefId);
  if (!brief) throw new Error(`no brief ${briefId}`);
  if (brief.status !== "approved") throw new Error(`brief is ${brief.status} — approve it first`);

  const lane = brief.lane || (await routeLane(brief)).lane;
  if (!brief.lane) briefs.update(briefId, { lane });
  const log = (m) => console.log(`  [${lane}] ${m}`);

  // ensure PublishItems exist
  const { sendToCenter } = await import("../../publish/src/center.js");
  sendToCenter(briefId);

  /* ---- CAPTURE LANE ---- */
  if (lane === "capture") {
    if (!captureFile) {
      setState(briefId, "awaiting-capture", { shotList: shotList(brief) });
      log("shot list + talking track ready — record and drop the file (factory produce <id> --capture-file <path>)");
      return { briefId, lane, state: "awaiting-capture", shotList: shotList(brief) };
    }
    if (!existsSync(captureFile)) throw new Error(`capture file not found: ${captureFile}`);
    log(`AI-Cut editing ${path.basename(captureFile)}...`);
    setState(briefId, "scripted");
    const { autoEdit } = await import("./autoedit.js");
    const ok = await autoEdit([captureFile, "--no-backtrack"]); // uses the existing editor
    if (!ok) {
      setState(briefId, "awaiting-capture");
      throw new Error("AI Cut failed on the capture file");
    }
    // attach the edited short onto the PublishItems
    const editId = `edit-${path.basename(captureFile, path.extname(captureFile)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)}`;
    const editShort = path.join(repoRoot, "renders", editId, "short.mp4");
    setState(briefId, "rendered");
    if (existsSync(editShort)) {
      const { attachFile } = await import("../../publish/src/center.js");
      for (const item of collection("publishitems").find((i) => i.briefId === briefId && (i.platform === "youtube" || i.platform === "instagram"))) {
        attachFile(item.id, editShort, "video");
      }
      log(`attached ${editId}/short.mp4`);
    }
    return finishQC(briefId, lane, editShort);
  }

  /* ---- SYNTHETIC LANE (zero-touch) ---- */
  log("compiling script...");
  const { compileBrief } = await import("../../studio/src/compileBrief.js");
  const { script, file: scriptPath } = await compileBrief(briefId);

  // ScriptJudge gate before spending a render
  const { scriptJudge } = await import("../../judges/src/judges.js");
  let sj = await scriptJudge(script);
  if (sj.verdict === "fail") {
    log(`ScriptJudge ${sj.score}/100 — regenerating...`);
    const { qcBrief } = await import("../../judges/src/qc.js");
    await qcBrief(briefId, { rendered: false }); // runs the coded regeneration loop
    sj = await scriptJudge(JSON.parse((await import("node:fs")).readFileSync(scriptPath, "utf8")));
    if (sj.verdict === "fail") {
      setState(briefId, "qc", { escalated: true });
      log(`ScriptJudge still failing (${sj.score}) — escalated to Human Review`);
      return { briefId, lane, state: "qc", escalated: true };
    }
  }
  setState(briefId, "scripted");

  log(`rendering (${profiles})...`);
  const { renderBrief } = await import("./render.js");
  const ok = await renderBrief([briefId, `--profiles=${profiles}`]);
  if (!ok) {
    setState(briefId, "scripted", { renderFailed: true });
    throw new Error("render failed");
  }
  setState(briefId, "rendered");
  const short = path.join(repoRoot, "renders", `brief-${briefId.slice(0, 10)}`, "short.mp4");
  return finishQC(briefId, lane, short);
}

async function finishQC(briefId, lane, videoFile) {
  console.log(`  [${lane}] running visual + audio judges...`);
  setState(briefId, "qc");
  const { qcBrief } = await import("../../judges/src/qc.js");
  const qc = await qcBrief(briefId, { rendered: true });
  const escalated = qc.escalated.length > 0;
  if (escalated) {
    setState(briefId, "qc", { escalated: true, escalatedJudges: qc.escalated });
    console.log(`  [${lane}] escalated (${qc.escalated.join(", ")}) — Human Review, not auto-published`);
    return { briefId, lane, state: "qc", escalated: true, escalatedJudges: qc.escalated };
  }
  setState(briefId, "ready");
  console.log(`  [${lane}] READY — in Publish Center for your publish tap`);
  return { briefId, lane, state: "ready" };
}

/* ---------------- kanban + pacing ---------------- */

export function board() {
  const states = ["approved", "scripted", "awaiting-capture", "rendered", "qc", "ready", "published"];
  const briefs = collection("briefs").find((b) => b.status === "approved" || b.pipeline);
  const cols = Object.fromEntries(states.map((s) => [s, []]));
  const alerts = [];
  for (const b of briefs) {
    const state = b.pipeline?.state || (b.status === "approved" ? "approved" : null);
    if (!state || !cols[state]) continue;
    const stuck = stuckReason(b);
    cols[state].push({ id: b.id, topic: b.topic, lane: b.lane || "?", kind: b.kind, state, updatedAt: b.pipeline?.updatedAt, escalated: b.pipeline?.escalated || false, stuck });
    if (stuck) alerts.push({ id: b.id, topic: b.topic, reason: stuck });
  }
  return { columns: cols, alerts };
}

/** Worker pacing: how many synthetic briefs to auto-produce today. */
export function pacingPlan() {
  const cadence = loadUserConfig().dailyCadence ?? 1;
  const today = new Date().toISOString().slice(0, 10);
  const producedToday = collection("briefs").find(
    (b) => b.pipeline && ["rendered", "qc", "ready", "published"].includes(b.pipeline.state) && (b.pipeline.updatedAt || "").slice(0, 10) === today
  ).length;
  const queue = collection("briefs").find((b) => b.status === "approved" && b.lane !== "capture" && (!b.pipeline || b.pipeline.state === "approved"));
  return { cadence, producedToday, remaining: Math.max(0, cadence - producedToday), queue: queue.map((b) => b.id) };
}
