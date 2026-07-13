import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { startJob } from "../../../lib/factory.js";

// POST {file, noPunch?, noCaptions?, noise?} -> auto-edit filmed footage on local disk
export async function POST(request) {
  const { file, noPunch, noCaptions, noise } = await request.json();
  if (!file || typeof file !== "string" || !existsSync(file)) {
    return NextResponse.json({ ok: false, error: "file not found on disk — paste the full path to your footage" }, { status: 400 });
  }
  const args = ["edit", file];
  if (noPunch) args.push("--no-punch");
  if (noCaptions) args.push("--no-captions");
  if (noise && /^-\d{1,3}dB$/.test(noise)) args.push(`--noise=${noise}`);
  const job = startJob("edit", args);
  return NextResponse.json({ ok: true, jobId: job.id });
}
