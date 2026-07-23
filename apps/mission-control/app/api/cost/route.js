import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { repoRoot } from "../../../lib/factory.js";

const os = (name) => {
  const p = path.join(repoRoot, "data", "os", `${name}.json`);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8")).rows || [];
  } catch {
    return [];
  }
};

const round = (n) => Math.round(n * 100) / 100;

export function GET() {
  const cfgPath = path.join(repoRoot, "data", "config.json");
  const cadence = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")).dailyCadence ?? 1 : 1;
  const rows = os("costledger");
  const today = new Date().toISOString().slice(0, 10);

  const byDay = {};
  const byKind = {};
  const perVideo = {};
  for (const r of rows) {
    const d = (r.at || "").slice(0, 10);
    byDay[d] = (byDay[d] || 0) + r.amount;
    byKind[r.kind] = (byKind[r.kind] || 0) + r.amount;
    if (r.videoId) perVideo[r.videoId] = (perVideo[r.videoId] || 0) + r.amount;
  }
  const videoCosts = Object.entries(perVideo).map(([videoId, amount]) => ({ videoId, amount: round(amount) })).sort((a, b) => b.amount - a.amount);
  const avgPerVideo = videoCosts.length ? round(videoCosts.reduce((a, v) => a + v.amount, 0) / videoCosts.length) : 0;

  return NextResponse.json({
    today: round(byDay[today] || 0),
    byKind: Object.entries(byKind).map(([kind, amount]) => ({ kind, amount: round(amount) })),
    last14Days: Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14).map(([date, amount]) => ({ date, amount: round(amount) })),
    videoCosts: videoCosts.slice(0, 12),
    avgPerVideo,
    cadence,
    monthlyProjection: round(avgPerVideo * cadence * 30),
    tracked: rows.length,
  });
}
