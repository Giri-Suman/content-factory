import { loadEnv, loadUserConfig } from "../../shared/src/config.js";
import { collection, newId } from "../../shared/src/store.js";
import { upsertTrend, recordSnapshots, save } from "./db.js";

/**
 * YouTube radar (blueprint P3): one cached, batched, quota-counted client
 * behind every feature. Degrades keyless with a clear notice — never crashes.
 *
 * Unit truth (per Google docs): search.list = 100; videos.list,
 * channels.list, playlistItems.list = 1. Cache hits cost 0.
 * Daily cap via YT_DAILY_UNIT_CAP (default 8000): calls beyond it throw
 * QUOTA_CAP and jobs skip with a surfaced warning.
 */

const API = "https://www.googleapis.com/youtube/v3";
const CACHE_TTL_MS = 30 * 60 * 1000;
const UNITS = { search: 100, videos: 1, channels: 1, playlistItems: 1 };

export const DEFAULT_KEYWORDS = ["ai automation", "claude code", "cursor ai", "n8n workflow", "python automation", "ai agents"];

const today = () => new Date().toISOString().slice(0, 10);

export const hasKey = () => {
  loadEnv();
  return Boolean(process.env.YOUTUBE_API_KEY);
};

export function quotaUsedToday() {
  return collection("quota")
    .find((r) => r.date === today())
    .reduce((a, r) => a + r.units, 0);
}

function logQuota(endpoint, units, job) {
  const quota = collection("quota");
  const rows = quota.all();
  rows.push({ id: newId(), date: today(), endpoint, units, job, at: new Date().toISOString() });
  quota.save(rows.slice(-2000));
}

/** The single API gateway: 30-min cache, quota cap, unit ledger. */
export async function yt(endpoint, params, job = "adhoc") {
  loadEnv();
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("NO_KEY: set YOUTUBE_API_KEY in .env (free — Google Cloud Console, YouTube Data API v3)");

  const qs = new URLSearchParams({ ...params, key: "" });
  qs.delete("key");
  const cacheId = `${endpoint}?${qs.toString()}`;
  const cache = collection("ytcache");
  const hit = cache.get(cacheId);
  if (hit && Date.now() - new Date(hit.at).getTime() < CACHE_TTL_MS) return hit.data;

  const units = UNITS[endpoint] ?? 1;
  const { canSpend } = await import("./allocator.js");
  const grant = canSpend(job, units);
  if (!grant.ok) {
    throw new Error(`QUOTA_CAP: ${grant.reason} — job "${job}" skipped`);
  }

  const res = await fetch(`${API}/${endpoint}?${new URLSearchParams({ ...params, key })}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`youtube ${endpoint} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  logQuota(endpoint, units, job);

  const rows = cache.all().filter((r) => r.id !== cacheId);
  rows.push({ id: cacheId, at: new Date().toISOString(), data });
  cache.save(rows.slice(-150));
  return data;
}

/** videos.list in 50-id batches. parts: snippet,statistics,contentDetails */
export async function videosByIds(ids, job) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const data = await yt(
      "videos",
      { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(","), maxResults: "50" },
      job
    );
    out.push(...(data.items || []));
  }
  return out;
}

const iso8601ToSec = (d) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d || "");
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
};

const median = (nums) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const asItem = (v, source) => ({
  source,
  category: "ai",
  title: v.snippet?.title || "",
  url: `https://www.youtube.com/watch?v=${v.id}`,
  points: parseInt(v.statistics?.viewCount || "0", 10),
  comments: parseInt(v.statistics?.commentCount || "0", 10),
  publishedAt: v.snippet?.publishedAt || null,
});

/* ---------------- 1. trending ---------------- */

export async function trending(job = "yt-trending") {
  const combos = [
    ["IN", "28"], ["IN", "27"],
    ["US", "28"], ["US", "27"],
  ];
  const videos = [];
  for (const [regionCode, videoCategoryId] of combos) {
    const data = await yt(
      "videos",
      { part: "snippet,statistics", chart: "mostPopular", regionCode, videoCategoryId, maxResults: "25" },
      job
    );
    videos.push(...(data.items || []));
  }
  const ids = ingestItems(videos.map((v) => asItem(v, "yt-trending")));
  return { videos: videos.length, ingested: ids.length };
}

/* ---------------- 2. niche heat ---------------- */

export async function nicheHeat(job = "yt-heat") {
  const keywords = loadUserConfig().youtubeKeywords || DEFAULT_KEYWORDS;
  const publishedAfter = new Date(Date.now() - 48 * 36e5).toISOString();
  const ids = new Set();
  for (const q of keywords) {
    const data = await yt(
      "search",
      { part: "snippet", q, type: "video", order: "viewCount", publishedAfter, maxResults: "10" },
      job
    );
    for (const it of data.items || []) if (it.id?.videoId) ids.add(it.id.videoId);
  }
  const videos = await videosByIds([...ids], job);
  const ingested = ingestItems(videos.map((v) => asItem(v, "yt-heat")));
  return { keywords: keywords.length, videos: videos.length, ingested: ingested.length };
}

function ingestItems(items) {
  const ids = [];
  for (const item of items) {
    if (!item.title) continue;
    ids.push(upsertTrend(item).id);
  }
  recordSnapshots([...new Set(ids)]);
  save();
  return ids;
}

/* ---------------- 3. watchlist ---------------- */

export async function addChannel(urlOrHandle, job = "yt-watchlist") {
  let handle = urlOrHandle.trim();
  const m = handle.match(/youtube\.com\/(?:@|channel\/|c\/|user\/)?([^\/?\s]+)/i);
  if (m) handle = m[1];

  let params;
  if (/^UC[\w-]{20,}$/.test(handle)) params = { id: handle };
  else params = { forHandle: handle.startsWith("@") ? handle : `@${handle}` };

  const data = await yt("channels", { part: "snippet,statistics,contentDetails", ...params }, job);
  const ch = data.items?.[0];
  if (!ch) throw new Error(`channel not found: ${urlOrHandle}`);

  const channel = collection("watchchannels").upsert(
    {
      id: ch.id,
      handle: ch.snippet?.customUrl || handle,
      title: ch.snippet?.title || handle,
      subscriberCount: parseInt(ch.statistics?.subscriberCount || "0", 10),
      uploadsPlaylistId: ch.contentDetails?.relatedPlaylists?.uploads,
      addedAt: new Date().toISOString(),
    },
    (r) => r.id
  );
  await refreshChannel(channel.id, job);
  return collection("watchchannels").get(channel.id);
}

export async function refreshChannel(channelId, job = "yt-watchlist") {
  const channels = collection("watchchannels");
  const ch = channels.get(channelId);
  if (!ch?.uploadsPlaylistId) throw new Error(`unknown watchlist channel ${channelId}`);

  const pl = await yt("playlistItems", { part: "contentDetails", playlistId: ch.uploadsPlaylistId, maxResults: "25" }, job);
  const ids = (pl.items || []).map((i) => i.contentDetails?.videoId).filter(Boolean);
  const videos = await videosByIds(ids, job);

  const parsed = videos.map((v) => ({
    id: v.id,
    channelId,
    title: v.snippet?.title || "",
    publishedAt: v.snippet?.publishedAt || null,
    views: parseInt(v.statistics?.viewCount || "0", 10),
    likes: parseInt(v.statistics?.likeCount || "0", 10),
    comments: parseInt(v.statistics?.commentCount || "0", 10),
    durationSec: iso8601ToSec(v.contentDetails?.duration),
  }));

  // shorts and long-form get SEPARATE medians — mixing them poisons both
  const shorts = parsed.filter((v) => v.durationSec > 0 && v.durationSec <= 61);
  const longs = parsed.filter((v) => v.durationSec > 61);
  const shortsMedian = median(shorts.map((v) => v.views));
  const longMedian = median(longs.map((v) => v.views));
  const overallMedian = median(parsed.map((v) => v.views));

  const watchvideos = collection("watchvideos");
  const kept = watchvideos.all().filter((v) => v.channelId !== channelId);
  for (const v of parsed) {
    const base = v.durationSec <= 61 ? shortsMedian || overallMedian : longMedian || overallMedian;
    kept.push({ ...v, isShort: v.durationSec <= 61, outlierRatio: base > 0 ? Math.round((v.views / base) * 10) / 10 : null });
  }
  watchvideos.save(kept);

  channels.update(channelId, {
    medianViews: overallMedian,
    shortsMedianViews: shortsMedian,
    longMedianViews: longMedian,
    videoCount: parsed.length,
    refreshedAt: new Date().toISOString(),
  });
  return { channelId, videos: parsed.length, medianViews: overallMedian };
}

/**
 * P12 cohort scaling: with {cohort:true} (the worker's 6h deep tick) each
 * channel refreshes once per ~24h in 4 rotating cohorts — 300 channels
 * stay ≈2 units/channel/day. Manual refresh (no flag) does everything.
 */
export async function refreshWatchlist(job = "yt-watchlist", { cohort = false } = {}) {
  const all = collection("watchchannels").all();
  const cohortIndex = Math.floor(new Date().getUTCHours() / 6); // 0-3, rotates with the 6h tick
  const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0);
  const due = cohort
    ? all.filter(
        (ch) =>
          hash(ch.id) % 4 === cohortIndex &&
          (!ch.refreshedAt || Date.now() - new Date(ch.refreshedAt).getTime() > 20 * 36e5)
      )
    : all;

  const results = [];
  for (const ch of due) {
    try {
      results.push(await refreshChannel(ch.id, job));
    } catch (e) {
      results.push({ channelId: ch.id, error: e.message });
    }
  }
  return results;
}

/** Projected daily unit spend at current settings (P12 acceptance). */
export function estimateDailyUnits() {
  const keywords = (loadUserConfig().youtubeKeywords || DEFAULT_KEYWORDS).length;
  const channels = collection("watchchannels").count();
  const est = {
    trending: 4 * 24, // hourly tick, 4 one-unit calls (30-min cache absorbs half in practice)
    nicheHeat: keywords * 100 + Math.ceil((keywords * 10) / 50), // ONCE daily (worker-paced)
    watchlist: channels * 2, // cohort rotation = each channel ~once/day
    saturation: 15 * 101, // top-15 clusters per scoring day, worst case
  };
  est.total = est.trending + est.nicheHeat + est.watchlist + est.saturation;
  est.at300Channels = est.total - est.watchlist + 300 * 2;
  return est;
}

/* ---------------- 4. outliers ---------------- */

export function outliers({ minRatio = 3, days = 14 } = {}) {
  const cutoff = Date.now() - days * 864e5;
  const channels = new Map(collection("watchchannels").all().map((c) => [c.id, c]));
  return collection("watchvideos")
    .find((v) => v.outlierRatio >= minRatio && v.publishedAt && new Date(v.publishedAt).getTime() >= cutoff)
    .map((v) => ({ ...v, channelTitle: channels.get(v.channelId)?.title || v.channelId }))
    .sort((a, b) => b.outlierRatio - a.outlierRatio);
}

/* ---------------- 5. saturation (for the P4 scorer) ---------------- */

export async function saturation(topicPhrase, job = "yt-saturation") {
  const publishedAfter = new Date(Date.now() - 48 * 36e5).toISOString();
  const data = await yt(
    "search",
    { part: "snippet", q: topicPhrase, type: "video", publishedAfter, maxResults: "25", order: "relevance" },
    job
  );
  const ids = (data.items || []).map((i) => i.id?.videoId).filter(Boolean);
  const videos = ids.length ? await videosByIds(ids, job) : [];
  return {
    topic: topicPhrase,
    videoCount: data.pageInfo?.totalResults ?? ids.length,
    sampled: videos.length,
    medianViews: median(videos.map((v) => parseInt(v.statistics?.viewCount || "0", 10))),
  };
}

/* ---------------- wishlist support (P5) ---------------- */

export function parseVideoId(url) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : /^[\w-]{11}$/.test(url.trim()) ? url.trim() : null;
}

/** Everything Flow A needs in one shot: video + channel + last-25 medians. */
export async function videoContext(videoId, job = "wishlist") {
  const vres = await yt("videos", { part: "snippet,statistics,contentDetails", id: videoId }, job);
  const video = vres.items?.[0];
  if (!video) throw new Error(`video not found: ${videoId}`);

  const channelId = video.snippet.channelId;
  const cres = await yt("channels", { part: "snippet,statistics,contentDetails", id: channelId }, job);
  const channel = cres.items?.[0];
  const uploadsId = channel?.contentDetails?.relatedPlaylists?.uploads;

  let uploads = [];
  if (uploadsId) {
    const pl = await yt("playlistItems", { part: "contentDetails", playlistId: uploadsId, maxResults: "25" }, job);
    const ids = (pl.items || []).map((i) => i.contentDetails?.videoId).filter(Boolean);
    uploads = await videosByIds(ids, job);
  }
  const uploadStats = uploads.map((v) => {
    const views = parseInt(v.statistics?.viewCount || "0", 10);
    const eng = views > 0 ? (parseInt(v.statistics?.likeCount || "0", 10) + parseInt(v.statistics?.commentCount || "0", 10)) / views : 0;
    return { views, eng };
  });

  return {
    video: {
      id: video.id,
      title: video.snippet.title,
      description: (video.snippet.description || "").slice(0, 500),
      publishedAt: video.snippet.publishedAt,
      durationSec: iso8601ToSec(video.contentDetails?.duration),
      views: parseInt(video.statistics?.viewCount || "0", 10),
      likes: parseInt(video.statistics?.likeCount || "0", 10),
      comments: parseInt(video.statistics?.commentCount || "0", 10),
    },
    channel: {
      id: channelId,
      title: channel?.snippet?.title || "?",
      subscriberCount: parseInt(channel?.statistics?.subscriberCount || "0", 10),
    },
    channelMedianViews: median(uploadStats.map((u) => u.views)),
    channelEngagementNorm: median(uploadStats.map((u) => u.eng)),
  };
}

/** Cheap tracking re-poll: current stats only (1 unit, 30-min cached). */
export async function videoStats(videoId, job = "wishlist-track") {
  const res = await yt("videos", { part: "statistics", id: videoId }, job);
  const v = res.items?.[0];
  if (!v) return null;
  return {
    views: parseInt(v.statistics?.viewCount || "0", 10),
    likes: parseInt(v.statistics?.likeCount || "0", 10),
    comments: parseInt(v.statistics?.commentCount || "0", 10),
  };
}

/* ---------------- quota estimate (blueprint acceptance) ---------------- */

export function estimateCycleUnits() {
  const keywords = (loadUserConfig().youtubeKeywords || DEFAULT_KEYWORDS).length;
  const channels = collection("watchchannels").count() || 2;
  const est = {
    trending: 4,
    nicheHeat: keywords * 100 + Math.ceil((keywords * 10) / 50),
    watchlist: channels * 2,
  };
  est.total = est.trending + est.nicheHeat + est.watchlist;
  return est;
}
