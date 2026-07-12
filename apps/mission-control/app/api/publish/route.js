import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync } from "node:fs";
import { rendersDir, readEnvKeys, compliance, startJob } from "../../../lib/factory.js";

const safe = (id) => path.basename(String(id || "")).replace(/[^a-z0-9-]/gi, "");

// GET ?id= -> compliance report + youtube readiness (no side effects)
export async function GET(request) {
  const id = safe(new URL(request.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const report = await compliance(id);
  return NextResponse.json({ report, canRealUpload: readEnvKeys().youtube });
}

// POST {id, which, privacy, at, go} -> runs `factory publish` as a job
export async function POST(request) {
  const { id, which, privacy, at, go } = await request.json();
  const safeId = safe(id);
  if (!safeId || !existsSync(path.join(rendersDir, safeId))) {
    return NextResponse.json({ ok: false, error: "no render for that id" }, { status: 404 });
  }
  const args = ["publish", safeId, which === "wide" ? "--wide" : "--short"];
  if (privacy === "public") args.push("--public");
  else if (privacy === "unlisted") args.push("--unlisted");
  if (at) args.push("--at", at);
  if (go) args.push("--go");
  const job = startJob("publish", args);
  return NextResponse.json({ ok: true, jobId: job.id });
}
