import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { paths } from "../../shared/src/config.js";
import { collection, newId } from "../../shared/src/store.js";

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

/** Upsert one collected item. Returns { id, isNew } for run summaries. */
export function upsertTrend(item) {
  const { trends } = load();
  const id = trendId((item.url || `${item.source}:${item.title}`).toLowerCase());
  const now = new Date().toISOString();
  const existing = trends[id];
  trends[id] = {
    id,
    source: item.source,
    category: item.category || existing?.category || "coding",
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
    velocity: existing?.velocity ?? null,
  };
  return { id, isNew: !existing };
}

/**
 * Content OS snapshots: one row per seen item per run (data/os/snapshots.json).
 * velocity = Δpoints/Δhours vs the item's previous snapshot; null on first
 * sighting. Stored back onto the trend row. Keeps the newest 10 per item.
 */
export function recordSnapshots(ids) {
  const { trends } = load();
  const snaps = collection("snapshots");
  const rows = snaps.all();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const byItem = new Map();
  for (const s of rows) {
    if (!byItem.has(s.itemId)) byItem.set(s.itemId, []);
    byItem.get(s.itemId).push(s);
  }
  for (const list of byItem.values()) list.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));

  const velocities = new Map();
  for (const id of ids) {
    const t = trends[id];
    if (!t) continue;
    const prev = byItem.get(id)?.[0];
    let v = null;
    if (prev) {
      const dh = (nowMs - new Date(prev.capturedAt).getTime()) / 36e5;
      if (dh > 0.005) v = Math.round(((t.points - prev.score) / dh) * 10) / 10;
    }
    velocities.set(id, v);
    t.velocity = v;
    const snap = { id: newId(), itemId: id, score: t.points, comments: t.comments, capturedAt: nowIso };
    rows.push(snap);
    if (!byItem.has(id)) byItem.set(id, []);
    byItem.get(id).unshift(snap);
  }

  const pruned = [];
  for (const list of byItem.values()) pruned.push(...list.slice(0, 10));
  snaps.save(pruned);
  return velocities;
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
