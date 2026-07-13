import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot } from "../../shared/src/config.js";
import { ffprobeDuration } from "./voice.js";

/**
 * Auto-Editor: filmed talking-head footage -> published-ready edit.
 *   1. ffmpeg silencedetect finds every pause
 *   2. keep-segments (padded, merged) become jump cuts
 *   3. alternate segments get a subtle punch-in so cuts feel intentional
 *   4. loudnorm evens the audio out
 *   5. exports wide.mp4 and/or short.mp4 (center-crop 9:16) into renders/<id>/
 *   6. captions burned in if whisper is installed (optional, auto-detected)
 * 100% local — footage never leaves the machine.
 */

const DEFAULTS = {
  noise: "-35dB", // quieter than this counts as silence
  minSilence: 0.45, // silences shorter than this are kept (natural rhythm)
  pad: 0.12, // seconds of breathing room kept around speech
  minKeep: 0.3, // drop keep-segments shorter than this
  mergeGap: 0.25, // merge keeps separated by less than this
  punch: 1.08, // zoom factor on alternating segments (1 = off)
};

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, timeout: 1000 * 60 * 30, ...opts });
}

function probe(input) {
  const res = run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate",
    "-of", "json", input,
  ]);
  if (res.status !== 0) throw new Error(`ffprobe failed: ${(res.stderr || "").slice(-300)}`);
  const s = JSON.parse(res.stdout).streams[0];
  return { width: s.width, height: s.height, duration: ffprobeDuration(input) };
}

export function detectSilences(input, { noise, minSilence }) {
  const res = run("ffmpeg", ["-i", input, "-af", `silencedetect=noise=${noise}:d=${minSilence}`, "-f", "null", "-"]);
  const text = res.stderr || "";
  const silences = [];
  let start = null;
  for (const line of text.split("\n")) {
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

export function keepSegments(silences, duration, { pad, minKeep, mergeGap }) {
  const keeps = [];
  let cursor = 0;
  for (const s of silences) {
    const end = Math.min(s.start + pad, duration);
    if (end > cursor) keeps.push({ start: cursor, end });
    cursor = Math.max(s.end - pad, cursor);
  }
  if (cursor < duration) keeps.push({ start: cursor, end: duration });

  // merge neighbours separated by a blink, then drop crumbs
  const merged = [];
  for (const k of keeps) {
    const prev = merged[merged.length - 1];
    if (prev && k.start - prev.end < mergeGap) prev.end = k.end;
    else merged.push({ ...k });
  }
  return merged.filter((k) => k.end - k.start >= minKeep);
}

function buildFilterScript(keeps, { width, height, punch }) {
  const lines = [];
  const pairs = [];
  keeps.forEach((k, i) => {
    const zoomed = punch > 1 && i % 2 === 1;
    const vf = zoomed
      ? `scale=iw*${punch}:ih*${punch},crop=${width}:${height},scale=${width}:${height}`
      : `scale=${width}:${height}`;
    lines.push(
      `[0:v]trim=start=${k.start.toFixed(3)}:end=${k.end.toFixed(3)},setpts=PTS-STARTPTS,${vf},setsar=1[v${i}];`
    );
    lines.push(`[0:a]atrim=start=${k.start.toFixed(3)}:end=${k.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}];`);
    pairs.push(`[v${i}][a${i}]`);
  });
  lines.push(`${pairs.join("")}concat=n=${keeps.length}:v=1:a=1[vc][rawa];`);
  lines.push(`[rawa]loudnorm=I=-16:TP=-1.5:LRA=11[ac]`);
  return lines.join("\n");
}

function whisperCmd() {
  const venvBin = path.join(repoRoot, ".venv", "Scripts");
  const candidates = [
    { cmd: path.join(venvBin, "faster-whisper.exe"), kind: "faster-whisper" },
    { cmd: "whisper-cli", kind: "whisper.cpp" },
    { cmd: path.join(venvBin, "whisper.exe"), kind: "openai-whisper" },
    { cmd: "whisper", kind: "openai-whisper" },
  ];
  for (const c of candidates) {
    const res = run(c.cmd, ["--help"], { timeout: 20000 });
    if (res.status === 0) return c;
  }
  return null;
}

function burnCaptions(master, outFile, workDir) {
  const w = whisperCmd();
  if (!w) return { done: false, reason: "whisper not installed (factory doctor lists install options)" };
  console.log(`  transcribing with ${w.kind}...`);
  const res =
    w.kind === "openai-whisper"
      ? run(w.cmd, [master, "--model", "base", "--output_format", "srt", "--output_dir", workDir], { timeout: 1000 * 60 * 60 })
      : run(w.cmd, ["-f", master, "--output-srt", "--output-file", path.join(workDir, "master")], { timeout: 1000 * 60 * 60 });
  if (res.status !== 0) return { done: false, reason: `whisper failed: ${(res.stderr || "").slice(-300)}` };
  const srt = path.join(workDir, `${path.basename(master, path.extname(master))}.srt`);
  const srtAlt = path.join(workDir, "master.srt");
  const srtFile = existsSync(srt) ? srt : existsSync(srtAlt) ? srtAlt : null;
  if (!srtFile) return { done: false, reason: "whisper produced no srt" };
  // ffmpeg subtitles filter needs forward slashes + escaped colon on Windows
  const srtEsc = srtFile.replace(/\\/g, "/").replace(/:/g, "\\:");
  const style = "FontName=Segoe UI,FontSize=14,Bold=1,PrimaryColour=&Hffffff,OutlineColour=&H80000000,BorderStyle=1,Outline=2,MarginV=40";
  const burn = run("ffmpeg", ["-y", "-v", "error", "-i", master, "-vf", `subtitles='${srtEsc}':force_style='${style}'`, "-c:a", "copy", outFile]);
  if (burn.status !== 0) return { done: false, reason: `caption burn failed: ${(burn.stderr || "").slice(-300)}` };
  return { done: true };
}

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
    console.error('usage: factory edit <footage.mp4> [--noise=-35dB] [--min-silence=0.45] [--no-punch] [--no-captions]');
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

  /* 1-2 — find silences, plan cuts */
  const info = probe(input);
  console.log(`\n${path.basename(input)} — ${info.width}x${info.height}, ${info.duration.toFixed(1)}s`);
  process.stdout.write("detecting silences... ");
  const silences = detectSilences(input, cfg);
  const keeps = keepSegments(silences, info.duration, cfg);
  if (keeps.length === 0) {
    console.error("nothing to keep — the whole file reads as silence. Try a lower --noise (e.g. -45dB).");
    return false;
  }
  const keptSec = keeps.reduce((a, k) => a + (k.end - k.start), 0);
  console.log(`${silences.length} pauses -> ${keeps.length} cuts, ${info.duration.toFixed(1)}s -> ${keptSec.toFixed(1)}s (${Math.round((1 - keptSec / info.duration) * 100)}% trimmed)`);

  /* 3-4 — cut + punch + normalize into an edited master */
  const filterPath = path.join(buildDir, "filter.txt");
  writeFileSync(filterPath, buildFilterScript(keeps, { ...info, punch: cfg.punch }));
  const master = path.join(buildDir, "master.mp4");
  process.stdout.write("cutting + normalizing... ");
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

  /* captions (optional) */
  let masterOut = master;
  if (!flags["no-captions"]) {
    const captioned = path.join(buildDir, "master-cc.mp4");
    const cc = burnCaptions(master, captioned, buildDir);
    if (cc.done) {
      masterOut = captioned;
      console.log("  captions burned in");
    } else console.log(`  captions skipped — ${cc.reason}`);
  }

  /* 5 — exports. vertical source -> short only; horizontal -> wide + center-crop short */
  const isVertical = info.height > info.width;
  const outputs = [];
  if (isVertical) {
    const shortOut = path.join(outDir, "short.mp4");
    run("ffmpeg", ["-y", "-v", "error", "-i", masterOut, "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-c:a", "copy", shortOut]);
    outputs.push(shortOut);
  } else {
    const wideOut = path.join(outDir, "wide.mp4");
    const shortOut = path.join(outDir, "short.mp4");
    run("ffmpeg", ["-y", "-v", "error", "-i", masterOut, "-vf", "scale=1920:1080", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-c:a", "copy", wideOut]);
    run("ffmpeg", ["-y", "-v", "error", "-i", masterOut, "-vf", "crop=ih*9/16:ih,scale=1080:1920", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-c:a", "copy", shortOut]);
    outputs.push(wideOut, shortOut);
  }
  const made = outputs.filter((o) => existsSync(o));
  if (made.length === 0) {
    console.error("export failed — no outputs written");
    return false;
  }
  console.log(`\ndone -> ${made.map((o) => path.relative(repoRoot, o)).join(", ")}\n`);
  console.log(`RESULT ${JSON.stringify({ id, outputs: made, kept: keptSec, original: info.duration })}`);
  return true;
}
