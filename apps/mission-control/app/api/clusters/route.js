import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { repoRoot } from "../../../lib/factory.js";

const readJson = (p, fb) => {
  if (!existsSync(p)) return fb;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fb;
  }
};

// GET -> ranked clusters with resolved member links
export async function GET() {
  const clusters = readJson(path.join(repoRoot, "data", "os", "clusters.json"), { rows: [] }).rows;
  const trends = readJson(path.join(repoRoot, "data", "trends.json"), { trends: {} }).trends;
  const resolved = clusters
    .map((c) => ({
      ...c,
      members: (c.memberIds || [])
        .map((id) => trends[id])
        .filter(Boolean)
        .map((t) => ({ id: t.id, title: t.title, url: t.url, source: t.source, points: t.points, velocity: t.velocity })),
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
  return NextResponse.json({ clusters: resolved });
}

// POST {clusterId} -> Generate Briefs stub (Brief Studio lands in P6)
export async function POST(request) {
  const { clusterId } = await request.json();
  return NextResponse.json({
    ok: false,
    stub: true,
    error: `Brief Studio arrives in P6 — cluster ${clusterId || "?"} noted. For now: factory script "<topic>"`,
  });
}
