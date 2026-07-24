import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Voice synthesis with word-level timestamps.
 *  - ElevenLabs (your cloned voice) when ELEVENLABS_API_KEY + VOICE_ID are set:
 *    exact character alignment from the API.
 *  - Windows SAPI fallback otherwise: free placeholder voice, word timings
 *    estimated from character lengths over the measured duration.
 * Results are cached next to the audio file so unchanged scenes never
 * re-bill ElevenLabs.
 */

const hashText = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

export function ffprobeDuration(file) {
  const res = spawnSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`, {
    shell: true,
    encoding: "utf8",
    timeout: 30000,
  });
  return parseFloat((res.stdout || "").trim()) || 0;
}

function estimateWords(text, durationSec) {
  const words = text.split(/\s+/).filter(Boolean);
  const totalLen = words.reduce((a, w) => a + w.length + 1, 0) || 1;
  let t = 0;
  return words.map((w) => {
    const d = ((w.length + 1) / totalLen) * durationSec;
    const item = { word: w, start: t, end: t + d };
    t += d;
    return item;
  });
}

function alignmentToWords(alignment) {
  const chars = alignment.characters || [];
  const starts = alignment.character_start_times_seconds || [];
  const ends = alignment.character_end_times_seconds || [];
  const words = [];
  let current = null;
  for (let i = 0; i < chars.length; i++) {
    if (/\s/.test(chars[i])) {
      if (current) words.push(current);
      current = null;
      continue;
    }
    if (!current) current = { word: "", start: starts[i], end: ends[i] };
    current.word += chars[i];
    current.end = ends[i];
  }
  if (current) words.push(current);
  return words;
}

async function elevenLabs(text, outBase, modelId = "eleven_multilingual_v2") {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: modelId }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const file = `${outBase}.mp3`;
  writeFileSync(file, Buffer.from(data.audio_base64, "base64"));
  const words = alignmentToWords(data.alignment || {});
  const durationSec = words.length ? words[words.length - 1].end : ffprobeDuration(file);
  try {
    const { logCost, COST } = await import("../../shared/src/cost.js");
    logCost("voice", text.length * COST.elevenPerChar, { chars: text.length, videoId: globalThis.__factoryVideoId || null });
  } catch {
    /* best-effort */
  }
  return { provider: "elevenlabs", file, durationSec, words };
}

function sapi(text, outBase) {
  const file = `${outBase}.wav`;
  const tmp = path.join(os.tmpdir(), `factory-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  writeFileSync(tmp, text, "utf8");
  const psFile = tmp.replace(/'/g, "''");
  const psOut = file.replace(/'/g, "''");
  const ps = [
    "Add-Type -AssemblyName System.Speech;",
    `$t=[IO.File]::ReadAllText('${psFile}');`,
    "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;",
    "$s.Rate=2;",
    `$s.SetOutputToWaveFile('${psOut}');`,
    "$s.Speak($t);",
    "$s.Dispose();",
  ].join(" ");
  const res = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    encoding: "utf8",
    timeout: 120000,
    windowsHide: true,
  });
  try {
    unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  if (!existsSync(file)) throw new Error(`SAPI TTS failed: ${(res.stderr || "").slice(0, 300)}`);
  const durationSec = ffprobeDuration(file);
  return { provider: "sapi", file, durationSec, words: estimateWords(text, durationSec) };
}

/**
 * Tier-driven voice. free = Windows SAPI ($0) · budget = ElevenLabs Flash
 * · premium = ElevenLabs multilingual v2 with YOUR cloned voice. A missing
 * key degrades DOWN to SAPI rather than failing the render.
 */
export async function synthesize(text, outBase) {
  const { resolveService } = await import("../../llm/src/tiers.js");
  const { loadUserConfig } = await import("../../shared/src/config.js");
  const opt = resolveService("voice", loadUserConfig().serviceTiers || {}) || { id: "sapi", tier: "free" };

  const hash = hashText(`${opt.id}::${text}`);
  const metaPath = `${outBase}.meta.json`;
  if (existsSync(metaPath)) {
    try {
      const cached = JSON.parse(readFileSync(metaPath, "utf8"));
      if (cached.hash === hash && existsSync(cached.file)) return cached;
    } catch {
      /* re-synthesize */
    }
  }

  let meta;
  if (opt.id === "sapi") meta = sapi(text, outBase);
  else {
    try {
      meta = await elevenLabs(text, outBase, opt.model);
    } catch (e) {
      console.error(`  voice: ${opt.label} failed (${String(e.message).slice(0, 60)}) — falling back to Windows TTS`);
      meta = sapi(text, outBase);
    }
  }
  meta.tier = opt.tier;
  meta.hash = hash;
  writeFileSync(metaPath, JSON.stringify(meta));
  return meta;
}
