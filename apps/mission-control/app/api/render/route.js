import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync } from "node:fs";
import { scriptsDir, startJob } from "../../../lib/factory.js";

// POST {id} -> kicks off a render job for data/scripts/<id>.json
export async function POST(request) {
  const { id } = await request.json();
  const safeId = path.basename(String(id || "")).replace(/[^a-z0-9-]/gi, "");
  const file = path.join(scriptsDir, `${safeId}.json`);
  if (!safeId || !existsSync(file)) {
    return NextResponse.json({ ok: false, error: "script not found" }, { status: 404 });
  }
  const job = startJob("render", ["render", file]);
  return NextResponse.json({ ok: true, jobId: job.id });
}
