import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { repoRoot, runCli } from "../../../lib/factory.js";

export async function GET() {
  const p = path.join(repoRoot, "data", "os", "titlepatterns.json");
  let patterns = [];
  if (existsSync(p)) {
    try {
      patterns = JSON.parse(readFileSync(p, "utf8")).rows || [];
    } catch {
      patterns = [];
    }
  }
  return NextResponse.json({
    patterns: patterns.sort((a, b) => (b.avgOutlierRatio || 0) - (a.avgOutlierRatio || 0)),
  });
}

// POST {title} | {hook} | {action:"extract"} — scoring runs via the CLI (may hit the LLM)
export async function POST(request) {
  const { title, hook, action } = await request.json();
  if (action === "extract") {
    const { code, out } = await runCli(["lab", "extract"], 240000);
    return NextResponse.json({ ok: code === 0, out: out.slice(-300) });
  }
  const args = title ? ["lab", "score", title] : hook ? ["lab", "hook", hook] : null;
  if (!args) return NextResponse.json({ ok: false, error: "missing title/hook" }, { status: 400 });
  const { code, out } = await runCli(args, 120000);
  const line = out.split(/\r?\n/).reverse().find((l) => l.startsWith("RESULT "));
  if (code !== 0 || !line) return NextResponse.json({ ok: false, error: out.slice(-300) }, { status: 500 });
  return NextResponse.json({ ok: true, result: JSON.parse(line.slice(7)) });
}
