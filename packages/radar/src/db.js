import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { paths } from "../../shared/src/config.js";

/**
 * Trend store: a single JSON file, atomic writes, zero native deps.
 * (better-sqlite3 needs a C++ toolchain this machine doesn't have; at radar
 * scale — a few thousand trends — JSON is plenty. The API surface here is the
 * contract; a SQL backend can replace the internals later without callers
 * changing.)
 */

const STORE_PATH = path.join(paths.data, "trends.json");
let store;

function load() {
  if (store) return store;
  mkdirSync(paths.data, { recursive: true });
  if (existsSync(STORE_PATH)) {
    try {
      store = JSON.parse(readFileSync(STORE_PATH, "utf8"));
    } catch {
      store = { trends: {} };
    }
  } else {
    store = { trends: {} };
  }
  store.trends ??= {};
  return store;
}

export function save() {
  const tmp = `${STORE_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(load(), null, 1));
  renameSync(tmp, STORE_PATH);
}

export const trendId = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36).padStart(7, "0");
};

export function upsertTrend(item) {
  const { trends } = load();
  const id = trendId((item.url || `${item.source}:${item.title}`).toLowerCase());
  const now = new Date().toISOString();
  const existing = trends[id];
  trends[id] = {
    id,
    source: item.source,
    title: item.title.slice(0, 300),
    url: item.url || null,
    points: item.points || 0,
    comments: item.comments || 0,
    published_at: item.publishedAt || existing?.published_at || null,
    first_seen: existing?.first_seen || now,
    last_seen: now,
    score: existing?.score ?? null,
    score_source: existing?.score_source ?? null,
    score_reason: existing?.score_reason ?? null,
    alerted: existing?.alerted || 0,
    used: existing?.used || 0,
  };
  return id;
}

export function getByIds(ids) {
  const { trends } = load();
  return ids.map((id) => trends[id]).filter(Boolean);
}

export function updateScore(id, score, source, reason) {
  const t = load().trends[id];
  if (t) {
    t.score = score;
    t.score_source = source;
    t.score_reason = reason || null;
  }
}

export function topTrends(limit = 15) {
  return Object.values(load().trends)
    .filter((t) => !t.used)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.last_seen.localeCompare(a.last_seen))
    .slice(0, limit);
}

export function hotUnalerted(threshold, limit = 5) {
  return Object.values(load().trends)
    .filter((t) => (t.score ?? 0) >= threshold && !t.alerted && !t.used)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function markAlerted(id) {
  const t = load().trends[id];
  if (t) t.alerted = 1;
}

export function findTrendByPrefix(prefix) {
  const matches = Object.values(load().trends)
    .filter((t) => t.id.startsWith(prefix))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return matches[0] || null;
}

export function markUsed(id) {
  const t = load().trends[id];
  if (t) {
    t.used = 1;
    save();
  }
}
