import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync } from "node:fs";
import { repoRoot, startJob } from "../../../lib/factory.js";
import { EFFECTS, benchResults, effectPerformance, getEffect, suggestEffects } from "../../../../../packages/studio/src/motionLab.js";

export async function GET(request) {
  const u = new URL(request.url);
  const scene = u.searchParams.get("scene");
  const niche = u.searchParams.get("niche");

  const bench = Object.fromEntries(benchResults().map((b) => [b.effectId, b]));
  const perf = effectPerformance();
  const previewDir = path.join(repoRoot, "renders", "_motion");

  return NextResponse.json({
    ok: true,
    effects: EFFECTS.map((e) => ({
      ...e,
      measured: bench[e.id] || null,
      yours: perf[e.id] || null,
      hasPreview: existsSync(path.join(previewDir, `${e.id}.mp4`)),
    })),
    suggested: scene ? suggestEffects({ sceneType: scene, niche: niche || "coding", limit: 6 }) : [],
    hasResults: Object.keys(perf).length > 0,
  });
}

export async function POST(request) {
  const { action, id, seconds = 3 } = await request.json();

  if (action === "bench") {
    if (!getEffect(id)) return NextResponse.json({ ok: false, error: "unknown effect" }, { status: 400 });
    const job = startJob("motion-bench", ["motion", "bench", id, `--seconds=${seconds}`]);
    return NextResponse.json({ ok: true, jobId: job.id });
  }
  if (action === "benchAll") {
    const job = startJob("motion-bench", ["motion", "bench", "--all", "--seconds=3"]);
    return NextResponse.json({ ok: true, jobId: job.id });
  }
  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
