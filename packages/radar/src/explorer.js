import { loadEnv, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection, newId } from "../../shared/src/store.js";
import { chat, providerStatus } from "../../llm/src/llm.js";
import { yt, videosByIds, hasKey } from "./youtube.js";

/**
 * P12 Niche Explorer: budgeted channel discovery + the weekly niche map.
 * Discovery hard-caps at 5 search calls (500 units) per pass; candidate
 * ranking = relevance (LLM vs niche, keyword heuristic keyless) ×
 * size-fit (10K-2M sweet spot) × upload recency.
 */

const SEARCH_CAP = 5;
const SIZE_LOW = 10_000;
const SIZE_HIGH = 2_000_000;

function sizeFit(subs) {
  if (subs >= SIZE_LOW && subs <= SIZE_HIGH) return 1;
  if (subs < SIZE_LOW) return Math.max(0.2, subs / SIZE_LOW);
  return Math.max(0.2, SIZE_HIGH / subs);
}

function recencyFit(lastUploadAt) {
  if (!lastUploadAt) return 0.5;
  const days = (Date.now() - new Date(lastUploadAt).getTime()) / 864e5;
  return days <= 7 ? 1 : days <= 30 ? 0.8 : days <= 90 ? 0.5 : 0.2;
}

async function relevanceScores(candidates) {
  if (providerStatus().active) {
    try {
      const listing = candidates.map((c, i) => `${i} | ${c.title} — ${(c.description || "").slice(0, 100)}`).join("\n");
      const res = await chat({
        task: "score",
        maxTokens: 1200,
        system:
          `Rate YouTube channels 0-10 for relevance to this creator's niche: ${NICHE_CONTEXT}. ` +
          'Reply ONLY JSON: {"ratings":[{"i":0,"r":7},...]} covering every index.',
        user: listing,
      });
      const parsed = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
      const map = new Map((parsed.ratings || []).map((x) => [x.i, Math.max(0, Math.min(10, x.r))]));
      if (map.size) return candidates.map((_, i) => (map.get(i) ?? 5) / 10);
    } catch {
      /* heuristic below */
    }
  }
  const NICHE = /\b(ai|automation|coding|programming|developer|python|javascript|typescript|react|llm|agent|tutorial|tech)\b/i;
  return candidates.map((c) => (NICHE.test(`${c.title} ${c.description || ""}`) ? 0.8 : 0.3));
}

export async function discoverChannels(seed, job = "yt-discover") {
  loadEnv();
  if (!hasKey()) throw new Error("discovery needs YOUTUBE_API_KEY in .env");

  // up to SEARCH_CAP keyword variants, one search.list each (100u, hard cap 500u/pass)
  const queries = [seed, `${seed} tutorial`, `${seed} automation`, `${seed} for developers`, `${seed} tips`].slice(0, SEARCH_CAP);
  const channelIds = new Set();
  let searches = 0;
  for (const q of queries) {
    if (searches >= SEARCH_CAP) break;
    const data = await yt("search", { part: "snippet", q, type: "channel", maxResults: "25" }, job);
    searches++;
    for (const it of data.items || []) if (it.id?.channelId) channelIds.add(it.id.channelId);
    if (channelIds.size >= 60) break;
  }

  const ids = [...channelIds];
  const channels = [];
  for (let i = 0; i < ids.length; i += 50) {
    const data = await yt("channels", { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(",") }, job);
    channels.push(...(data.items || []));
  }

  const watched = new Set(collection("watchchannels").all().map((c) => c.id));
  let candidates = channels
    .map((c) => ({
      id: c.id,
      title: c.snippet?.title || "?",
      handle: c.snippet?.customUrl || null,
      description: (c.snippet?.description || "").slice(0, 200),
      subscriberCount: parseInt(c.statistics?.subscriberCount || "0", 10),
      videoCount: parseInt(c.statistics?.videoCount || "0", 10),
      uploadsPlaylistId: c.contentDetails?.relatedPlaylists?.uploads,
      watched: watched.has(c.id),
    }))
    .filter((c) => c.videoCount >= 5);

  const rel = await relevanceScores(candidates);
  candidates = candidates.map((c, i) => ({ ...c, relevance: rel[i] }));

  // upload recency for the top 20 by relevance×size only (1 unit each)
  candidates.sort((a, b) => b.relevance * sizeFit(b.subscriberCount) - a.relevance * sizeFit(a.subscriberCount));
  for (const c of candidates.slice(0, 20)) {
    if (!c.uploadsPlaylistId) continue;
    try {
      const pl = await yt("playlistItems", { part: "contentDetails", playlistId: c.uploadsPlaylistId, maxResults: "1" }, job);
      c.lastUploadAt = pl.items?.[0]?.contentDetails?.videoPublishedAt || null;
    } catch {
      c.lastUploadAt = null;
    }
  }

  const ranked = candidates
    .map((c) => ({
      ...c,
      score: Math.round(c.relevance * sizeFit(c.subscriberCount) * recencyFit(c.lastUploadAt) * 100) / 100,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);

  collection("discoveries").upsert(
    { id: newId(), seed, candidates: ranked, searches, at: new Date().toISOString() },
    (r) => r.seed
  );
  return { seed, candidates: ranked, searches };
}

/* ---------------- weekly niche map ---------------- */

export async function buildNicheMap() {
  loadEnv();
  const cutoff = Date.now() - 14 * 864e5;
  const channels = new Map(collection("watchchannels").all().map((c) => [c.id, c.title]));
  const vids = collection("watchvideos")
    .find((v) => v.publishedAt && new Date(v.publishedAt).getTime() >= cutoff)
    .sort((a, b) => (b.outlierRatio || 0) - (a.outlierRatio || 0));
  if (vids.length < 10) return { skipped: `only ${vids.length} recent watchlist videos (need 10+)` };
  if (!providerStatus().active) return { skipped: "no LLM key" };

  const listing = vids
    .slice(0, 80)
    .map((v) => `${v.outlierRatio}x | ${v.isShort ? "short" : "long"} | [${channels.get(v.channelId) || "?"}] ${v.title.slice(0, 90)}`)
    .join("\n");
  try {
    const res = await chat({
      task: "score",
      maxTokens: 1500,
      system:
        `You analyze 14 days of niche-channel videos (ratio | format | [channel] title) for: ${NICHE_CONTEXT}. ` +
        'Reply ONLY JSON: {"rising":["topic/format trends gaining"],"fading":["losing steam"],"gaps":["underserved angles worth making"]} — 3-5 bullets each, specific.',
      user: listing,
    });
    const parsed = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
    const map = { ...parsed, videosAnalyzed: Math.min(80, vids.length), at: new Date().toISOString() };
    collection("nichemap").save([{ id: "current", ...map }]);
    return map;
  } catch {
    return { skipped: "LLM analysis failed" };
  }
}
