import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot } from "../../shared/src/config.js";
import { chat, providerStatus } from "../../llm/src/llm.js";
import { ffprobeDuration } from "./voice.js";

/**
 * AI Cut — the Auto-Editor. Filmed talking-head footage in, publish-ready
 * edit out:
 *   1. whisper word-level transcript (punctuated), biased by your personal
 *      dictionary (data/dictionary.json)
 *   2. cut plan = silences + filler words (um/uh...) + LLM-detected
 *      self-corrections ("at 2... actually make that 3" keeps only the fix)
 *   3. one ffmpeg pass: jump cuts, alternating punch-ins, noise removal,
 *      loudness normalize, color grade, vignette, sharpen, fade in/out
 *   4. karaoke word-sweep captions (ASS) sized per aspect ratio
 *   5. exports wide.mp4 / short.mp4 into renders/<id>/
 * 100% local — footage never leaves the machine (LLM sees text only).
 */

const DEFAULTS = {
  noise: "-35dB",
  minSilence: 0.45,
  pad: 0.12,
  minKeep: 0.3,
  mergeGap: 0.25,
  punch: 1.08,
};

const FILLER = /^(um+|uh+|uhm+|erm+|hmm+|mhm+|mm+|er|ah+)$/i;
const ACCENT_ASS = "&H0024B2FF"; // #ffb224 in ASS BGR
const WHISPER_ENV = {
  ...process.env,
  PYTHONIOENCODING: "utf-8",
  HF_HOME: path.join(repoRoot, "data", "models"),
};

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, timeout: 1000 * 60 * 30, ...opts });
}

function probe(input) {
  const res = run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "json", input,
  ]);
  if (res.status !== 0) throw new Error(`ffprobe failed: ${(res.stderr || "").slice(-300)}`);
  const s = JSON.parse(res.stdout).streams[0];
  return { width: s.width, height: s.height, duration: ffprobeDuration(input) };
}

/* ---------------- transcription + the cut plan ---------------- */

function whisperCmd() {
  const venvBin = path.join(repoRoot, ".venv", "Scripts");
  const candidates = [
    { cmd: path.join(venvBin, "whisper-ctranslate2.exe"), kind: "whisper-ctranslate2" },
    { cmd: path.join(venvBin, "whisper.exe"), kind: "openai-whisper" },
    { cmd: "whisper", kind: "openai-whisper" },
  ];
  for (const c of candidates) {
    if (run(c.cmd, ["--version"], { timeout: 30000, env: WHISPER_ENV }).status === 0) return c;
  }
  return null;
}

function readDictionary() {
  const p = path.join(repoRoot, "data", "dictionary.json");
  const dict = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
  return { jargon: dict.jargon || [], corrections: dict.corrections || {} };
}

/** Transcribe with word timestamps. Returns flat [{start,end,word}] or null. */
function transcribe(input, workDir) {
  const w = whisperCmd();
  if (!w) return null;
  const dict = readDictionary();
  const args = [input, "--model", "base", "--output_format", "json", "--output_dir", workDir, "--word_timestamps", "True"];
  if (dict.jargon.length) args.push("--initial_prompt", `Glossary: ${dict.jargon.join(", ")}.`);
  console.log(`  transcribing with ${w.kind}...`);
  const res = run(w.cmd, args, { timeout: 1000 * 60 * 60, env: WHISPER_ENV });
  if (res.status !== 0) {
    console.log(`  transcription failed — captions/filler cuts skipped: ${(res.stderr || "").slice(-200)}`);
    return null;
  }
  const jsonPath = path.join(workDir, `${path.basename(input, path.extname(input))}.json`);
  if (!existsSync(jsonPath)) return null;
  const data = JSON.parse(readFileSync(jsonPath, "utf8"));
  const words = [];
  for (const seg of data.segments || []) {
    for (const wd of seg.words || []) {
      let text = wd.word.trim();
      for (const [from, to] of Object.entries(dict.corrections)) {
        text = text.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), to);
      }
      words.push({ start: wd.start, end: wd.end, word: text });
    }
  }
  return words;
}

export function detectSilences(input, { noise, minSilence }) {
  const res = run("ffmpeg", ["-i", input, "-af", `silencedetect=noise=${noise}:d=${minSilence}`, "-f", "null", "-"]);
  const silences = [];
  let start = null;
  for (const line of (res.stderr || "").split("\n")) {
    const s = line.match(/silence_start:\s*([\d.]+)/);
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (s) start = parseFloat(s[1]);
    if (e && start !== null) {
      silences.push({ start, end: parseFloat(e[1]) });
      start = null;
    }
  }
  return silences;
}

/** Filler words ("um", "uh"...) as cut ranges, only when clearly isolated. */
export function fillerCuts(words) {
  if (!words) return [];
  return words
    .filter((w) => FILLER.test(w.word.replace(/[^a-zA-Z]/g, "")))
    .map((w) => ({ start: Math.max(0, w.start - 0.06), end: w.end + 0.06, kind: "filler" }));
}

/** LLM spots self-corrections / false starts; returns cut ranges (or []). */
async function backtrackCuts(words) {
  if (!words || !providerStatus().active) return [];
  const listing = words.map((w, i) => `${i}:${w.word}`).join(" ");
  try {
    const result = await chat({
      task: "score",
      maxTokens: 800,
      system:
        "You clean up spoken-video transcripts. Find self-corrections and false starts where the speaker replaces " +
        'what they just said ("let\'s meet at 2... actually, make that 3" -> cut "at 2... actually," keep "make that 3"; ' +
        '"the best way— the fastest way is" -> cut the abandoned start). Cut ONLY abandoned words; keep the correction. ' +
        'Words are "index:word". Reply ONLY JSON: [{"from":<firstCutIndex>,"to":<lastCutIndex>}] or [].',
      user: listing,
    });
    const s = result.text.indexOf("[");
    const e = result.text.lastIndexOf("]");
    const picks = JSON.parse(result.text.slice(s, e + 1));
    return picks
      .filter((p) => Number.isInteger(p.from) && Number.isInteger(p.to) && words[p.from] && words[p.to] && p.from <= p.to)
      .filter((p) => p.to - p.from < 25) // never let the model delete half the video
      .map((p) => ({ start: Math.max(0, words[p.from].start - 0.05), end: words[p.to].end + 0.05, kind: "backtrack" }));
  } catch {
    return [];
  }
}

/** silences+fillers+backtracks -> merged keep-segments. */
export function planKeeps({ silences, extraCuts, duration, pad, minKeep, mergeGap }) {
  const cuts = [
    ...silences.map((s) => ({ start: s.start + pad, end: s.end - pad })).filter((c) => c.end > c.start),
    ...extraCuts,
  ].sort((a, b) => a.start - b.start);

  const merged = [];
  for (const c of cuts) {
    const prev = merged[merged.length - 1];
    if (prev && c.start <= prev.end + 0.01) prev.end = Math.max(prev.end, c.end);
    else merged.push({ ...c });
  }

  const keeps = [];
  let cursor = 0;
  for (const c of merged) {
    if (c.start > cursor) keeps.push({ start: cursor, end: Math.min(c.start, duration) });
    cursor = Math.max(cursor, c.end);
  }
  if (cursor < duration) keeps.push({ start: cursor, end: duration });

  const joined = [];
  for (const k of keeps) {
    const prev = joined[joined.length - 1];
    if (prev && k.start - prev.end < mergeGap) prev.end = k.end;
    else joined.push({ ...k });
  }
  return { keeps: joined.filter((k) => k.end - k.start >= minKeep), cuts: merged };
}

/* ---------------- the single ffmpeg master pass ---------------- */

function buildFilterScript(keeps, { width, height, punch, denoise, keptSec }) {
  const lines = [];
  const pairs = [];
  keeps.forEach((k, i) => {
    const zoomed = punch > 1 && i % 2 === 1;
    const vf = zoomed
      ? `scale=iw*${punch}:ih*${punch},crop=${width}:${height},scale=${width}:${height}`
      : `scale=${width}:${height}`;
    lines.push(`[0:v]trim=start=${k.start.toFixed(3)}:end=${k.end.toFixed(3)},setpts=PTS-STARTPTS,${vf},setsar=1[v${i}];`);
    lines.push(`[0:a]atrim=start=${k.start.toFixed(3)}:end=${k.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}];`);
    pairs.push(`[v${i}][a${i}]`);
  });
  lines.push(`${pairs.join("")}concat=n=${keeps.length}:v=1:a=1[vcat][acat];`);

  // finishing: grade + vignette + sharpen + fades (video), denoise + loudnorm + fades (audio)
  const fadeOut = Math.max(0, keptSec - 0.45).toFixed(2);
  lines.push(
    `[vcat]eq=contrast=1.05:saturation=1.08:brightness=0.01,unsharp=5:5:0.5:5:5:0.0,vignette=angle=PI/5,` +
      `fade=t=in:st=0:d=0.35,fade=t=out:st=${fadeOut}:d=0.45[vc];`
  );
  const audioChain = [
    denoise ? "highpass=f=70,afftdn=nf=-28" : null,
    "loudnorm=I=-16:TP=-1.5:LRA=11",
    `afade=t=in:st=0:d=0.25,afade=t=out:st=${fadeOut}:d=0.45`,
  ].filter(Boolean).join(",");
  lines.push(`[acat]${audioChain}[ac]`);
  return lines.join("\n");
}

/* ---------------- karaoke captions (ASS) ---------------- */

/** Remap original word times into the edited timeline; drop cut words. */
export function remapWords(words, keeps) {
  if (!words) return null;
  const out = [];
  let offset = 0; // seconds removed before the current keep
  for (const k of keeps) {
    for (const w of words) {
      const mid = (w.start + w.end) / 2;
      if (mid >= k.start && mid < k.end) {
        out.push({ start: w.start - k.start + offset, end: Math.min(w.end, k.end) - k.start + offset, word: w.word });
      }
    }
    offset += k.end - k.start;
  }
  return out;
}

const assTime = (t) => {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = (t % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
};

/** Group words into short lines; each word gets a \kf sweep to the accent color. */
export function buildAss(words, { playX, playY, fontSize, marginV, maxWords }) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${playX}
PlayResY: ${playY}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,Segoe UI,${fontSize},${ACCENT_ASS},&H00FFFFFF,&H00101418,&H96000000,-1,0,0,0,100,100,0,0,1,4,2,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const start = group[0].start;
    const end = group[group.length - 1].end + 0.12;
    const text = group
      .map((w, i) => {
        const until = i < group.length - 1 ? group[i + 1].start : w.end;
        const cs = Math.max(1, Math.round((until - w.start) * 100));
        return `{\\kf${cs}}${w.word.replace(/[{}\\]/g, "")}`;
      })
      .join(" ");
    lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Karaoke,,0,0,0,,${text}`);
    group = [];
  };
  for (const w of words) {
    const prev = group[group.length - 1];
    if (group.length >= maxWords || (prev && w.start - prev.end > 0.8) || (group.length && w.start - group[0].start > 3.2)) flush();
    group.push(w);
    if (/[.!?]$/.test(w.word) && group.length >= 2) flush(); // never straddle sentences
  }
  flush();
  return header + lines.join("\n") + "\n";
}

const subFilter = (assPath) => `subtitles='${assPath.replace(/\\/g, "/").replace(/:/g, "\\:")}'`;

/* ---------------- main ---------------- */

export async function autoEdit(argv) {
  loadEnv();
  const args = argv.filter((a) => !a.startsWith("--"));
  const flags = Object.fromEntries(
    argv.filter((a) => a.startsWith("--")).map((f) => {
      const [k, v] = f.replace(/^--/, "").split("=");
      return [k, v ?? true];
    })
  );
  const input = args[0];
  if (!input || !existsSync(input)) {
    console.error("usage: factory edit <footage.mp4> [--noise=-35dB] [--min-silence=0.45]");
    console.error("       [--no-punch] [--no-captions] [--no-denoise] [--no-fillers] [--no-backtrack]");
    return false;
  }

  const cfg = {
    ...DEFAULTS,
    noise: flags.noise || DEFAULTS.noise,
    minSilence: parseFloat(flags["min-silence"] || DEFAULTS.minSilence),
    punch: flags["no-punch"] ? 1 : DEFAULTS.punch,
  };

  const id = `edit-${path.basename(input, path.extname(input)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)}`;
  const buildDir = path.join(repoRoot, "data", "build", id);
  const outDir = path.join(repoRoot, "renders", id);
  mkdirSync(buildDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  /* 1 — probe + transcript */
  const info = probe(input);
  console.log(`\n${path.basename(input)} — ${info.width}x${info.height}, ${info.duration.toFixed(1)}s`);
  const wantWords = !flags["no-captions"] || !flags["no-fillers"] || !flags["no-backtrack"];
  const words = wantWords ? transcribe(input, buildDir) : null;
  if (wantWords && !words) console.log("  (no whisper — silence cuts only, no captions)");

  /* 2 — the cut plan */
  process.stdout.write("planning cuts... ");
  const silences = detectSilences(input, cfg);
  const fillers = flags["no-fillers"] ? [] : fillerCuts(words);
  const backtracks = flags["no-backtrack"] ? [] : await backtrackCuts(words);
  const { keeps } = planKeeps({ silences, extraCuts: [...fillers, ...backtracks], duration: info.duration, ...cfg });
  if (keeps.length === 0) {
    console.error("nothing to keep — try a lower --noise (e.g. -45dB)");
    return false;
  }
  const keptSec = keeps.reduce((a, k) => a + (k.end - k.start), 0);
  console.log(
    `${silences.length} pauses + ${fillers.length} fillers + ${backtracks.length} self-corrections -> ` +
      `${keeps.length} cuts, ${info.duration.toFixed(1)}s -> ${keptSec.toFixed(1)}s`
  );
  if (!providerStatus().active && !flags["no-backtrack"]) console.log("  (backtracking needs an LLM key — skipped)");

  /* 3 — master pass: cut + punch + denoise + loudnorm + grade + fades */
  const filterPath = path.join(buildDir, "filter.txt");
  writeFileSync(filterPath, buildFilterScript(keeps, { ...info, punch: cfg.punch, denoise: !flags["no-denoise"], keptSec }));
  const master = path.join(buildDir, "master.mp4");
  process.stdout.write("cutting + finishing (denoise/grade/fades)... ");
  const cut = run("ffmpeg", [
    "-y", "-v", "error", "-i", input,
    "-filter_complex_script", filterPath,
    "-map", "[vc]", "-map", "[ac]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-c:a", "aac", "-b:a", "192k",
    master,
  ]);
  if (cut.status !== 0 || !existsSync(master)) {
    console.error(`FAILED:\n${(cut.stderr || "").slice(-800)}`);
    return false;
  }
  console.log("ok");

  /* 4 — karaoke captions, one ASS per aspect */
  let wideAss = null;
  let vertAss = null;
  if (words && !flags["no-captions"]) {
    const mapped = remapWords(
      words.filter((w) => !FILLER.test(w.word.replace(/[^a-zA-Z]/g, ""))),
      keeps
    );
    if (mapped.length) {
      wideAss = path.join(buildDir, "wide.ass");
      vertAss = path.join(buildDir, "vert.ass");
      writeFileSync(wideAss, buildAss(mapped, { playX: 1920, playY: 1080, fontSize: 58, marginV: 84, maxWords: 6 }));
      writeFileSync(vertAss, buildAss(mapped, { playX: 1080, playY: 1920, fontSize: 72, marginV: 320, maxWords: 4 }));
      console.log(`  karaoke captions: ${mapped.length} words`);
    }
  }

  /* 5 — exports */
  const isVertical = info.height > info.width;
  const enc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-c:a", "copy"];
  const outputs = [];
  const shortOut = path.join(outDir, "short.mp4");
  if (isVertical) {
    const vf = ["scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920", vertAss ? subFilter(vertAss) : null].filter(Boolean).join(",");
    run("ffmpeg", ["-y", "-v", "error", "-i", master, "-vf", vf, ...enc, shortOut]);
    outputs.push(shortOut);
  } else {
    const wideOut = path.join(outDir, "wide.mp4");
    const wf = ["scale=1920:1080", wideAss ? subFilter(wideAss) : null].filter(Boolean).join(",");
    const sf = ["crop=ih*9/16:ih,scale=1080:1920", vertAss ? subFilter(vertAss) : null].filter(Boolean).join(",");
    run("ffmpeg", ["-y", "-v", "error", "-i", master, "-vf", wf, ...enc, wideOut]);
    run("ffmpeg", ["-y", "-v", "error", "-i", master, "-vf", sf, ...enc, shortOut]);
    outputs.push(wideOut, shortOut);
  }
  const made = outputs.filter((o) => existsSync(o));
  if (!made.length) {
    console.error("export failed — no outputs written");
    return false;
  }
  console.log(`\ndone -> ${made.map((o) => path.relative(repoRoot, o)).join(", ")}\n`);
  console.log(
    `RESULT ${JSON.stringify({ id, outputs: made, kept: keptSec, original: info.duration, fillers: fillers.length, backtracks: backtracks.length, captions: Boolean(wideAss || vertAss) })}`
  );
  return true;
}
