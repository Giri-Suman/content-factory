import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot } from "../../shared/src/config.js";

/**
 * Long-form -> Shorts miner, for YOUR OWN local footage.
 *
 * Deliberately NOT a YouTube downloader: re-cutting other people's videos
 * is both a ToS violation and exactly the reupload/slop pattern the whole
 * compliance layer exists to avoid. Point it at a file you recorded.
 *
 * How it finds candidates without an LLM: speech density. It maps where you
 * talk continuously (via silencedetect), scores windows by talk-ratio, and
 * prefers windows that START right after a pause — a natural sentence
 * opening, which is what makes a clip feel like it begins on purpose.
 */

const run = (args) => spawnSync("ffmpeg", args, { encoding: "utf8", windowsHide: true, timeout: 1000 * 60 * 20 });

/**
 * Usable duration = the SHORTER of the video and audio streams. A file whose
 * streams disagree (common after a sloppy concat, or a recording that dropped
 * video) would otherwise produce clips past the end of the picture.
 */
function duration(file) {
  const probe = (args) => Number(spawnSync("ffprobe", ["-v", "error", ...args, "-of", "csv=p=0", file], { encoding: "utf8", windowsHide: true }).stdout || 0);
  const container = probe(["-show_entries", "format=duration"]);
  const video = probe(["-select_streams", "v:0", "-show_entries", "stream=duration"]);
  const audio = probe(["-select_streams", "a:0", "-show_entries", "stream=duration"]);
  const streams = [video, audio].filter((d) => d > 0);
  const usable = streams.length ? Math.min(...streams) : container;
  if (video > 0 && audio > 0 && Math.abs(video - audio) > 2) {
    console.log(`  ⚠ streams disagree (video ${Math.round(video)}s vs audio ${Math.round(audio)}s) — scanning only the first ${Math.round(usable)}s`);
  }
  return usable;
}

function silences(file) {
  const r = run(["-i", file, "-af", "silencedetect=noise=-32dB:d=0.6", "-f", "null", "-"]);
  const out = [];
  let start = null;
  for (const line of (r.stderr || "").split("\n")) {
    const s = line.match(/silence_start:\s*([\d.]+)/);
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (s) start = Number(s[1]);
    if (e && start !== null) {
      out.push({ start, end: Number(e[1]) });
      start = null;
    }
  }
  return out;
}

/** Score every candidate window by how much of it is actual speech. */
export function findClipWindows(file, { clipSec = 40, stepSec = 10 } = {}) {
  const total = duration(file);
  if (!total) throw new Error(`can't read ${file}`);
  const sil = silences(file);
  const silentAt = (t) => sil.some((s) => t >= s.start && t <= s.end);
  const silentBetween = (a, b) =>
    sil.reduce((acc, s) => acc + Math.max(0, Math.min(b, s.end) - Math.max(a, s.start)), 0);

  const windows = [];
  for (let t = 0; t + clipSec <= total; t += stepSec) {
    const quiet = silentBetween(t, t + clipSec);
    const talkRatio = 1 - quiet / clipSec;
    // a clip that opens right after a pause starts on a sentence, not mid-word
    const cleanStart = sil.some((s) => Math.abs(s.end - t) < 1.2) || t === 0;
    windows.push({
      start: Math.round(t * 10) / 10,
      end: Math.round((t + clipSec) * 10) / 10,
      talkRatio: Math.round(talkRatio * 100) / 100,
      cleanStart,
      score: Math.round((talkRatio * (cleanStart ? 1.15 : 1)) * 100) / 100,
    });
  }
  // keep the best, non-overlapping
  const chosen = [];
  for (const w of windows.sort((a, b) => b.score - a.score)) {
    if (chosen.some((c) => w.start < c.end && w.end > c.start)) continue;
    chosen.push(w);
  }
  return { total: Math.round(total), candidates: chosen, scanned: windows.length };
}

/** Cut the top-N windows to vertical Shorts (then run them through AI Cut). */
export async function mineLongform(argv = []) {
  loadEnv();
  const args = argv.filter((a) => !a.startsWith("--"));
  const file = args[0];
  if (!file || !existsSync(file)) {
    console.error("usage: factory longform <your-own-recording.mp4> [count] [--clip=40] [--keep-wide]");
    console.error("  (your own footage only — this is not a downloader for other people's videos)");
    return false;
  }
  const count = Number(args[1]) > 0 ? Number(args[1]) : 3;
  const clipSec = Number((argv.find((a) => a.startsWith("--clip=")) || "").split("=")[1]) || 40;

  console.log(`\nscanning ${path.basename(file)} for clip-worthy windows...`);
  const { total, candidates, scanned } = findClipWindows(file, { clipSec });
  const picks = candidates.slice(0, count);
  console.log(`  ${Math.floor(total / 60)}m${total % 60}s source · ${scanned} windows scanned · top ${picks.length}:\n`);
  for (const [i, p] of picks.entries()) {
    console.log(`  ${i + 1}. ${String(p.start).padStart(6)}s -> ${p.end}s   talk ${Math.round(p.talkRatio * 100)}%${p.cleanStart ? "  (clean start)" : ""}`);
  }
  if (!picks.length) {
    console.log("  no continuous-speech windows found — is there speech in this file?");
    return false;
  }

  const id = `longform-${path.basename(file, path.extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32)}`;
  const outDir = path.join(repoRoot, "renders", id);
  mkdirSync(outDir, { recursive: true });

  const made = [];
  for (const [i, p] of picks.entries()) {
    const out = path.join(outDir, `clip-${i + 1}.mp4`);
    const vf = argv.includes("--keep-wide") ? "scale=1920:1080" : "crop=ih*9/16:ih,scale=1080:1920";
    const r = run(["-y", "-v", "error", "-ss", String(p.start), "-t", String(clipSec), "-i", file, "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", out]);
    if (r.status === 0 && existsSync(out)) made.push(out);
  }

  console.log(`\ndone -> ${made.length} clip(s) in renders/${id}/`);
  console.log(`next: factory edit renders/${id}/clip-1.mp4   (AI Cut adds captions + tightens it)\n`);
  console.log(`RESULT ${JSON.stringify({ id, clips: made.length, sourceSec: total })}`);
  return true;
}
