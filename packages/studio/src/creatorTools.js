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

/** Parse word timings out of an AI-Cut .ass file (its \kf sweep IS the timing). */
function cuesFromAss(renderId) {
  const assPath = path.join(repoRoot, "data", "build", renderId, "vert.ass");
  if (!existsSync(assPath)) return [];
  const toSec = (t) => {
    const [h, m, s] = t.split(":");
    return Number(h) * 3600 + Number(m) * 60 + Number(s);
  };
  return readFileSync(assPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.startsWith("Dialogue:"))
    .map((line) => {
      const parts = line.slice(9).split(",");
      const text = parts.slice(9).join(",").replace(/\{[^}]*\}/g, "").trim();
      return { start: toSec(parts[1].trim()), end: toSec(parts[2].trim()), text };
    })
    .filter((c) => c.text);
}

/* ---------------- 1. caption sidecars (.srt / .vtt) ---------------- */

/**
 * Handles all three render shapes the factory produces:
 *   scripted  { scenes[], timeline }  — per-scene word timings
 *   math      { words[], totalFrames } — one flat overlay track
 *   AI-Cut    vert.ass                 — timings already live in the ASS
 */
export function captionFiles(renderId) {
  let cues = [];

  const propsPath = path.join(repoRoot, "data", "build", renderId, "props.json");
  if (existsSync(propsPath)) {
    const props = JSON.parse(readFileSync(propsPath, "utf8"));
    const group = (words, offset = 0) => {
      for (let w = 0; w < words.length; w += 4) {
        const chunk = words.slice(w, w + 4);
        cues.push({
          start: offset + chunk[0].start,
          end: offset + chunk[chunk.length - 1].end,
          text: chunk.map((x) => x.word).join(" ").trim(),
        });
      }
    };

    if (props.timeline?.scenes && Array.isArray(props.scenes)) {
      const fps = props.timeline.fps || 30;
      props.scenes.forEach((scene, i) => {
        const startSec = (props.timeline.scenes[i]?.start || 0) / fps;
        if (scene.words?.length) group(scene.words, startSec);
      });
    } else if (Array.isArray(props.words) && props.words.length) {
      group(props.words); // math / ShortOverlay: one flat track, already absolute
    }
  }

  if (!cues.length) cues = cuesFromAss(renderId); // AI-Cut footage
  if (!cues.length) {
    throw new Error(
      `no word timings found for ${renderId} — captions need either a voiced render (scripted/math) or an AI-Cut edit with whisper transcription`
    );
  }

  // players double-display overlapping cues: clamp each end to the next start
  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].end > cues[i + 1].start) cues[i].end = Math.max(cues[i].start + 0.2, cues[i + 1].start - 0.01);
  }

  const srt = cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join("\n");
  const vtt = `WEBVTT\n\n${cues.map((c) => `${ts(c.start, false)} --> ${ts(c.end, false)}\n${c.text}\n`).join("\n")}`;

  const dir = path.join(repoRoot, "renders", renderId);
  mkdirSync(dir, { recursive: true });
  const srtFile = path.join(dir, "captions.srt");
  const vttFile = path.join(dir, "captions.vtt");
  writeFileSync(srtFile, srt);
  writeFileSync(vttFile, vtt);
  return {
    srtFile,
    vttFile,
    cues: cues.length,
    readingSpeed: readingSpeed(cues),
    advertiser: advertiserScan(cues),
  };
}

/**
 * ADVERTISER-SAFETY SCAN.
 *
 * YouTube demonetises or limits ads based on spoken words in the first ~30
 * seconds far more aggressively than later, and the caption track is what gets
 * machine-read. This flags rather than censors: bleeping a word you chose to
 * say is a creative decision, and the false-positive rate on any wordlist is
 * high enough ("hell" in "hell of a lot", "damn" in a quote) that automatic
 * replacement would mangle real speech.
 *
 * Two tiers, because they carry different consequences: `strong` risks limited
 * ads outright, `mild` is usually fine outside the opening seconds.
 */
const PROFANITY = {
  strong: /\b(fuck\w*|shit\w*|cunt\w*|bastard|bitch\w*|asshole|dick(?:head)?|motherfuck\w*)\b/gi,
  mild: /\b(damn|hell|crap|piss\w*|screw(?:ed)?\s+up|bloody|god ?damn)\b/gi,
};

export function advertiserScan(cues, { earlySec = 30 } = {}) {
  const hits = [];
  for (const c of cues) {
    for (const [tier, re] of Object.entries(PROFANITY)) {
      for (const m of String(c.text).matchAll(re)) {
        hits.push({ tier, word: m[0], at: Math.round(c.start * 10) / 10, early: c.start <= earlySec, text: c.text });
      }
    }
  }
  const earlyStrong = hits.filter((h) => h.tier === "strong" && h.early);
  return {
    hits,
    earlyStrong: earlyStrong.length,
    risk: earlyStrong.length ? "high" : hits.some((h) => h.tier === "strong") ? "medium" : hits.length ? "low" : "none",
    reading: earlyStrong.length
      ? `${earlyStrong.length} strong word(s) in the first ${earlySec}s — the highest-risk position for limited ads`
      : hits.length
        ? `${hits.length} flagged word(s), none strong in the opening — usually fine, but check if this is a brand-deal video`
        : "nothing flagged",
  };
}

/**
 * Reading-speed check (characters per second).
 *
 * A cue that is on screen too briefly to read is worse than no cue: the viewer
 * stops trying, and on a Short they leave. ~20 CPS is the broadcast-subtitle
 * ceiling for comfortable reading; above ~25 most people cannot finish the line.
 *
 * Reported, not enforced — the timings come from real speech, so the fix is to
 * shorten the LINE, which is a writing decision.
 */
export function readingSpeed(cues, { ceiling = 20, hard = 25 } = {}) {
  const rated = cues
    .map((c) => {
      const dur = Math.max(0.1, c.end - c.start);
      return { text: c.text, cps: Math.round((c.text.replace(/\s+/g, " ").length / dur) * 10) / 10, dur };
    })
    .sort((a, b) => b.cps - a.cps);
  const tooFast = rated.filter((r) => r.cps > ceiling);
  const unreadable = rated.filter((r) => r.cps > hard);
  return {
    medianCps: rated.length ? rated[Math.floor(rated.length / 2)].cps : 0,
    tooFast: tooFast.length,
    unreadable: unreadable.length,
    worst: rated.slice(0, 3),
    reading: unreadable.length
      ? `${unreadable.length} cue(s) above ${hard} CPS — most viewers cannot finish these lines; shorten the text`
      : tooFast.length
        ? `${tooFast.length} cue(s) above ${ceiling} CPS — readable but rushed`
        : "comfortable reading speed throughout",
  };
}

/* ---------------- 2. chapters ---------------- */

export function chapters(renderId) {
  const props = loadProps(renderId);
  if (!props.timeline?.scenes || !Array.isArray(props.scenes)) {
    // math/overlay renders are one continuous piece — chapters don't apply
    return { chapters: [], text: "", valid: false, note: "this render has no scene timeline (math/overlay renders are a single segment)" };
  }
  const fps = props.timeline.fps || 30;
  const rows = props.scenes.map((scene, i) => {
    const startSec = (props.timeline.scenes[i]?.start || 0) / fps;
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
