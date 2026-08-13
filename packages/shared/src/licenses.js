/**
 * MODEL LICENCE REGISTRY — the commercial-safety gate.
 *
 * This channel monetises (AdSense, brand deals, template sales), which makes
 * model licensing a legal question rather than a preference. Several of the
 * best-sounding open models are NON-COMMERCIAL, and they are exactly the ones
 * older blog posts recommend — XTTS v2 is still the top TTS answer on most
 * search results and cannot be used here at all.
 *
 * The rule this encodes: CUT BY LICENCE FIRST, THEN QUALITY. A model that
 * passes your test render but cannot ship is worse than a slightly weaker one
 * that can, because you only discover the problem after building on it.
 *
 * `assertCommercialSafe()` is a hard gate, not advice — a blocked model throws
 * rather than warning, because a warning in a log is not a legal defence.
 */

export const COMMERCIAL = "commercial";
export const BLOCKED = "blocked";
export const COPYLEFT = "copyleft";

/**
 * status:
 *   commercial — safe to monetise output
 *   copyleft   — output is fine; care only if REDISTRIBUTING the tool itself
 *   blocked    — non-commercial licence, or a dataset licence that overrides
 *                a permissive code licence (the Wav2Lip trap)
 */
export const MODEL_LICENSES = {
  /* ---------------- text to speech ---------------- */
  "kokoro-82m": { license: "Apache-2.0", status: COMMERCIAL, kind: "tts", note: "54 voices, 8 languages, CPU-fast — the default bulk narrator" },
  chatterbox: { license: "MIT", status: COMMERCIAL, kind: "tts", note: "voice cloning from ~10s reference" },
  "chatterbox-turbo": { license: "MIT", status: COMMERCIAL, kind: "tts", note: "23 languages, paralinguistic tags" },
  "orpheus-3b": { license: "Apache-2.0", status: COMMERCIAL, kind: "tts", note: "expressive" },
  bark: { license: "MIT", status: COMMERCIAL, kind: "tts", note: "TTS + sound effects" },
  piper: { license: "GPL-3.0", status: COPYLEFT, kind: "tts", note: "output is yours; copyleft only matters if you redistribute Piper itself" },
  "qwen3-tts": { license: "permissive", status: COMMERCIAL, kind: "tts" },
  "cosyvoice2-0.5b": { license: "permissive", status: COMMERCIAL, kind: "tts", note: "cloning" },
  elevenlabs: { license: "commercial SaaS", status: COMMERCIAL, kind: "tts", note: "paid API — licence fine, cost is the constraint" },
  "windows-sapi": { license: "OS built-in", status: COMMERCIAL, kind: "tts", note: "robotic but genuinely free and offline" },

  "xtts-v2": {
    license: "Coqui CPML",
    status: BLOCKED,
    kind: "tts",
    note: "NON-COMMERCIAL. The most-recommended TTS in older posts — that recommendation predates the licence change and monetised use is not permitted.",
  },
  "f5-tts": { license: "CC-BY-NC", status: BLOCKED, kind: "tts", note: "NON-COMMERCIAL weights. Excellent quality, cannot be monetised." },
  "fish-speech": { license: "CC-BY-NC-SA-4.0", status: BLOCKED, kind: "tts", note: "NON-COMMERCIAL open weights." },

  /* ---------------- music & audio ---------------- */
  "ace-step": { license: "MIT", status: COMMERCIAL, kind: "music", note: "full song in <10s, under 4GB VRAM, trained on royalty-free material" },
  demucs: { license: "MIT", status: COMMERCIAL, kind: "audio", note: "stem separation" },
  deepfilternet3: { license: "Apache-2.0/MIT", status: COMMERCIAL, kind: "audio", note: "noise reduction" },
  "silero-vad": { license: "MIT", status: COMMERCIAL, kind: "audio" },
  librosa: { license: "ISC", status: COMMERCIAL, kind: "audio", note: "beat detection" },

  /* ---------------- vision & video ---------------- */
  "wan-2.2": { license: "Apache-2.0", status: COMMERCIAL, kind: "video", note: "text/image-to-video; 12GB VRAM minimum" },
  "flux.2-klein": { license: "Apache-2.0", status: COMMERCIAL, kind: "image", note: "~13GB, sub-second generation" },
  sdxl: { license: "CreativeML Open RAIL++", status: COMMERCIAL, kind: "image", note: "use-based restrictions, but commercial output is permitted" },
  "real-esrgan": { license: "BSD-3-Clause", status: COMMERCIAL, kind: "video", note: "upscaling" },
  rife: { license: "MIT", status: COMMERCIAL, kind: "video", note: "frame interpolation" },
  rvm: { license: "GPL-3.0", status: COPYLEFT, kind: "video", note: "robust video matting" },
  musetalk: { license: "MIT", status: COMMERCIAL, kind: "lipsync" },
  latentsync: { license: "Apache-2.0", status: COMMERCIAL, kind: "lipsync" },
  sadtalker: { license: "Apache-2.0", status: COMMERCIAL, kind: "lipsync", note: "photo to talking head" },
  pyscenedetect: { license: "BSD-3-Clause", status: COMMERCIAL, kind: "video" },

  "wav2lip": {
    license: "code permissive, weights trained on LRS2",
    status: BLOCKED,
    kind: "lipsync",
    note: "THE SUBTLE TRAP: the code licence looks fine, but the LRS2 training set forbids commercial use and the dataset licence governs the weights.",
  },

  /* ---------------- transcription & render ---------------- */
  whisper: { license: "MIT", status: COMMERCIAL, kind: "transcribe" },
  "faster-whisper": { license: "MIT", status: COMMERCIAL, kind: "transcribe" },
  whisperx: { license: "BSD-4-Clause", status: COMMERCIAL, kind: "transcribe", note: "word-level forced alignment" },
  remotion: { license: "free ≤3 people, commercial OK", status: COMMERCIAL, kind: "render", note: "company licence required above 3 people" },
  manim: { license: "MIT", status: COMMERCIAL, kind: "render" },
  ffmpeg: { license: "LGPL/GPL", status: COMMERCIAL, kind: "render", note: "output unrestricted" },
  shiki: { license: "MIT", status: COMMERCIAL, kind: "render" },
};

export const isBlocked = (id) => MODEL_LICENSES[String(id).toLowerCase()]?.status === BLOCKED;
export const licenseOf = (id) => MODEL_LICENSES[String(id).toLowerCase()] || null;

/**
 * Hard gate. Throws on a non-commercial model instead of warning, because this
 * runs in a pipeline that publishes monetised content — a log line nobody reads
 * is not a defence, and the failure needs to happen before the render, not
 * after the brand deal.
 */
export function assertCommercialSafe(id, { context = "" } = {}) {
  const entry = licenseOf(id);
  if (!entry) {
    // unknown is not automatically unsafe, but it must be a deliberate choice
    return { ok: true, unknown: true, note: `"${id}" is not in the licence registry — verify its licence before shipping monetised output` };
  }
  if (entry.status === BLOCKED) {
    throw new Error(
      `BLOCKED MODEL: "${id}" is ${entry.license} and cannot be used for monetised content${context ? ` (${context})` : ""}.\n` +
        `  ${entry.note || ""}\n` +
        `  Commercial-safe ${entry.kind} alternatives: ${alternativesFor(entry.kind).join(", ")}`
    );
  }
  return { ok: true, ...entry };
}

/** Safe swaps of the same kind, so the error message is actionable. */
export function alternativesFor(kind) {
  return Object.entries(MODEL_LICENSES)
    .filter(([, v]) => v.kind === kind && v.status === COMMERCIAL)
    .map(([k]) => k)
    .slice(0, 4);
}

/** Everything blocked, for the audit command. */
export function blockedModels() {
  return Object.entries(MODEL_LICENSES)
    .filter(([, v]) => v.status === BLOCKED)
    .map(([id, v]) => ({ id, ...v }));
}
