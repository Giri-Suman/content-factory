/**
 * CLOUD TRANSCRIPTION — Groq's hosted whisper large-v3.
 *
 * WHY: local `base` is unusable for Bengali. It correctly detected the language
 * and then produced English-looking nonsense — 3 segments for 93 seconds of
 * continuous speech. Running large-v3 locally would fix the quality and cost
 * about 2.9 hours for a 60-minute video on this 2-core machine, which is not a
 * trade worth making. Groq runs the same model in seconds, on a free tier.
 *
 * PRIVACY — THIS IS THE ONE PLACE FOOTAGE LEAVES THE MACHINE.
 * Everything else in this project is local by construction: renders, edits,
 * captures, storage. This uploads the AUDIO of whatever is being edited to a
 * third party. That is a real change in posture, so it is:
 *   - off unless GROQ_API_KEY is set AND the transcribe tier asks for it
 *   - audio only, never video — smaller, faster, and less than was filmed
 *   - announced on every run, so it can never happen quietly
 * Someone filming a person deserves to know their voice is being sent
 * somewhere, and a setting buried in a config file is not knowing.
 *
 * Groq caps uploads at 25MB, so long audio is compressed to 16kHz mono opus
 * first — whisper resamples to 16kHz internally anyway, making this lossless
 * for the model's purposes while shrinking an hour of speech to a few MB.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3";
const MAX_UPLOAD = 24 * 1024 * 1024; // Groq's limit is 25MB; leave headroom

export const isAvailable = () => Boolean(process.env.GROQ_API_KEY);

/**
 * Extract speech-optimised audio: 16kHz mono MP3.
 *
 * MP3 SPECIFICALLY. Groq's transcription endpoint returns a bare
 * `500 Internal Server Error` for both WAV and opus-in-ogg — tested on the same
 * audio, same parameters, only the container differing: wav 500, opus 500,
 * mp3 200. The error says nothing about format, so this is worth stating rather
 * than leaving for the next person to rediscover.
 *
 * whisper resamples to 16kHz mono internally, so nothing the model uses is lost,
 * and 32kbps mono keeps an hour of speech comfortably under the 25MB cap
 * (measured: 93 seconds -> 0.4MB, versus 2.8MB as WAV).
 */
function extractAudio(input) {
  const out = path.join(os.tmpdir(), `factory-tx-${Date.now()}.mp3`);
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-v", "error", "-vn", "-i", input, "-ac", "1", "-ar", "16000", "-b:a", "32k", out],
    { encoding: "utf8", windowsHide: true, timeout: 1000 * 60 * 30 }
  );
  if (r.status !== 0 || !existsSync(out)) {
    throw new Error(`could not extract audio: ${(r.stderr || "").slice(-200)}`);
  }
  return out;
}

/**
 * Transcribe via Groq. Returns whisper-shaped JSON (segments with word
 * timings) so callers cannot tell which engine produced it.
 */
export async function transcribeCloud(input, { language = null } = {}) {
  if (!isAvailable()) throw new Error("GROQ_API_KEY is not set");

  const audio = extractAudio(input);
  try {
    const size = statSync(audio).size;
    if (size > MAX_UPLOAD) {
      throw new Error(
        `audio is ${Math.round(size / 1048576)}MB after compression, over Groq's ${Math.round(MAX_UPLOAD / 1048576)}MB limit — ` +
          `split the recording or transcribe locally`
      );
    }

    console.log(`  uploading ${Math.round(size / 1024)}KB of AUDIO to Groq (${MODEL}${language ? `, language=${language}` : ""})`);
    console.log(`    this is the only step that sends anything off this machine`);

    const form = new FormData();
    form.append("file", new Blob([readFileSync(audio)]), path.basename(audio));
    form.append("model", MODEL);
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");
    if (language) form.append("language", language);

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Groq ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();

    /* Normalise to the local whisper shape. The caller builds captions and cut
       plans from `words`, so a missing word array must fail loudly rather than
       silently producing an edit with no captions. */
    const words = (data.words || []).map((w) => ({
      word: w.word,
      start: Number(w.start),
      end: Number(w.end),
    }));
    if (!words.length && data.segments?.length) {
      console.log("  Groq returned segments but no word timings — captions will be segment-level");
    }
    return {
      language: data.language || language || null,
      duration: data.duration ?? null,
      segments: data.segments || [],
      words,
      provider: `groq:${MODEL}`,
    };
  } finally {
    try {
      unlinkSync(audio);
    } catch {
      /* temp file */
    }
  }
}
