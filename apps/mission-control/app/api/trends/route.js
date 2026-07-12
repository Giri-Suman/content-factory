import { NextResponse } from "next/server";
import { readTrends, readConfig, runCli } from "../../../lib/factory.js";

export async function GET() {
  const trends = readTrends()
    .filter((t) => !t.used)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .slice(0, 120);
  return NextResponse.json({ trends, config: readConfig() });
}

// POST = run a radar scan (blocks up to ~4 min, the UI shows a spinner)
export async function POST() {
  const { code, out } = await runCli(["radar"]);
  const trends = readTrends()
    .filter((t) => !t.used)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .slice(0, 120);
  return NextResponse.json({ ok: code === 0, log: out.slice(-4000), trends, config: readConfig() });
}
