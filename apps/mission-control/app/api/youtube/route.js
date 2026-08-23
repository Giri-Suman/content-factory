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
import { enqueue, queuedMessage, readCollection, readEnvFlags, readTrends } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const [trends, channels, videos, flags, quota] = await Promise.all([
    readTrends(env),
    readCollection(env, "watchchannels"),
    readCollection(env, "watchvideos"),
    readEnvFlags(env),
    readCollection(env, "quota"),
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
  });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  try {
    const r = await enqueue(env, { cmd: "yt-trending", arg: "", requestedBy: body.requestedBy || "portal" });
    return json({ ok: true, queued: true, jobId: r.record.id, message: queuedMessage(r) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
