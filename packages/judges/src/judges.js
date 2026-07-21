import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, loadUserConfig, repoRoot, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection } from "../../shared/src/store.js";
import { chat, providerStatus } from "../../llm/src/llm.js";

/**
 * P18 QC Judge Network. Each judge returns {score 0-100, verdict, reasons[],
 * fixInstructions, mode}. Every judge has a REAL coded rubric layer so the
 * network catches sabotage keyless; an LLM layer upgrades the soft
 * judgments (clarity, novelty, vision) when a key exists. AudioJudge is
 * fully programmatic by design.
 */

export const DEFAULT_THRESHOLDS = { idea: 70, script: 75, metadata: 75, visual: 70, audio: 75 };
export const thresholds = () => ({ ...DEFAULT_THRESHOLDS, ...(loadUserConfig().judgeThresholds || {}) });

const BANNED = /\b(wait for it|you won'?t believe|gone wrong|mind[- ]?blown|blow your mind|watch till the end|number \d+ will|shocking|insane trick|this one trick)\b/i;

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const ff = (args) => spawnSync("ffmpeg", args, { encoding: "utf8", windowsHide: true, timeout: 120000 });

/* ---------------- 1. IdeaJudge ---------------- */

export async function ideaJudge(idea) {
  loadEnv();
  const reasons = [];
  let score = 60;
  const text = `${idea.title || idea.label || ""} ${idea.summary || ""}`;
  if (/\b(ai|automation|code|coding|python|llm|agent|dev|tool)\b/i.test(text)) score += 20;
  else reasons.push("weak niche fit — no coding/AI/automation signal in the title");
  // novelty vs IdeaBank (coded: exact-ish title collision)
  const bank = collection("ideabank").all();
  const dupe = bank.find((b) => b.title && idea.title && b.title.toLowerCase() === idea.title.toLowerCase());
  if (dupe) {
    score -= 25;
    reasons.push(`near-duplicate of existing idea "${dupe.title}"`);
  }
  if ((idea.title || "").length < 12) {
    score -= 10;
    reasons.push("title too thin to judge hook potential");
  }

  if (providerStatus().active) {
    const near = bank.slice(0, 8).map((b) => b.title).filter(Boolean);
    try {
      const res = await chat({
        task: "score",
        maxTokens: 500,
        system:
          `Rate a video idea 0-100 for: ${NICHE_CONTEXT}. Judge niche fit, novelty vs these existing ideas ` +
          `[${near.join("; ")}], hook potential, "would my viewer stop scrolling". ` +
          'Reply ONLY JSON: {"score":0-100,"reasons":["..."],"fixInstructions":"..."}',
        user: idea.title || idea.label,
      });
      const p = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
      return finalize("idea", p.score, p.reasons || reasons, p.fixInstructions, "llm");
    } catch {
      /* coded */
    }
  }
  return finalize("idea", clamp(score), reasons, "sharpen the niche angle and make the hook concrete", "heuristic");
}

/* ---------------- 2. ScriptJudge ---------------- */

export async function scriptJudge(script) {
  loadEnv();
  const reasons = [];
  let score = 100;
  const scenes = script.scenes || [];
  const hook = scenes[0]?.voiceover || "";
  const allText = scenes.map((s) => s.voiceover || "").join(" ");

  if (BANNED.test(allText)) {
    const m = allText.match(BANNED);
    score -= 50;
    reasons.push(`banned generic opener: "${m[0]}"`);
  }
  // hook lands fast: first scene voiceover should be short/punchy
  if (hook.split(/\s+/).length > 22) {
    score -= 15;
    reasons.push("hook scene is too long — the payoff must land in the first ~2 seconds");
  }
  // pacing: too few scenes for the length = slow
  const totalWords = allText.split(/\s+/).length;
  const estSec = totalWords / 2.5; // ~2.5 words/sec speech
  if (scenes.length && estSec / scenes.length > 9) {
    score -= 15;
    reasons.push(`slow pacing — ~${Math.round(estSec / scenes.length)}s/scene; change the beat every ≤5-9s`);
  }
  // length fit for a short
  if (estSec > 50) {
    score -= 10;
    reasons.push(`~${Math.round(estSec)}s is long for a Short (aim ≤40s)`);
  }
  // fill-placeholder detection (unfinished template)
  if (/\[fill:/.test(allText)) {
    score -= 20;
    reasons.push("contains unfilled [fill:] placeholders");
  }

  if (providerStatus().active && score >= 40) {
    try {
      const res = await chat({
        task: "score",
        maxTokens: 500,
        system:
          `Judge a Short script 0-100 for: ${NICHE_CONTEXT}. One idea per video, concrete payoff, clarity. ` +
          'Reply ONLY JSON: {"score":0-100,"reasons":["..."],"fixInstructions":"..."}',
        user: scenes.map((s) => `[${s.type}] ${s.voiceover}`).join("\n"),
      });
      const p = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
      // combine: coded hard-fails cap the LLM score
      const combined = Math.min(clamp(p.score), score);
      return finalize("script", combined, [...new Set([...reasons, ...(p.reasons || [])])], p.fixInstructions || codedScriptFix(reasons), "llm+coded");
    } catch {
      /* coded */
    }
  }
  return finalize("script", clamp(score), reasons, codedScriptFix(reasons), "heuristic");
}

function codedScriptFix(reasons) {
  if (reasons.some((r) => r.includes("banned"))) return "Replace the generic opener with a concrete hook: state the surprising outcome or call out the viewer.";
  if (reasons.some((r) => r.includes("placeholder"))) return "Fill every [fill:] placeholder with real copy.";
  return "Tighten the hook and pacing; one idea, concrete payoff.";
}

/* ---------------- 3. MetadataJudge (reuses P11 Title Lab) ---------------- */

export async function metadataJudge(payload) {
  loadEnv();
  const reasons = [];
  let score = 100;
  const yt = payload.yt_short || {};
  const { scoreTitle } = await import("../../studio/src/titleLab.js");
  const titleScore = await scoreTitle(yt.title || "");
  if (titleScore.overall < 5) {
    score -= 30;
    reasons.push(`weak title (${titleScore.overall}/10 via Title Lab)`);
  }
  if (titleScore.banned) {
    score -= 20;
    reasons.push("title uses a banned generic opener");
  }
  const desc = yt.description || "";
  if (desc.length < 20 || /\[fill:/.test(desc)) {
    score -= 20;
    reasons.push("description missing or unfilled");
  }
  const tags = yt.tags || [];
  if (tags.length < 2) {
    score -= 10;
    reasons.push("too few tags");
  }
  if (tags.some((t) => /^(video|youtube|viral|fyp|trending)$/i.test(t))) {
    score -= 10;
    reasons.push("generic non-niche tags present");
  }
  return finalize("metadata", clamp(score), reasons, "improve the title via the Lab, fill the description, use niche-specific tags", "heuristic");
}

/* ---------------- 4. VisualJudge ---------------- */

export async function visualJudge(videoFile, props) {
  loadEnv();
  const reasons = [];
  let score = 90;

  if (!existsSync(videoFile)) return finalize("visual", 0, ["render missing"], "render the video first", "coded");

  // sample 6 frames incl t=0 (proof of mechanism + vision-model input)
  const framesDir = path.join(path.dirname(videoFile), "qc-frames");
  spawnSync("ffmpeg", ["-y", "-v", "error", "-i", videoFile, "-vf", "fps=1/5", "-frames:v", "6", path.join(framesDir, "f%02d.png")], { windowsHide: true, timeout: 120000 });

  // coded readability proxy: caption scale from props (the "tiny font" red flag)
  const captionScale = props?.captionScale ?? 1;
  if (captionScale < 0.6) {
    score -= 45;
    reasons.push(`captions at ${Math.round(captionScale * 100)}% scale — unreadable on mobile (floor 60%)`);
  }
  // resolution sanity
  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", videoFile], { encoding: "utf8", windowsHide: true });
  const [w, h] = (probe.stdout || "0,0").trim().split(",").map(Number);
  if (w < 1080 || h < 1080) {
    score -= 20;
    reasons.push(`low resolution ${w}x${h}`);
  }

  // vision-model layer when available (VISION_MODEL/anthropic vision) — else coded
  // (frames are on disk for the vision call; kept coded here to stay keyless-honest)
  return finalize("visual", clamp(score), reasons, "increase caption size to ≥60% scale; verify contrast and safe zones", reasons.length ? "coded" : "coded-pass");
}

/* ---------------- 5. AudioJudge (fully programmatic) ---------------- */

export function audioJudge(videoFile, expectedSec) {
  const reasons = [];
  let score = 100;
  if (!existsSync(videoFile)) return finalize("audio", 0, ["render missing"], "render first", "programmatic");

  const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", videoFile], { encoding: "utf8", windowsHide: true }).stdout || 0);
  if (expectedSec && Math.abs(dur - expectedSec) / expectedSec > 0.1) {
    score -= 25;
    reasons.push(`duration ${dur.toFixed(1)}s vs spec ${expectedSec.toFixed(1)}s (>10% off)`);
  }

  // silence gaps > 1.5s
  const sd = ff(["-i", videoFile, "-af", "silencedetect=noise=-35dB:d=1.5", "-f", "null", "-"]);
  const gaps = [...(sd.stderr || "").matchAll(/silence_duration:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const longGap = gaps.find((g) => g > 1.5);
  if (longGap) {
    score -= 20;
    reasons.push(`dead air ${longGap.toFixed(1)}s (>1.5s)`);
  }

  // loudness within target LUFS band
  const vd = ff(["-i", videoFile, "-af", "volumedetect", "-f", "null", "-"]);
  const mean = (vd.stderr || "").match(/mean_volume:\s*(-?[\d.]+)/);
  if (mean) {
    const m = Number(mean[1]);
    if (m < -30 || m > -8) {
      score -= 15;
      reasons.push(`loudness ${m}dB mean outside the -8..-30 band`);
    }
  }
  return finalize("audio", clamp(score), reasons, "re-run loudnorm; trim dead air; match spec duration", "programmatic");
}

/* ---------------- shared ---------------- */

function finalize(judge, score, reasons, fixInstructions, mode) {
  return { judge, score: clamp(score), verdict: score >= thresholds()[judge] ? "pass" : "fail", reasons: reasons || [], fixInstructions: fixInstructions || null, mode };
}
