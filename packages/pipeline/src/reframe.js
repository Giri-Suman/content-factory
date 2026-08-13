import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot } from "../../shared/src/config.js";

/**
 * Smart 16:9 -> 9:16 reframe.
 *
 * The pipeline center-crops, which is fine for code on screen and wrong for
 * anything filmed: a makeup application sitting camera-left, a nail macro on
 * the right, a whiteboard off-center — center-crop slices the subject in half.
 *
 * Two honest modes, no ML model required:
 *   focus=left|center|right   you know where the subject is; pick it.
 *   focus=auto                sample frames, find where the MOTION is (the
 *                             hands/brush/pen — the thing being demonstrated)
 *                             and center the crop there.
 *
 * `auto` reports the confidence it has, and falls back to center when the
 * signal is weak rather than guessing.
 */

const ff = (args) => spawnSync("ffmpeg", args, { encoding: "utf8", windowsHide: true, timeout: 1000 * 60 * 15 });

function probeSize(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,duration", "-of", "csv=p=0", file], { encoding: "utf8", windowsHide: true });
  const [w, h, d] = (r.stdout || "").trim().split(",");
  return { w: Number(w), h: Number(h), dur: Number(d) || 0 };
}

/**
 * Find the horizontal band with the most motion, by sampling frames and
 * asking ffmpeg's `cropdetect` where the non-static content sits. We split
 * the frame into thirds and compare per-third frame-difference energy using
 * the `signalstats` filter on cropped strips — cheap and model-free.
 */
export function detectFocus(file, { samples = 3 } = {}) {
  const { w, h, dur } = probeSize(file);
  if (!w || !h) throw new Error(`can't read ${file}`);
  if (h > w) return { focus: "center", confidence: 1, reason: "already vertical — no reframe needed", w, h };

  const cropW = Math.round((h * 9) / 16);
  const maxX = w - cropW;
  const positions = { left: 0, center: Math.round(maxX / 2), right: maxX };

  // motion energy per third: mean absolute frame delta inside each strip
  const energy = {};
  for (const [name, x] of Object.entries(positions)) {
    const r = ff([
      "-ss", String(Math.max(0, dur * 0.15)),
      "-t", String(Math.min(8, Math.max(2, dur * 0.5))),
      "-i", file,
      "-vf", `crop=${cropW}:${h}:${x}:0,fps=${samples},tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG`,
      "-f", "null", "-",
    ]);
    const vals = [...(r.stderr || "").matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
    energy[name] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }

  const ranked = Object.entries(energy).sort((a, b) => b[1] - a[1]);
  const [best, bestVal] = ranked[0];
  const [, worstVal] = ranked[ranked.length - 1];
  // confidence = how much the winner stands out; flat energy means "no idea"
  const spread = bestVal > 0 ? (bestVal - worstVal) / bestVal : 0;
  const confident = spread >= 0.15;

  return {
    focus: confident ? best : "center",
    confidence: Math.round(spread * 100) / 100,
    reason: confident ? `most motion in the ${best} third` : "motion evenly spread — center is the safe choice",
    energy,
    w,
    h,
    cropW,
    x: positions[confident ? best : "center"],
  };
}

export async function reframe(argv = []) {
  loadEnv();
  const args = argv.filter((a) => !a.startsWith("--"));
  const file = args[0];
  if (!file || !existsSync(file)) {
    console.error("usage: factory reframe <video.mp4> [--focus=auto|left|center|right] [--out=path]");
    return false;
  }
  const rawFocus = (argv.find((a) => a.startsWith("--focus=")) || "").split("=")[1] || "auto";

  const det = detectFocus(file);
  if (det.reason.includes("already vertical")) {
    console.log(`${path.basename(file)} is already ${det.w}x${det.h} — nothing to reframe`);
    return true;
  }

  let focus = rawFocus;
  if (rawFocus === "auto") {
    focus = det.focus;
    console.log(`\nauto-focus: ${focus.toUpperCase()} (confidence ${det.confidence}) — ${det.reason}`);
    console.log(`  motion energy: ${Object.entries(det.energy).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(" · ")}`);
  }
  const positions = { left: 0, center: Math.round((det.w - det.cropW) / 2), right: det.w - det.cropW };
  const x = positions[focus] ?? positions.center;

  const outFlag = (argv.find((a) => a.startsWith("--out=")) || "").split("=")[1];
  const out = outFlag || path.join(repoRoot, "renders", "reframed", `${path.basename(file, path.extname(file))}-9x16.mp4`);
  mkdirSync(path.dirname(out), { recursive: true });

  console.log(`\nreframing ${det.w}x${det.h} -> 1080x1920, crop x=${x} (${focus})...`);
  const r = ff(["-y", "-v", "error", "-i", file, "-vf", `crop=${det.cropW}:${det.h}:${x}:0,scale=1080:1920`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-c:a", "copy", out]);
  if (r.status !== 0 || !existsSync(out)) {
    console.error(`reframe FAILED: ${(r.stderr || "").slice(-200)}`);
    return false;
  }
  console.log(`done -> ${path.relative(repoRoot, out)}\n`);
  console.log(`RESULT ${JSON.stringify({ out, focus, confidence: det.confidence, from: `${det.w}x${det.h}` })}`);
  return true;
}
