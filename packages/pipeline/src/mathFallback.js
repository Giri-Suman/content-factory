import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

const stamp = (seconds) => {
  const ms = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor(ms / 60000) % 60;
  const secs = Math.floor(ms / 1000) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

/** A readable caption every six spoken words, timed from the voice output. */
export function mathCaptionsSrt(words = []) {
  const cues = [];
  for (let i = 0; i < words.length; i += 6) {
    const group = words.slice(i, i + 6);
    const text = group.map((item) => String(item.word || "")).join(" ").trim();
    if (!text) continue;
    cues.push(`${cues.length + 1}\n${stamp(group[0].start)} --> ${stamp(group.at(-1).end)}\n${text}`);
  }
  return cues.join("\n\n") + (cues.length ? "\n" : "");
}

/** Finish a usable short when Remotion's browser cannot load the local scene. */
export function renderMathFallback({ video, audio, words, out, durationSec, workdir }) {
  const captions = mathCaptionsSrt(words);
  const subtitleFile = path.join(workdir, "fallback.srt");
  if (captions) writeFileSync(subtitleFile, captions);
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-stream_loop", "-1", "-i", video, "-i", audio,
    ...(captions ? ["-vf", "subtitles=fallback.srt:force_style='FontSize=48'"] : []),
    "-map", "0:v:0", "-map", "1:a:0", "-t", String(durationSec),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-af", "apad=pad_dur=0.6", "-movflags", "+faststart", out,
  ];
  const result = spawnSync("ffmpeg", args, { cwd: workdir, encoding: "utf8", timeout: 15 * 60 * 1000, windowsHide: true });
  if (result.status !== 0) {
    console.error("ffmpeg overlay fallback failed:", (result.stderr || result.error?.message || "").slice(-1800));
    return false;
  }
  return true;
}
