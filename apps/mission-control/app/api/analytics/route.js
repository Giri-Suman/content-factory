import { NextResponse } from "next/server";
import { readPerf, readEnvKeys, startJob } from "../../../lib/factory.js";

export async function GET() {
  return NextResponse.json({ perf: readPerf(), youtube: readEnvKeys().youtube });
}

// POST -> refresh analytics (pull stats -> recompute weights) as a job
export async function POST() {
  const job = startJob("analytics", ["analytics"]);
  return NextResponse.json({ ok: true, jobId: job.id });
}
