import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./config.js";
import { MODEL_LICENSES, licenseOf } from "./licenses.js";

/**
 * CAPABILITY REGISTRY — what this machine can actually do, right now.
 *
 * The point is to separate three things a feature list conflates:
 *   built     the code exists in this repo and runs
 *   available the external tool/model is installed and reachable
 *   possible  it would work here if installed
 *
 * A capability that is "built" but whose binary is missing is not a feature,
 * it is a promise. And on this machine some are genuinely NOT possible:
 * C: has ~4.5GB free and CLAUDE.md forbids native modules, so multi-GB
 * diffusion weights are a deliberate no, not an oversight.
 *
 * Nothing here installs anything. It reports.
 */

const has = (cmd, args = ["--version"]) => {
  try {
    return spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, timeout: 15000 }).status === 0;
  } catch {
    return false;
  }
};

const venvBin = (exe) => path.join(repoRoot, ".venv", "Scripts", exe);
const hasVenv = (exe) => existsSync(venvBin(exe));

/**
 * status:
 *   live      built here and its dependencies are present
 *   built     built here, dependency missing (name the dependency)
 *   adapter   contract defined, needs GPU/weights this machine cannot host
 *   nongoal   deliberately not built, with the reason
 */
export const CAPABILITIES = [
  /* ---------------- discovery ---------------- */
  { id: "trend-scrape", stage: "discover", label: "Trend scraping", detail: "17 sources across 6 kinds", check: () => true },
  { id: "competitor-watch", stage: "discover", label: "Competitor monitoring", detail: "watchlist + shorts outliers", check: () => true },
  { id: "comment-mining", stage: "discover", label: "Comment mining", detail: "questions -> topic queue", check: () => true },
  { id: "clustering", stage: "discover", label: "Topic clustering", detail: "LLM grouping + evidence floor", check: () => true },
  { id: "gap-analysis", stage: "discover", label: "Content gap analysis", detail: "catalog gaps vs published", check: () => true },
  { id: "seasonal", stage: "discover", label: "Seasonal calendar", detail: "India festival + exam + placement windows", check: () => true },
  { id: "keyword-gap", stage: "discover", label: "Keyword/search demand", detail: "autocomplete proxy", check: () => true },
  {
    id: "competitor-transcripts",
    stage: "discover",
    label: "Competitor transcript mining",
    status: "nongoal",
    detail: "needs yt-dlp against other people's videos — a ToS violation and the reupload pattern the compliance layer exists to prevent",
  },

  /* ---------------- script ---------------- */
  { id: "hooks", stage: "script", label: "Hook variants", detail: "3+ per brief, scored", check: () => true },
  { id: "beat-sheet", stage: "script", label: "Beat sheet", detail: "timed beats per scene", check: () => true },
  { id: "shot-list", stage: "script", label: "Shot list", detail: "7 niche packs", check: () => true },
  { id: "pacing", stage: "script", label: "Pacing check", detail: "WPS vs target duration", check: () => true },
  { id: "script-critique", stage: "script", label: "Script critique loop", detail: "scriptJudge + regenerate", check: () => true },
  { id: "teleprompter", stage: "script", label: "Teleprompter", detail: "speed-matched output", check: () => true },
  { id: "multi-language", stage: "script", label: "Multi-language captions", detail: "line-aligned SRT translation", check: () => true },

  /* ---------------- render ---------------- */
  { id: "remotion", stage: "render", label: "Composition engine", license: "remotion", detail: "4 aspect ratios", check: () => existsSync(path.join(repoRoot, "renderers", "code-report", "package.json")) },
  { id: "syntax", stage: "render", label: "Syntax highlighting", license: "shiki", detail: "Shiki code frames", check: () => true },
  { id: "terminal", stage: "render", label: "Terminal simulation", detail: "timed fake shell", check: () => true },
  { id: "manim", stage: "render", label: "Math animation", license: "manim", detail: "+ layout lint & one revision pass", check: () => hasVenv("python.exe") },
  { id: "motion-lab", stage: "render", label: "Motion effects", detail: "22 effects, measured", check: () => true },
  { id: "data-variants", stage: "render", label: "Data-driven variants", detail: "one composition + JSON props = N videos", check: () => true },
  { id: "batch-render", stage: "render", label: "Batch render queue", detail: "cost-capped", check: () => true },
  {
    id: "ai-broll", stage: "render", label: "AI B-roll (Wan 2.2)", license: "wan-2.2", status: "adapter",
    detail: "Apache-2.0 and commercially safe, but needs 12GB VRAM minimum. Rent cloud GPU by the hour; local only pays above ~100-200 videos/month",
  },
  {
    id: "image-gen", stage: "render", label: "Background/thumbnail generation", license: "flux.2-klein", status: "adapter",
    detail: "~13GB weights. C: has ~4.5GB free — would need to live on D: with a GPU present",
  },

  /* ---------------- capture ---------------- */
  { id: "ai-cut", stage: "capture", label: "AI Cut", detail: "silence + filler + backtrack cuts", check: () => true },
  { id: "scene-detect", stage: "capture", label: "Scene detection", detail: "ffmpeg-based", check: () => true },
  { id: "smart-reframe", stage: "capture", label: "Smart 16:9 -> 9:16", detail: "motion-energy tracking, not centre-crop", check: () => true },
  { id: "longform-mine", stage: "capture", label: "Shorts from your own long recording", detail: "your footage only", check: () => true },
  { id: "evidence-capture", stage: "capture", label: "Evidence capture (screenshots)", detail: "system Chrome — landing/pricing/docs/mobile, attachable as claim receipts", check: () => true },
  {
    id: "interaction-capture", stage: "capture", label: "Interaction flows (Playwright)", status: "adapter",
    detail: "the one thing headless Chrome cannot do: click through a flow, fill a form, capture a logged-in state. Playwright ships its own browser bundle (hundreds of MB) — worth it once a tool review needs a walkthrough, not before",
  },
  {
    id: "obs-control", stage: "capture", label: "OBS recording automation", status: "adapter",
    detail: "OBS WebSocket API — scene switching and hotkey chapter markers. Worth building when recording volume justifies it",
  },
  {
    id: "bg-removal", stage: "capture", label: "Background removal (RVM)", license: "rvm", status: "adapter",
    detail: "GPL-3.0, GPU. Output is yours; copyleft only matters if redistributing the tool",
  },
  { id: "upscale", stage: "capture", label: "Upscaling (Real-ESRGAN)", license: "real-esrgan", status: "adapter", detail: "rescue low-res phone footage; needs GPU" },
  { id: "interpolate", stage: "capture", label: "Frame interpolation (RIFE)", license: "rife", status: "adapter", detail: "30->60fps, free slow-motion; needs GPU" },
  { id: "lipsync", stage: "capture", label: "Lip sync (MuseTalk / LatentSync)", license: "musetalk", status: "adapter", detail: "commercial-safe alternatives to Wav2Lip, which is BLOCKED by its LRS2 dataset licence" },

  /* ---------------- audio ---------------- */
  { id: "tts", stage: "audio", label: "Text to speech", license: "windows-sapi", detail: "SAPI local + ElevenLabs tiers", check: () => process.platform === "win32" },
  { id: "transcribe", stage: "audio", label: "Transcription + word timings", license: "faster-whisper", detail: "4 local model sizes", check: () => hasVenv("whisper-ctranslate2.exe") || has("whisper") },
  { id: "loudnorm", stage: "audio", label: "Loudness normalisation", detail: "EBU R128", check: () => has("ffmpeg", ["-version"]) },
  { id: "denoise", stage: "audio", label: "Noise reduction", detail: "ffmpeg afftdn", check: () => has("ffmpeg", ["-version"]) },
  { id: "stock-audio", stage: "audio", label: "Music & b-roll search", detail: "licensed library links", check: () => true },
  {
    id: "kokoro", stage: "audio", label: "Kokoro TTS (local, free)", license: "kokoro-82m", status: "adapter",
    detail: "Apache-2.0, CPU-only, ~36x realtime on a free Colab T4 — the best zero-cost replacement for paid TTS. Needs a Python package, not a GPU",
  },
  {
    id: "voice-clone", stage: "audio", label: "Voice cloning (Chatterbox)", license: "chatterbox", status: "adapter",
    detail: "MIT, ~6GB VRAM, clones from ~10s of reference audio",
  },
  {
    id: "music-gen", stage: "audio", label: "Music generation (ACE-Step)", license: "ace-step", status: "adapter",
    detail: "MIT, under 4GB VRAM, a full track in seconds — the most achievable GPU addition here",
  },

  /* ---------------- captions & package ---------------- */
  { id: "karaoke-captions", stage: "package", label: "Karaoke captions", detail: "rendered from word timings", check: () => true },
  { id: "srt-vtt", stage: "package", label: "SRT/VTT sidecars", detail: "indexed for search", check: () => true },
  { id: "reading-speed", stage: "package", label: "Reading-speed check", detail: "chars-per-second limit", check: () => true },
  { id: "thumbnails", stage: "package", label: "Thumbnail variants", detail: "2 variants, judged", check: () => true },
  { id: "chapters", stage: "package", label: "Chapters", detail: "from beats", check: () => true },
  { id: "faststart", stage: "package", label: "Streaming-optimised MP4", detail: "moov atom moved to the front", check: () => true },
  { id: "metadata", stage: "package", label: "Metadata & SEO", detail: "titles, description, tags", check: () => true },

  /* ---------------- publish & learn ---------------- */
  { id: "yt-publish", stage: "publish", label: "YouTube upload", detail: "private-first, disclosure set", check: () => Boolean(process.env.YT_CLIENT_ID) },
  { id: "idempotency", stage: "publish", label: "Double-post guard", detail: "publish log + mark-posted", check: () => true },
  { id: "compliance", stage: "publish", label: "Compliance gate", detail: "human review, caps, disclosure", check: () => true },
  { id: "reply-drafts", stage: "publish", label: "Comment reply drafts", detail: "flagged, never auto-posted", check: () => true },
  { id: "analytics", stage: "learn", label: "Analytics pull", detail: "real stats -> radar weights", check: () => Boolean(process.env.YOUTUBE_API_KEY) },
  { id: "calibration", stage: "learn", label: "Calibration loop", detail: "predictions vs results", check: () => true },
  { id: "lessons", stage: "learn", label: "Lesson distillation", detail: "cited, injected into prompts", check: () => true },
  {
    id: "meta-publish", stage: "publish", label: "Instagram / Facebook Reels", status: "adapter",
    detail: "Graph API needs a reviewed app + a public HTTPS render URL. Gated behind META_APP_REVIEWED",
  },
  {
    id: "auto-dm", stage: "publish", label: "Auto-DM lead magnet", status: "nongoal",
    detail: "automated DMs are the fastest way to lose an account; keep delivery manual or use a link in the description",
  },
];

/** Resolve live/built/adapter/nongoal for every capability. */
export function capabilityReport() {
  return CAPABILITIES.map((c) => {
    if (c.status) return { ...c, ok: false };
    let ok = false;
    try {
      ok = Boolean(c.check?.());
    } catch {
      ok = false;
    }
    return { ...c, status: ok ? "live" : "built", ok };
  });
}

export function capabilitySummary() {
  const rows = capabilityReport();
  const by = { live: 0, built: 0, adapter: 0, nongoal: 0 };
  for (const r of rows) by[r.status] = (by[r.status] || 0) + 1;
  return { total: rows.length, ...by, rows };
}

/** Licence posture across everything the registry references. */
export function licenseReport() {
  const used = new Set(CAPABILITIES.map((c) => c.license).filter(Boolean));
  return {
    referenced: [...used].map((id) => ({ id, ...licenseOf(id) })),
    blocked: Object.entries(MODEL_LICENSES)
      .filter(([, v]) => v.status === "blocked")
      .map(([id, v]) => ({ id, ...v })),
  };
}
