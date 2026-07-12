import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync } from "node:fs";
import { rendersDir, startJob } from "../../../lib/factory.js";

// POST {id} -> mines 1-3 clips from renders/<id>/short.mp4
export async function POST(request) {
  const { id } = await request.json();
  const safeId = path.basename(String(id || "")).replace(/[^a-z0-9-]/gi, "");
  if (!safeId || !existsSync(path.join(rendersDir, safeId, "short.mp4"))) {
    return NextResponse.json({ ok: false, error: "no rendered episode for that id" }, { status: 404 });
  }
  const job = startJob("shorts", ["shorts", safeId]);
  return NextResponse.json({ ok: true, jobId: job.id });
}
