/**
 * YouTube radar — trending, niche heat, watched channels and outliers.
 *
 * The port returned `{ trends: [] }`, a key the page does not read, so every
 * panel was empty and the "no API key" hint never appeared either. The page
 * wants hasKey, trending, heat, channels, outliers.
 *
 * Sources are the same rows the disk version used, now read from R2:
 * state/trends.json for the scraped feed, watchchannels/watchvideos for the
 * channel tracker.
 */

import { getEnv } from "@factory-env";
import { actOn, notAvailable, readCollection, readEnvFlags, readTrends } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const [trends, channels, videos, flags, quota, discoveries, nichemap] = await Promise.all([
    readTrends(env),
    readCollection(env, "watchchannels"),
    readCollection(env, "watchvideos"),
    readEnvFlags(env),
    readCollection(env, "quota"),
    readCollection(env, "discoveries"),
    readCollection(env, "nichemap"),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const chTitle = new Map(channels.map((c) => [c.id, c.title]));
  const cutoff = Date.now() - 14 * 864e5;

  const outliers = videos
    .filter((v) => v.publishedAt && new Date(v.publishedAt).getTime() > cutoff)
    .map((v) => ({ ...v, channelTitle: chTitle.get(v.channelId) || "?" }))
    .sort((a, b) => (b.outlierRatio || 0) - (a.outlierRatio || 0));

  const bySource = (s) =>
    trends.filter((t) => t.source === s).sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 25);

  return json({
    hasKey: Boolean(flags.youtube),
    quotaToday: quota.filter((r) => r.date === today).reduce((a, r) => a + (Number(r.units) || 0), 0),
    trending: bySource("yt-trending"),
    heat: bySource("yt-heat"),
    channels: channels.map((c) => ({
      ...c,
      videos: videos
        .filter((v) => v.channelId === c.id)
        .sort((a, b) => (b.outlierRatio || 0) - (a.outlierRatio || 0))
        .slice(0, 8),
    })),
    outliers: outliers.slice(0, 20),
    // a Short beating its channel's baseline by 3x is the signal worth copying
    shortsOutliers: videos
      .filter((v) => v.isShort && v.outlierRatio >= 3 && v.publishedAt && new Date(v.publishedAt).getTime() >= cutoff)
      .map((v) => ({ ...v, channelTitle: chTitle.get(v.channelId) || v.channelId }))
      .sort((a, b) => b.outlierRatio - a.outlierRatio)
      .slice(0, 25),
    discovery: [...discoveries].sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))[0] || null,
    nichemap: nichemap[0] || null,
  });
}

/**
 * Which registry command each button means.
 *
 * The port dropped `action` entirely and enqueued one command whatever was
 * pressed, so every button on this page did the same thing. `null` marks an
 * action the registry has no row for - those are refused by name rather than
 * quietly running something else.
 */
const ACTIONS = {
  scan: "yt-trending",
  watch: null,
  discover: null,
};
const HINTS = { watch: "factory yt watch <handle>", discover: "factory yt discover" };

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").trim();
  if (action && !(action in ACTIONS)) return json(notAvailable(action, HINTS[action]), 400);
  const cmd = action ? ACTIONS[action] : Object.values(ACTIONS).find(Boolean);
  if (!cmd) return json(notAvailable(action || "this", HINTS[action]), 400);
  try {
    return json(await actOn(env, request, { cmd, arg: "", requestedBy: body.requestedBy || "portal" }));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
