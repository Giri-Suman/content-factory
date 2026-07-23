import { collection, newId } from "./store.js";

/**
 * P23 cost ledger. Honest estimates only — we don't have exact token
 * billing, so LLM cost is a per-call estimate by task size, voice is
 * per-character for ElevenLabs (SAPI = $0), thumbnails are $0 (system
 * Chrome). Every estimate is tagged so per-video and per-day totals are
 * auditable, not invented.
 */

// rough per-call USD estimates for a cheap-model provider
export const COST = {
  llmScore: 0.004, // short scoring/judge call
  llmScript: 0.02, // longer generation call
  elevenPerChar: 0.00018, // ElevenLabs ~ $0.18 / 1k chars
  sapi: 0, // Windows TTS
  thumbnail: 0, // system Chrome headless
  imageGen: 0.04, // optional flux background (behind env flag)
};

export function logCost(kind, amount, meta = {}) {
  if (!amount) return; // don't clutter the ledger with $0 rows
  const ledger = collection("costledger");
  ledger.save([...ledger.all(), { id: newId(), kind, amount: Math.round(amount * 1e4) / 1e4, ...meta, at: new Date().toISOString() }].slice(-5000));
}

export function costToday() {
  const today = new Date().toISOString().slice(0, 10);
  return round(collection("costledger").find((r) => (r.at || "").slice(0, 10) === today).reduce((a, r) => a + r.amount, 0));
}

export function costForVideo(videoId) {
  return round(collection("costledger").find((r) => r.videoId === videoId).reduce((a, r) => a + r.amount, 0));
}

export function costDashboard(cadencePerDay = 1) {
  const rows = collection("costledger").all();
  const byDay = {};
  for (const r of rows) {
    const d = (r.at || "").slice(0, 10);
    byDay[d] = (byDay[d] || 0) + r.amount;
  }
  const days = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  const perVideo = {};
  for (const r of rows.filter((x) => x.videoId)) perVideo[r.videoId] = (perVideo[r.videoId] || 0) + r.amount;
  const videoCosts = Object.values(perVideo);
  const avgPerVideo = videoCosts.length ? round(videoCosts.reduce((a, b) => a + b, 0) / videoCosts.length) : 0;
  return {
    today: costToday(),
    last14Days: days.map(([date, amount]) => ({ date, amount: round(amount) })),
    avgPerVideo,
    monthlyProjection: round(avgPerVideo * cadencePerDay * 30),
    videosTracked: videoCosts.length,
  };
}

const round = (n) => Math.round(n * 100) / 100;
