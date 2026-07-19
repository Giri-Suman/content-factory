import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { startJob, runCli, repoRoot, envSet } from "../../../lib/factory.js";

const os = (name) => {
  const p = path.join(repoRoot, "data", "os", `${name}.json`);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8")).rows || [];
  } catch {
    return [];
  }
};

// GET -> everything the YouTube page needs, read straight from the OS stores
export async function GET() {
  const hasKey = envSet("YOUTUBE_API_KEY");

  const trends = (() => {
    const p = path.join(repoRoot, "data", "trends.json");
    if (!existsSync(p)) return [];
    try {
      return Object.values(JSON.parse(readFileSync(p, "utf8")).trends || {});
    } catch {
      return [];
    }
  })();

  const channels = os("watchchannels");
  const videos = os("watchvideos");
  const chTitle = new Map(channels.map((c) => [c.id, c.title]));
  const cutoff = Date.now() - 14 * 864e5;
  const outliers = videos
    .filter((v) => v.outlierRatio >= 3 && v.publishedAt && new Date(v.publishedAt).getTime() >= cutoff)
    .map((v) => ({ ...v, channelTitle: chTitle.get(v.channelId) || v.channelId }))
    .sort((a, b) => b.outlierRatio - a.outlierRatio);

  const today = new Date().toISOString().slice(0, 10);
  const quotaToday = os("quota").filter((r) => r.date === today).reduce((a, r) => a + r.units, 0);

  const shortsOutliers = videos
    .filter((v) => v.isShort && v.outlierRatio >= 3 && v.publishedAt && new Date(v.publishedAt).getTime() >= cutoff)
    .map((v) => ({ ...v, channelTitle: chTitle.get(v.channelId) || v.channelId }))
    .sort((a, b) => b.outlierRatio - a.outlierRatio);

  return NextResponse.json({
    hasKey,
    quotaToday,
    trending: trends.filter((t) => t.source === "yt-trending").sort((a, b) => b.points - a.points).slice(0, 25),
    heat: trends.filter((t) => t.source === "yt-heat").sort((a, b) => b.points - a.points).slice(0, 25),
    channels: channels.map((c) => ({
      ...c,
      videos: videos.filter((v) => v.channelId === c.id).sort((a, b) => (b.outlierRatio || 0) - (a.outlierRatio || 0)).slice(0, 8),
    })),
    outliers: outliers.slice(0, 20),
    shortsOutliers: shortsOutliers.slice(0, 25),
    discovery: os("discoveries").sort((a, b) => (b.at || "").localeCompare(a.at || ""))[0] || null,
    nichemap: os("nichemap")[0] || null,
  });
}

// POST {action: "watch"|"scan"|"discover"|"analyzeShort"} -> live API work via the CLI
export async function POST(request) {
  const { action, handle, seed, videoId } = await request.json();
  if (action === "discover") {
    if (!seed || typeof seed !== "string") return NextResponse.json({ ok: false, error: "missing seed" }, { status: 400 });
    const { code, out } = await runCli(["yt", "discover", seed.trim()], 240000);
    return NextResponse.json({ ok: code === 0, out: out.slice(-400) }, { status: code === 0 ? 200 : 500 });
  }
  if (action === "analyzeShort" || action === "briefShort") {
    if (!videoId) return NextResponse.json({ ok: false, error: "missing videoId" }, { status: 400 });
    const { code, out } = await runCli(["wishlist", "add", `https://youtube.com/watch?v=${videoId}`], 180000);
    if (code !== 0) return NextResponse.json({ ok: false, error: out.slice(-300) }, { status: 500 });
    if (action === "briefShort") {
      const line = out.split(/\r?\n/).reverse().find((l) => l.startsWith("RESULT "));
      const entryId = line ? JSON.parse(line.slice(7)).id : null;
      if (entryId) {
        const b = await runCli(["brief", entryId], 240000);
        return NextResponse.json({ ok: b.code === 0, out: b.out.slice(-300), briefed: true });
      }
    }
    return NextResponse.json({ ok: true, out: out.slice(-300) });
  }
  if (action === "watch") {
    if (!handle || typeof handle !== "string") {
      return NextResponse.json({ ok: false, error: "missing handle" }, { status: 400 });
    }
    const { code, out } = await runCli(["yt", "watch", handle.trim()], 120000);
    return code === 0
      ? NextResponse.json({ ok: true, out })
      : NextResponse.json({ ok: false, error: out.slice(-400) }, { status: 500 });
  }
  if (action === "scan") {
    const job = startJob("yt-scan", ["yt", "trending"]);
    const job2 = startJob("yt-heat", ["yt", "heat"]);
    return NextResponse.json({ ok: true, jobIds: [job.id, job2.id] });
  }
  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
