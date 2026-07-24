import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection } from "../../shared/src/store.js";
import { chat, providerStatus } from "../../llm/src/llm.js";

/**
 * Creator helper tools — the practical gaps around the pipeline.
 *
 * captionFiles()   burned-in captions are pixels; YouTube can't READ them.
 *                  Uploaded .srt/.vtt get indexed for search and power
 *                  auto-translate. We already own exact word timings, so
 *                  exporting them is free SEO we were throwing away.
 * chapters()       timestamped chapters from the scene timeline.
 * teleprompter()   a readable talking-track for the capture lane.
 * calendar()       what ships which day, from briefs + slots + queue.
 * descriptionKit() upload-ready description with chapters + CTA + links.
 */

const ts = (sec, comma = true) => {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = (sec % 60).toFixed(3).padStart(6, "0");
  return `${h}:${m}:${comma ? s.replace(".", ",") : s}`;
};

/** Load the prepared props (scene timeline + word timings) for a render id. */
function loadProps(renderId) {
  const p = path.join(repoRoot, "data", "build", renderId, "props.json");
  if (!existsSync(p)) throw new Error(`no build props for ${renderId} — render it first`);
  return JSON.parse(readFileSync(p, "utf8"));
}

/* ---------------- 1. caption sidecars (.srt / .vtt) ---------------- */

export function captionFiles(renderId) {
  const props = loadProps(renderId);
  const fps = props.timeline.fps;
  const cues = [];

  props.scenes.forEach((scene, i) => {
    const startSec = props.timeline.scenes[i].start / fps;
    const words = scene.words || [];
    if (!words.length) return;
    // group into readable 2-4 word cues on the real word timings
    for (let w = 0; w < words.length; w += 4) {
      const chunk = words.slice(w, w + 4);
      cues.push({
        start: startSec + chunk[0].start,
        end: startSec + chunk[chunk.length - 1].end,
        text: chunk.map((x) => x.word).join(" ").trim(),
      });
    }
  });
  if (!cues.length) throw new Error("no word timings in this render (voice step produced none)");

  const srt = cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join("\n");
  const vtt = `WEBVTT\n\n${cues.map((c) => `${ts(c.start, false)} --> ${ts(c.end, false)}\n${c.text}\n`).join("\n")}`;

  const dir = path.join(repoRoot, "renders", renderId);
  mkdirSync(dir, { recursive: true });
  const srtFile = path.join(dir, "captions.srt");
  const vttFile = path.join(dir, "captions.vtt");
  writeFileSync(srtFile, srt);
  writeFileSync(vttFile, vtt);
  return { srtFile, vttFile, cues: cues.length };
}

/* ---------------- 2. chapters ---------------- */

export function chapters(renderId) {
  const props = loadProps(renderId);
  const fps = props.timeline.fps;
  const rows = props.scenes.map((scene, i) => {
    const startSec = props.timeline.scenes[i].start / fps;
    const first = (scene.voiceover || "").split(/[.!?]/)[0] || scene.type;
    return { at: startSec, label: first.trim().slice(0, 48) || scene.type };
  });
  // YouTube requires the first chapter at 0:00 and ≥3 chapters of ≥10s
  if (rows.length && rows[0].at > 0) rows[0].at = 0;
  const text = rows.map((r) => `${ts(r.at).slice(3, 8)} ${r.label}`).join("\n");
  return { chapters: rows, text, valid: rows.length >= 3 };
}

/* ---------------- 3. teleprompter ---------------- */

export function teleprompter(briefId) {
  const brief = collection("briefs").get(briefId);
  if (!brief) throw new Error(`no brief ${briefId}`);
  const p = brief.payload || {};
  const shots = brief.pipeline?.shotList;
  const blocks = [
    { kind: "hook", seconds: 3, text: p.yt_short?.hook_variants?.[0] || brief.topic },
    ...(p.yt_short?.beats || []).map((b, i) => ({ kind: `beat ${i + 1}`, seconds: 8, text: b })),
    { kind: "cta", seconds: 3, text: p.ig_reel?.caption?.split("?")[0] || "Follow for more builds." },
  ];
  const totalSec = blocks.reduce((a, b) => a + b.seconds, 0);
  return { topic: brief.topic, blocks, totalSec, shots: shots?.shots || [], wordCount: blocks.reduce((a, b) => a + b.text.split(/\s+/).length, 0) };
}

/* ---------------- 4. content calendar ---------------- */

export function calendar(days = 14) {
  const briefs = collection("briefs").all();
  const items = collection("publishitems").all();
  const out = [];
  const today = new Date();

  for (let d = 0; d < days; d++) {
    const date = new Date(today.getTime() + d * 864e5).toISOString().slice(0, 10);
    const scheduled = items.filter((i) => (i.scheduledFor || "").slice(0, 10) === date && !i.derivative);
    const slotted = briefs.filter((b) => b.scheduledDate === date && b.status !== "killed");
    const published = items.filter((i) => (i.publishedAt || "").slice(0, 10) === date);
    out.push({
      date,
      weekday: new Date(date).toLocaleDateString("en-US", { weekday: "short" }),
      scheduled: scheduled.map((i) => ({ platform: i.platform, topic: i.topic, status: i.status, at: i.scheduledText })),
      slotted: slotted.map((b) => ({ id: b.id, topic: b.topic, kind: b.kind, lane: b.lane, state: b.pipeline?.state })),
      published: published.length,
      empty: !scheduled.length && !slotted.length,
    });
  }
  const gaps = out.filter((d) => d.empty).length;
  return { days: out, gaps, cadenceWarning: gaps > days / 2 ? `${gaps}/${days} days have nothing scheduled` : null };
}

/* ---------------- 5. description kit ---------------- */

export async function descriptionKit(briefId, renderId) {
  loadEnv();
  const brief = collection("briefs").get(briefId);
  if (!brief) throw new Error(`no brief ${briefId}`);
  const p = brief.payload || {};
  let chapterText = "";
  try {
    if (renderId) {
      const ch = chapters(renderId);
      if (ch.valid) chapterText = `\n\nChapters:\n${ch.text}`;
    }
  } catch {
    /* chapters optional */
  }

  let hook = p.yt_short?.description || "";
  if (providerStatus().active) {
    try {
      const res = await chat({
        task: "analysis",
        maxTokens: 600,
        system:
          `Write a YouTube description for: ${NICHE_CONTEXT}. First 2 lines carry the search keywords and the hook ` +
          "(that's all viewers see before 'more'). Then a short value line. No hashtag spam. Reply ONLY JSON: " +
          '{"description":"..."}',
        user: `title: ${p.yt_short?.title}\ntopic: ${brief.topic}`,
      });
      if (res) hook = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1)).description || hook;
    } catch {
      /* keep payload description */
    }
  }

  const tags = p.yt_short?.tags || [];
  const body = [
    hook,
    chapterText,
    "\n\n—\n\nMore builds: https://coderfact.com",
    tags.length ? `\n\n${tags.slice(0, 5).map((t) => `#${String(t).replace(/\s+/g, "")}`).join(" ")}` : "",
  ].filter(Boolean).join("");

  return { description: body.trim(), chars: body.length, withinLimit: body.length <= 5000, tags };
}
