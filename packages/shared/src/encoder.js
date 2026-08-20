/**
 * VIDEO ENCODER SELECTION — hardware when it exists, x264 when it does not.
 *
 * MEASURED on this machine (Intel i3-7020U, 2 cores / 15W, HD Graphics 620),
 * 63s of 1080p, SSIM against the original source:
 *
 *   x264 veryfast crf19   SSIM 0.998603   1.88x realtime   4.22MB   <- was the default
 *   QSV global_quality 21 SSIM 0.998571   3.85x realtime   5.48MB
 *   QSV global_quality 18 SSIM 0.998847   3.66x realtime   6.77MB   <- chosen
 *
 * So QSV at gq18 is BETTER quality than the old default and ~1.95x faster. The
 * cost is ~60% more bytes, which does not matter here: a finished short is ~3MB
 * against a 10GB free tier, and YouTube re-encodes on upload anyway. Speed and
 * quality were the scarce resources on a 2-core laptop; storage was not.
 *
 * gq21 was rejected despite being the same speed — it scores slightly WORSE than
 * the x264 baseline, and the point of this change was not to trade quality away.
 * `-preset slow` was rejected too: SSIM 0.998852 vs 0.998847 is not a real
 * difference, and it costs most of the speed gain.
 *
 * The indirect win matters more than the numbers on a 2-core machine: QSV runs
 * on the iGPU, so encoding stops competing with whisper for the only two cores
 * available.
 *
 * FALLBACK IS MANDATORY, not politeness. GitHub Actions runners have no Intel
 * iGPU, and neither does every machine this repo might run on. Detection is
 * cached because probing costs a process spawn and the answer cannot change
 * within a run.
 */

import { spawnSync } from "node:child_process";

const QUALITY = Number(process.env.FACTORY_QSV_QUALITY || 18);

let cached = null;

/** Does this ffmpeg actually encode with QSV? Compiled-in is not the same as working. */
export function hasQsv() {
  if (cached !== null) return cached;
  if (process.env.FACTORY_FORCE_X264 === "1") return (cached = false);

  const listed = spawnSync("ffmpeg", ["-hide_banner", "-encoders"], { encoding: "utf8", windowsHide: true, timeout: 20000 });
  if (listed.status !== 0 || !/h264_qsv/.test(listed.stdout || "")) return (cached = false);

  /* Listed but non-functional is the common case — the encoder is compiled in
     on every Windows build, and fails at runtime without the Intel driver. So
     actually encode one frame rather than trusting the list. */
  const probe = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=256x256:d=0.1", "-c:v", "h264_qsv", "-f", "null", "-"],
    { encoding: "utf8", windowsHide: true, timeout: 30000 }
  );
  return (cached = probe.status === 0);
}

const X264 = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "19"];
const QSV = ["-c:v", "h264_qsv", "-global_quality", String(QUALITY), "-preset", "faster"];

/**
 * WHICH ENCODER IS BEST DEPENDS ON THE CONTENT. Measured SSIM, same machine:
 *
 *   content                x264        QSV gq18    better
 *   clean / rendered       0.998603    0.998847    QSV   (+0.024%)
 *   light grain (phone)    0.959154    0.958473    x264  (+0.068%)
 *   moderate grain         0.908689    0.901706    x264  (+0.698%)
 *   heavy grain            0.899897    0.898449    x264  (+0.161%)
 *
 * Hardware encoders allocate bits differently and lose ground on the
 * high-entropy detail that sensor noise produces. Rendered video has none of
 * that, which is why QSV wins there and loses on camera footage — and why a
 * single global choice would be wrong in one direction or the other.
 *
 *   source: "render"  Remotion/Manim output — synthetic, clean  -> QSV
 *   source: "camera"  footage someone filmed                    -> x264
 *
 * Camera work is where the speed would help most (a 60-minute edit), so this
 * costs real time. It is still the right default: the instruction was that
 * quality must not be compromised, and on camera footage QSV measurably does.
 * Set FACTORY_FAST_CAMERA=1 to take the ~2x speedup and the small quality hit.
 */
export function videoArgs({ source = "camera" } = {}) {
  if (!hasQsv()) return X264;
  if (source === "render") return QSV;
  return process.env.FACTORY_FAST_CAMERA === "1" ? QSV : X264;
}

/** One-line description for logs, so which encoder ran is never a mystery. */
export function encoderLabel({ source = "camera" } = {}) {
  const args = videoArgs({ source });
  return args === QSV ? `h264_qsv (iGPU, gq${QUALITY})` : "libx264 veryfast crf19 (CPU)";
}
