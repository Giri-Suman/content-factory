import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, ensureDirs, paths } from "../../shared/src/config.js";
import { getAccessToken } from "./youtube.js";
import { readLog } from "./log.js";

/**
 * Analytics feedback loop. Pulls per-video stats from the YouTube Analytics
 * API for everything in the publish ledger, aggregates by category, and
 * writes data/perf.json — category performance multipliers the trend scorer
 * reads to boost winners and starve losers. No creds -> reports what it can
 * from the local ledger and leaves weights neutral.
 */

const PERF_PATH = path.join(paths.data, "perf.json");
const NEUTRAL = { coding: 1, ai: 1, math: 1, makeup: 1 };

export function readPerf() {
  if (!existsSync(PERF_PATH)) return { weights: { ...NEUTRAL }, updatedAt: null, videos: [] };
  try {
    return JSON.parse(readFileSync(PERF_PATH, "utf8"));
  } catch {
    return { weights: { ...NEUTRAL }, updatedAt: null, videos: [] };
  }
}

/** The multiplier the scorer applies to a category's raw score. */
export function categoryWeight(category) {
  return readPerf().weights?.[category] ?? 1;
}

async function fetchVideoStats(accessToken, videoIds) {
  const stats = {};
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${batch.join(",")}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`videos.list ${res.status}: ${(await res.text()).slice(0, 200)}`);
    for (const v of (await res.json()).items || []) {
      stats[v.id] = {
        title: v.snippet?.title,
        views: Number(v.statistics?.viewCount || 0),
        likes: Number(v.statistics?.likeCount || 0),
        comments: Number(v.statistics?.commentCount || 0),
      };
    }
  }
  return stats;
}

/** views-per-day, log-scaled, clamped to a 0.5–1.5 multiplier around 1.0. */
function weightFromViews(viewsPerDay) {
  const w = 0.6 + 0.28 * Math.log10(viewsPerDay + 1);
  return Math.max(0.5, Math.min(1.5, w));
}

export async function runAnalytics() {
  loadEnv();
  ensureDirs();
  const entries = readLog().entries.filter((e) => e.videoId && !e.dryRun);

  if (entries.length === 0) {
    console.log("\nno published videos in the ledger yet — nothing to analyze.");
    console.log("category weights stay neutral (all 1.0). Publish a few videos, then run this again.\n");
    writeFileSync(PERF_PATH, JSON.stringify({ weights: { ...NEUTRAL }, updatedAt: new Date().toISOString(), videos: [] }, null, 2));
    return true;
  }

  if (!process.env.YT_REFRESH_TOKEN) {
    console.error("published videos exist but no YT_REFRESH_TOKEN — can't pull stats. Run: factory auth-youtube");
    return false;
  }

  console.log(`\npulling stats for ${entries.length} published video(s)...`);
  const token = await getAccessToken();
  const stats = await fetchVideoStats(token, entries.map((e) => e.videoId));

  const byCat = {};
  const videos = [];
  for (const e of entries) {
    const s = stats[e.videoId];
    if (!s) continue;
    const days = Math.max(1, (Date.now() - new Date(e.at).getTime()) / 864e5);
    const vpd = s.views / days;
    const cat = e.category || "coding";
    (byCat[cat] ||= []).push(vpd);
    videos.push({ videoId: e.videoId, category: cat, title: s.title, views: s.views, viewsPerDay: Math.round(vpd) });
  }

  const weights = { ...NEUTRAL };
  for (const [cat, list] of Object.entries(byCat)) {
    const avg = list.reduce((a, b) => a + b, 0) / list.length;
    weights[cat] = Number(weightFromViews(avg).toFixed(2));
  }

  writeFileSync(PERF_PATH, JSON.stringify({ weights, updatedAt: new Date().toISOString(), videos }, null, 2));

  console.log("\n  category weights (feeds back into trend scoring):");
  for (const [cat, w] of Object.entries(weights)) {
    const bar = "█".repeat(Math.round(w * 10));
    console.log(`  ${cat.padEnd(8)} ${w.toFixed(2)}  ${bar}`);
  }
  console.log(`\n  top performers:`);
  videos
    .sort((a, b) => b.viewsPerDay - a.viewsPerDay)
    .slice(0, 5)
    .forEach((v) => console.log(`  ${String(v.viewsPerDay).padStart(6)}/day  ${(v.title || v.videoId).slice(0, 60)}`));
  console.log("");
  return true;
}
