import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, loadUserConfig, repoRoot } from "../../shared/src/config.js";
import { chat, providerStatus } from "../../llm/src/llm.js";
import { resolveService } from "../../llm/src/tiers.js";
import { ffprobeDuration } from "./voice.js";
import { videoArgs } from "../../shared/src/encoder.js";
import { analyzeFootage, assertTrueColor, deriveGrade } from "./grade.js";
import { editSettings, transcriptionLanguage } from "../../shared/src/config.js";

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

/**
 * Blocks skin-smoothing from ever entering the filter chain.
 *
 * Makeup and nails content exists to show a product's real result on real skin.
 * A beauty filter destroys exactly that, and once a viewer notices one they
 * discount every review that follows. Enforced rather than documented, because
 * "we agreed not to" does not survive a future refactor.
 *
 * Sharpening and grading are fine — they do not fabricate a result.
 */
const SKIN_SMOOTHING = /\b(smartblur|gblur|boxblur|bilateral|removegrain|hqdn3d\s*=\s*[^,]*[4-9]|surfaceblur|deband\s*=\s*[^,]*blur)/i;

export function assertNoSkinSmoothing(filterChain) {
  const hit = String(filterChain).match(SKIN_SMOOTHING);
  if (!hit) return true;
  throw new Error(
    `skin-smoothing filter "${hit[0]}" is not allowed in the edit chain.\n` +
      `  Makeup/nails viewers are judging a product's real result on real skin; smoothing it\n` +
      `  removes the only thing the video is for. Grade, expose and white-balance instead.`
  );
}
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
/** Tiered whisper model — all tiers run locally at $0, trading speed for accuracy. */
function whisperModel() {
  try {
    // Ask the tier registry rather than re-listing the mapping here. The old
    // hardcoded {free,budget,premium} table silently returned "base" for every
    // tier the moment the names changed — a duplicated lookup that fails open
    // is worse than no lookup, because nothing reports the downgrade.
    const cfg = loadUserConfig().serviceTiers || {};
    return resolveService("transcribe", cfg)?.model || "base";
  } catch {
    return "base";
  }
}

/** Is the resolved transcribe tier a cloud one? */
async function cloudOption() {
  try {
    const { resolveService } = await import("../../llm/src/tiers.js");
    const { loadUserConfig } = await import("../../shared/src/config.js");
    const opt = resolveService("transcribe", loadUserConfig().serviceTiers || {});
    return opt?.cloud ? opt : null;
  } catch {
    return null;
  }
}

function transcribe(input, workDir) {
  const w = whisperCmd();
  if (!w) return null;
  const dict = readDictionary();
  const model = whisperModel();
  /* LANGUAGE MATTERS. Left to auto-detect, whisper correctly identified a
     Bengali clip as "bn" and then produced English-looking nonsense from it —
     3 segments for 93 seconds of continuous speech. The small models are
     heavily English-biased, so a non-English shoot needs BOTH an explicit
     language and a larger model; `base` is not usable for Bengali. */
  /* From SETTINGS, not an env var. transcriptionLanguage() prefers
     FACTORY_LANGUAGE when set so a one-off run can override, then falls back to
     what the portal saved. */
  const lang = transcriptionLanguage();
  const args = [input, "--model", model, "--output_format", "json", "--output_dir", workDir, "--word_timestamps", "True"];
  if (lang) args.push("--language", lang);
  if (dict.jargon.length) args.push("--initial_prompt", `Glossary: ${dict.jargon.join(", ")}.`);
  console.log(`  transcribing with ${w.kind} (${model} model${lang ? `, language=${lang}` : ", auto-detect"})...`);
  if (!lang && model === "base") console.log(`    (base + auto-detect is English-biased — set FACTORY_LANGUAGE and a larger tier for other languages)`);
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

/**
 * Measure the noise floor so the silence threshold can be set relative to it.
 * A fixed -35dB is meaningless on footage whose noise floor sits at -24dB.
 */
export function noiseFloor(input) {
  const r = run("ffmpeg", ["-vn", "-i", input, "-af", "aformat=sample_fmts=s16:channel_layouts=mono,volumedetect", "-f", "null", "-"]);
  const m = (r.stderr || "").match(/mean_volume:\s*(-?[\d.]+) dB/);
  return m ? Number(m[1]) : null;
}

export function detectSilences(input, { noise, minSilence, denoise = true, adaptive = true }) {
  /* THREE fixes here, all found by measuring a real DJI clip that produced ZERO
     pauses and therefore an edit that did nothing:
     
     1. `-vn` — the old call decoded the entire HEVC video just to read audio:
        44 seconds, versus 1 second without it.
        
     2. `aformat=sample_fmts=s16` — THE actual bug. AAC decodes to float, and
        both afftdn and silencedetect behave differently on float than on s16.
        Identical audio: 0 pauses as float, 7 as s16. This silently produced
        "no pauses found" on every AAC source, which is every camera file.
        
     3. Denoise BEFORE detecting. The export chain already denoised, but far too
        late to inform the cut decision. On constant wind/handling noise the
        floor never drops and nothing reads as silence.
        
     Zero pauses is not a harmless miss: one segment means no cuts, and no cuts
     means no transitions and no punch-ins, since both alternate across segment
     boundaries. The edit degrades to "the original clip with fades". */
  let threshold = noise;
  if (adaptive) {
    const floor = noiseFloor(input);
    if (floor != null) {
      // Sit above the measured floor: quiet enough to be a pause, loud enough
      // that room tone does not count as speech.
      const suggested = Math.round(floor - 6);
      const asked = Number(String(noise).replace(/dB$/i, ""));
      if (Number.isFinite(asked) && suggested > asked) {
        threshold = `${suggested}dB`;
        console.log(`  noise floor ${floor.toFixed(1)}dB — silence threshold ${threshold} (asked ${noise})`);
      }
    }
  }
  const pre = `aformat=sample_fmts=s16:channel_layouts=mono,aresample=16000,${denoise ? "highpass=f=70,afftdn=nf=-28," : ""}`;
  const res = run("ffmpeg", ["-vn", "-i", input, "-af", `${pre}silencedetect=noise=${threshold}:d=${minSilence}`, "-f", "null", "-"]);
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

/**
 * DEAD SCREEN TIME — the screencast equivalent of silence.
 *
 * Silence detection cannot see this. In a coding or tool-demo recording the
 * expensive dead time is: waiting for a build, reading docs, thinking with a
 * static editor on screen. Often you are still talking over it, so the audio
 * track looks busy while nothing at all happens visually.
 *
 * Only cut a freeze when the audio is ALSO quiet. A frozen screen with live
 * narration is usually the most valuable part of a tutorial — you explaining
 * the thing on screen — and cutting it would gut the video.
 */
export function freezeCuts(input, { minFreeze = 2.5, silences = [] } = {}) {
  const res = run("ffmpeg", ["-hide_banner", "-i", input, "-vf", `freezedetect=n=-60dB:d=${minFreeze}`, "-map", "0:v:0", "-f", "null", "-"]);
  const freezes = [];
  let start = null;
  for (const line of (res.stderr || "").split("\n")) {
    const s = line.match(/freeze_start:\s*([\d.]+)/);
    const e = line.match(/freeze_end:\s*([\d.]+)/);
    if (s) start = parseFloat(s[1]);
    if (e && start !== null) {
      freezes.push({ start, end: parseFloat(e[1]) });
      start = null;
    }
  }

  // keep only the portion of each freeze that is ALSO silent
  const cuts = [];
  for (const f of freezes) {
    for (const s of silences) {
      const from = Math.max(f.start, s.start);
      const to = Math.min(f.end, s.end);
      if (to - from >= minFreeze) cuts.push({ start: from + 0.15, end: to - 0.15, kind: "deadscreen" });
    }
  }
  return cuts.filter((c) => c.end > c.start);
}

/**
 * RETAKE DETECTION — when you say the same line twice, keep the last one.
 *
 * This is the normal way people film makeup, nails and screencasts: fluff a
 * sentence, pause, say it again. The earlier attempt is dead footage that
 * silence-detection cannot see, because the words are perfectly audible.
 *
 * Deliberately deterministic (no LLM): near-identical word shingles close
 * together in time are a retake, and that is a text-matching problem.
 *
 * Conservative by construction, because a wrong cut here deletes real content:
 *   - shingles must be near-identical, not merely similar
 *   - the two takes must be within RETAKE_WINDOW seconds of each other
 *   - a single cut may never exceed RETAKE_MAX_CUT seconds
 *   - total removal is capped at 25% of the footage
 * Repetition for emphasis is usually further apart or reworded, so it survives.
 */
const RETAKE_SHINGLE = 5; // words
const RETAKE_WINDOW = 45; // seconds between takes
const RETAKE_MAX_CUT = 25; // seconds for one retake

const normWord = (w) => String(w).toLowerCase().replace(/[^a-z0-9']/g, "");

export function retakeCuts(words, { duration = Infinity } = {}) {
  if (!words || words.length < RETAKE_SHINGLE * 3) return [];
  const norm = words.map((w) => normWord(w.word));

  // shingle -> indices where it starts
  const seen = new Map();
  for (let i = 0; i + RETAKE_SHINGLE <= norm.length; i++) {
    const key = norm.slice(i, i + RETAKE_SHINGLE).join(" ");
    if (key.replace(/\s/g, "").length < 12) continue; // too short to be distinctive
    (seen.get(key) ?? seen.set(key, []).get(key)).push(i);
  }

  /**
   * ONE cut per retake, anchored on where the retake BEGINS.
   *
   * Pairing every duplicated shingle independently was wrong: for a 10-word
   * line repeated at index 0 and 12, shingle [5,17] yields a cut ending at
   * word 17 — which is inside the good take. Scanning forward and jumping past
   * the second occurrence keeps each cut bounded by the retake boundary.
   */
  const merged = [];
  let i = 0;
  while (i + RETAKE_SHINGLE <= norm.length) {
    const key = norm.slice(i, i + RETAKE_SHINGLE).join(" ");
    const idxs = seen.get(key);
    const next = idxs?.find((j) => j > i);
    if (next === undefined) {
      i++;
      continue;
    }
    const start = words[i].start;
    const end = words[next].start;
    const span = end - start;
    if (span > 0 && span <= RETAKE_WINDOW && span <= RETAKE_MAX_CUT) {
      merged.push({ start: Math.max(0, start - 0.05), end: end - 0.02, kind: "retake" });
      i = next + RETAKE_SHINGLE; // resume after the take we kept
      continue;
    }
    i++;
  }

  const total = merged.reduce((a, c) => a + (c.end - c.start), 0);
  if (Number.isFinite(duration) && total > duration * 0.25) {
    // something is wrong with the transcript (a loop, a stutter) — trust silence
    // detection instead of deleting a quarter of the video
    return [];
  }
  return merged;
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

function buildFilterScript(keeps, { width, height, punch, denoise, keptSec, grade = null, vertical = "all", transition = "fade", xdur = 0.3 }) {
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
  /* TRANSITIONS between segments.
  
     Before this, every cut was a hard cut: `concat` butts segments together and
     the only fades were at the very start and end of the whole video. That is
     what made an auto-edit read as "raw clip with the quiet bits missing".
  
     xfade OVERLAPS neighbours, so three things have to be tracked carefully:
  
     1. Offsets are CUMULATIVE and shrink. Each transition consumes `dur`
        seconds of total runtime, so segment i starts at
        (sum of previous durations) - (i * dur). Getting this wrong desyncs
        audio from video progressively, which looks fine for the first cut and
        obviously broken by the fourth.
  
     2. A transition cannot be longer than the shorter neighbour, or xfade
        consumes a whole segment. Clamped per pair.
  
     3. Audio needs `acrossfade` with the SAME duration, or the audio runs
        longer than the video by (n-1) * dur.
  
     Segments shorter than ~2x the transition are hard-cut instead: dissolving
     a 0.4s clip leaves nothing of it on screen. */
  const wantX = transition !== "none" && keeps.length > 1;
  if (!wantX) {
    lines.push(`${pairs.join("")}concat=n=${keeps.length}:v=1:a=1[vcat][acat];`);
  } else {
    const durs = keeps.map((k) => k.end - k.start);
    let vPrev = "v0";
    let aPrev = "a0";
    let acc = durs[0];
    for (let i = 1; i < keeps.length; i++) {
      // never longer than half the shorter neighbour
      const d = Math.min(xdur, durs[i - 1] / 2, durs[i] / 2);
      const vOut = `vx${i}`;
      const aOut = `ax${i}`;
      if (d < 0.08) {
        // too short to dissolve — butt them together
        lines.push(`[${vPrev}][v${i}]concat=n=2:v=1:a=0[${vOut}];`);
        lines.push(`[${aPrev}][a${i}]concat=n=2:v=0:a=1[${aOut}];`);
        acc += durs[i];
      } else {
        const offset = Math.max(0, acc - d);
        lines.push(`[${vPrev}][v${i}]xfade=transition=${transition}:duration=${d.toFixed(3)}:offset=${offset.toFixed(3)}[${vOut}];`);
        lines.push(`[${aPrev}][a${i}]acrossfade=d=${d.toFixed(3)}[${aOut}];`);
        acc += durs[i] - d;
      }
      vPrev = vOut;
      aPrev = aOut;
    }
    lines.push(`[${vPrev}]null[vcat];`);
    lines.push(`[${aPrev}]anull[acat];`);
    // the whole video is now shorter than the sum of its parts
    keptSec = acc;
  }

  /**
   * NEVER add a skin-smoothing filter here.
   *
   * For makeup and nails content the viewer is evaluating the visible result of
   * a product on real skin. Smoothing (smartblur, gblur on the face, any
   * "beauty filter") destroys the only thing the content is for, and a viewer
   * who spots it stops trusting every future review. This is a trust decision,
   * not a technical one — grade, expose and white-balance freely, but the skin
   * itself must survive the pipeline untouched.
   *
   * `assertNoSkinSmoothing` below enforces it so a future edit cannot quietly
   * reintroduce one.
   */
  // finishing: grade + vignette + sharpen + fades (video), denoise + loudnorm + fades (audio)
  const fadeOut = Math.max(0, keptSec - 0.45).toFixed(2);
  /* The grade is MEASURED from this footage (see grade.js), not a fixed guess.
     It may legitimately be empty when the material needs nothing — applying a
     correction to already-correct footage is itself a defect. Sharpening and
     the vignette stay unconditional: they shape presentation, not colour. */
  const measured = grade && grade.filter ? `${grade.filter},` : "";
  lines.push(
    `[vcat]${measured}unsharp=5:5:0.5:5:5:0.0,vignette=angle=PI/5,` +
      `fade=t=in:st=0:d=0.35,fade=t=out:st=${fadeOut}:d=0.45[vc];`
  );
  const audioChain = [
    denoise ? "highpass=f=70,afftdn=nf=-28" : null,
    "loudnorm=I=-16:TP=-1.5:LRA=11",
    `afade=t=in:st=0:d=0.25,afade=t=out:st=${fadeOut}:d=0.45`,
  ].filter(Boolean).join(",");
  lines.push(`[acat]${audioChain}[ac]`);
  const chain = lines.join("\n");
  assertNoSkinSmoothing(chain);
  // Second half of the same promise: no colour push on colour-critical work.
  assertTrueColor(chain, vertical);
  return chain;
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
    console.error("usage: factory edit <footage.mp4> [--beauty] [--screencast] [--noise=-35dB] [--min-silence=0.45]");
    console.error("  --beauty   makeup/nails: colour is measured and corrected, never pushed");
    console.error("       [--no-punch] [--no-captions] [--no-denoise] [--no-fillers] [--no-backtrack]");
    console.error("       [--no-transcript]  skip whisper entirely - for footage in a language the");
    console.error("                          local model handles badly. Silence cuts, punch-ins,");
    console.error("                          grade, denoise and loudness all still run.");
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
  /* --no-transcript: skip whisper entirely.
  
     `--no-captions` alone does NOT skip it — the condition below is an OR, so
     filler and backtrack detection keep it alive and you save nothing. That is
     the wrong default for footage whose language the local model cannot handle:
     on a Bengali clip `base` produced 3 segments for 93 seconds of speech, and
     cutting fillers or retakes from a transcript that wrong is worse than not
     cutting at all — it removes real speech based on words nobody said.
     
     Everything that does NOT depend on words still runs: silence cuts,
     punch-ins, the measured grade, denoise and loudness. Those are audio- and
     pixel-level and completely language-independent. Whisper is also the
     slowest stage, so skipping it is the single biggest time saving available
     on a long capture. */
  /* Settings first, CLI flags override. Previously every one of these was a
     flag only, so the portal could not express them and a preference had to be
     retyped on every run. */
  const opt = editSettings(flags);
  const noTranscript = !opt.transcript;
  const wantWords = !noTranscript && (opt.captions || opt.fillers || !flags["no-backtrack"]);
  if (noTranscript) console.log("  --no-transcript: skipping whisper (no captions, no filler/retake cuts)");
  let words = null;
  if (wantWords) {
    /* Cloud transcription only when the tier explicitly resolves to it. Falls
       back to local on any failure — a network problem must not lose the edit,
       and a silent downgrade is announced rather than hidden. */
    const cloud = await cloudOption();
    if (cloud) {
      try {
        const { transcribeCloud } = await import("./transcribeCloud.js");
        const r = await transcribeCloud(input, { language: transcriptionLanguage() });
        words = r.words;
        console.log(`  transcribed by ${r.provider}${r.language ? ` (${r.language})` : ""}: ${words.length} words`);
      } catch (e) {
        console.log(`  cloud transcription failed (${String(e.message).slice(0, 120)}) - falling back to local`);
      }
    }
    if (!words) words = transcribe(input, buildDir);
  }
  if (wantWords && !words) console.log("  (no whisper — silence cuts only, no captions)");

  /* 2 — the cut plan */
  process.stdout.write("planning cuts... ");
  const silences = detectSilences(input, cfg);
  const fillers = flags["no-fillers"] ? [] : fillerCuts(words);
  const backtracks = flags["no-backtrack"] ? [] : await backtrackCuts(words);
  // retakes: you fluffed a line and said it again — keep the last attempt.
  // Deterministic, so it works with no AI tier reachable.
  const retakes = !opt.retakes ? [] : retakeCuts(words, { duration: info.duration });
  // screencast mode: also cut stretches where the SCREEN is dead and you are
  // not talking — waiting for a build, reading docs. Off by default because on
  // a talking-head shot a still frame is just you holding a pose.
  const dead = flags.screencast ? freezeCuts(input, { silences }) : [];
  const { keeps } = planKeeps({
    silences,
    extraCuts: [...fillers, ...backtracks, ...retakes, ...dead],
    duration: info.duration,
    ...cfg,
  });
  if (dead.length) {
    const saved = dead.reduce((a, c) => a + (c.end - c.start), 0);
    console.log(`\n  ${dead.length} dead-screen stretch(es) removed — ${saved.toFixed(1)}s of frozen, silent footage`);
  }
  if (retakes.length) {
    const saved = retakes.reduce((a, c) => a + (c.end - c.start), 0);
    console.log(`\n  ${retakes.length} retake(s) removed — ${saved.toFixed(1)}s of repeated takes`);
  }
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

  /* ANALYSE BEFORE GRADING. The old pipeline applied one fixed correction to
     every video, which is a guess — and on makeup/nails a harmful one, because
     it pushed saturation on footage whose entire purpose is showing a real
     shade. Measure the file, then correct only what is actually wrong. */
  const vertical = flags.beauty || flags.makeup || flags.nails ? "beauty" : flags.screencast ? "coding" : "all";
  process.stdout.write("analysing footage... ");
  const stats = analyzeFootage(input);
  const grade = deriveGrade(stats, { vertical });
  console.log(stats ? `${stats.frames} frames sampled` : "could not analyse");
  for (const n of grade.notes) console.log(`  ${n}`);
  if (grade.filter) console.log(`  grade: ${grade.filter}`);
  else console.log(`  grade: none needed — the footage is already right`);

  const filterPath = path.join(buildDir, "filter.txt");
  /* Transition style is a setting, not a hardcode: "fade" is the safe default,
     but a beauty shoot and a screencast want different pacing. --no-transitions
     restores the old hard-cut behaviour. */
  const transition = !opt.transitions ? "none" : String(flags.transition || "fade");
  const xdur = Number(flags["transition-dur"]) || 0.3;
  if (transition !== "none" && keeps.length > 1) {
    console.log(`  transitions: ${transition} ${xdur}s between ${keeps.length} segments`);
  }
  writeFileSync(filterPath, buildFilterScript(keeps, { ...info, /* 1 = no zoom; the filter gates on punch > 1 */ punch: opt.punch ? cfg.punch : 1, denoise: opt.denoise, keptSec, grade, vertical, transition, xdur }));
  const master = path.join(buildDir, "master.mp4");
  process.stdout.write("cutting + finishing (denoise/grade/fades)... ");
  const cut = run("ffmpeg", [
    "-y", "-v", "error", "-i", input,
    "-filter_complex_script", filterPath,
    "-map", "[vc]", "-map", "[ac]",
    ...videoArgs(), "-movflags", "+faststart", "-c:a", "aac", "-b:a", "192k",
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
  if (words && opt.captions) {
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
  const enc = [...videoArgs(), "-movflags", "+faststart", "-c:a", "copy"];
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
  /* Push off-machine, exactly as renderBrief does. Without this an edit lives
     only on this laptop's disk and nobody else can ever see it - which for the
     makeup/nails workflow means the entire output is invisible to the person
     who filmed it. Best-effort and non-throwing: the edit already succeeded and
     a flaky network must not turn it into a failure. */
  try {
    const { pushRender, isConfigured } = await import("../../shared/src/r2.js");
    if (isConfigured()) {
      const r = await pushRender(id, made);
      for (const u of r.uploaded) console.log(`  R2 up  ${path.basename(u.key)}  ${Math.round(u.bytes / 1024)}KB`);
      for (const f of r.failed) console.log(`  R2 fail  ${f.file} - ${f.error}`);
      if (r.uploaded.length) console.log(`  shareable links:  factory r2 url ${id}`);
    }
  } catch (e) {
    console.log(`  R2 push skipped: ${String(e.message).slice(0, 120)}`);
  }

  console.log(`\ndone -> ${made.map((o) => path.relative(repoRoot, o)).join(", ")}\n`);
  console.log(
    `RESULT ${JSON.stringify({ id, outputs: made, kept: keptSec, original: info.duration, fillers: fillers.length, backtracks: backtracks.length, captions: Boolean(wideAss || vertAss) })}`
  );
  return true;
}
