import { NextResponse } from "next/server";
import { startJob, readEnvKeys } from "../../../lib/factory.js";

// POST {topic} | {demo} -> starts a math-short job
export async function POST(request) {
  const { topic, demo } = await request.json();
  if (demo) {
    const job = startJob("math", ["math", String(demo), "--demo"]);
    return NextResponse.json({ ok: true, jobId: job.id });
  }
  if (!topic || typeof topic !== "string") {
    return NextResponse.json({ ok: false, error: "missing topic" }, { status: 400 });
  }
  if (!readEnvKeys().provider) {
    return NextResponse.json(
      { ok: false, error: "writing a math scene needs an LLM provider — add a key in .env, or run a demo" },
      { status: 400 }
    );
  }
  const job = startJob("math", ["math", topic]);
  return NextResponse.json({ ok: true, jobId: job.id });
}
