/**
 * Spend so far, from the cost ledger.
 *
 * The first port of this route returned { entries, total, budgets } - a
 * reasonable-looking shape that the page cannot use at all. Cost page does
 * `d.last14Days.map(...)` immediately after its loading guard, so a missing key
 * is not a blank section, it is a TypeError that blanks the whole page behind a
 * 200. The aggregation below is the disk version's, unchanged; only the source
 * moved from data/os/costledger.json to the same file in R2.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";
import { readCollection, readConfig } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const round = (n) => Math.round(n * 100) / 100;

export async function GET() {
  const { env } = getRequestContext();
  const [rows, config] = await Promise.all([readCollection(env, "costledger"), readConfig(env)]);
  const cadence = config.dailyCadence ?? 1;
  const today = new Date().toISOString().slice(0, 10);

  const byDay = {};
  const byKind = {};
  const perVideo = {};
  for (const r of rows) {
    const amount = Number(r.amount) || 0;
    const d = (r.at || "").slice(0, 10);
    byDay[d] = (byDay[d] || 0) + amount;
    byKind[r.kind] = (byKind[r.kind] || 0) + amount;
    if (r.videoId) perVideo[r.videoId] = (perVideo[r.videoId] || 0) + amount;
  }

  const videoCosts = Object.entries(perVideo)
    .map(([videoId, amount]) => ({ videoId, amount: round(amount) }))
    .sort((a, b) => b.amount - a.amount);
  const avgPerVideo = videoCosts.length ? round(videoCosts.reduce((a, v) => a + v.amount, 0) / videoCosts.length) : 0;

  return json({
    today: round(byDay[today] || 0),
    byKind: Object.entries(byKind).map(([kind, amount]) => ({ kind, amount: round(amount) })),
    last14Days: Object.entries(byDay)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 14)
      .map(([date, amount]) => ({ date, amount: round(amount) })),
    videoCosts: videoCosts.slice(0, 12),
    avgPerVideo,
    cadence,
    monthlyProjection: round(avgPerVideo * cadence * 30),
    tracked: rows.length,
    // kept from the first port so nothing that started reading these breaks
    entries: rows.slice(-200).reverse(),
    total: round(rows.reduce((a, r) => a + (Number(r.amount) || 0), 0)),
    budgets: config.budgets || [],
  });
}
