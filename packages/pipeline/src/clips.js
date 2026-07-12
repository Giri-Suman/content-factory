import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot } from "../../shared/src/config.js";
import { chat } from "../../llm/src/llm.js";

/**
 * Shorts factory: mine an already-rendered episode for 1-3 self-contained
 * clips. We own the exact scene timeline (data/build/<id>/props.json), so no
 * transcription is needed — clips are cut from renders/<id>/short.mp4 at
 * scene boundaries. LLM picks the best windows when available; a heuristic
 * does otherwise.
 */

const FPS = 30;
const MIN_S = 20;
const MAX_S = 59;

const WEIGHTS = { kinetic: 2, meme: 2, stat: 1.6, quote: 1.5, code: 1.1, terminal: 1.1, screenshot: 0.9 };

function sceneRanges(props) {
  return props.scenes.map((scene, i) => {
    const t = props.timeline.scenes[i];
    return {
      i,
      type: scene.type,
      voiceover: scene.voiceover || "",
      start: t.start / FPS,
      dur: t.frames / FPS,
    };
  });
}

function heuristicWindows(ranges) {
  const windows = [];
  const windowFrom = (startIdx) => {
    let end = startIdx;
    let dur = 0;
    while (end < ranges.length && dur < MIN_S) dur += ranges[end++].dur;
    while (end < ranges.length && dur + ranges[end].dur <= MAX_S) dur += ranges[end++].dur;
    if (dur < MIN_S || dur > MAX_S) return null;
    return { from: startIdx, to: end - 1 };
  };
  const first = windowFrom(0); // the hook window
  if (first) windows.push(first);
  const midStart = first ? first.to + 1 : Math.floor(ranges.length / 2);
  if (midStart < ranges.length - 1) {
    const mid = windowFrom(midStart);
    if (mid) windows.push(mid);
  }
  return windows.slice(0, 3);
}

async function llmWindows(ranges) {
  const listing = ranges
    .map((r) => `${r.i} | ${r.type} | ${r.dur.toFixed(1)}s | ${r.voiceover.slice(0, 110)}`)
    .join("\n");
  try {
    const result = await chat({
      task: "score",
      maxTokens: 1000,
      system:
        "You pick self-contained YouTube Shorts out of a longer video. Each line: sceneIndex | type | duration | voiceover. " +
        `Pick up to 3 CONSECUTIVE scene windows that stand alone (hook -> payoff), each ${MIN_S}-${MAX_S}s total. ` +
        'Reply ONLY JSON: [{"from":0,"to":2,"why":"<6 words>"}]',
      user: listing,
    });
    if (!result) return null;
    const start = result.text.indexOf("[");
    const end = result.text.lastIndexOf("]");
    const picks = JSON.parse(result.text.slice(start, end + 1));
    const valid = picks.filter((p) => {
      if (typeof p.from !== "number" || typeof p.to !== "number" || p.from > p.to) return false;
      if (!ranges[p.from] || !ranges[p.to]) return false;
      const dur = ranges.slice(p.from, p.to + 1).reduce((a, r) => a + r.dur, 0);
      return dur >= MIN_S && dur <= MAX_S + 2;
    });
    return valid.length ? valid.slice(0, 3) : null;
  } catch {
    return null;
  }
}

export async function makeClips(argv) {
  loadEnv();
  const id = (argv.filter((a) => !a.startsWith("--"))[0] || "").trim();
  if (!id) {
    console.error("usage: factory shorts <rendered-script-id>   (e.g. factory shorts factory-online)");
    return false;
  }

  const propsPath = path.join(repoRoot, "data", "build", id, "props.json");
  const source = path.join(repoRoot, "renders", id, "short.mp4");
  if (!existsSync(propsPath) || !existsSync(source)) {
    console.error(`need both data/build/${id}/props.json and renders/${id}/short.mp4 — render the episode first`);
    return false;
  }

  const props = JSON.parse(readFileSync(propsPath, "utf8"));
  const ranges = sceneRanges(props);
  console.log(`\n${ranges.length} scenes, ${(props.timeline.totalFrames / FPS).toFixed(0)}s total`);

  let windows = await llmWindows(ranges);
  const how = windows ? "llm" : "heuristic";
  if (!windows) windows = heuristicWindows(ranges);
  if (windows.length === 0) {
    console.error("no viable clip windows (episode too short?)");
    return false;
  }

  const results = [];
  windows.forEach((w, n) => {
    const startS = ranges[w.from].start;
    const durS = ranges.slice(w.from, w.to + 1).reduce((a, r) => a + r.dur, 0);
    const out = path.join(repoRoot, "renders", id, `clip-${n + 1}.mp4`);
    console.log(
      `clip ${n + 1}: scenes ${w.from}-${w.to} (${durS.toFixed(0)}s)${w.why ? ` — ${w.why}` : ""} [${how}]`
    );
    const res = spawnSync(
      "ffmpeg",
      ["-y", "-v", "error", "-i", source, "-ss", startS.toFixed(3), "-t", durS.toFixed(3),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", out],
      { encoding: "utf8", timeout: 300000, windowsHide: true }
    );
    if (res.status === 0) results.push(out);
    else console.error(`  ffmpeg failed: ${(res.stderr || "").slice(-400)}`);
  });

  if (!results.length) return false;
  console.log(`\ndone -> ${results.length} clip(s) in renders/${id}/\n`);
  return true;
}
