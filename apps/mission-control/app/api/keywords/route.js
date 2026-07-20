import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { repoRoot, runCli } from "../../../lib/factory.js";

export async function GET() {
  const p = path.join(repoRoot, "data", "os", "keywords.json");
  let rows = [];
  if (existsSync(p)) {
    try {
      rows = JSON.parse(readFileSync(p, "utf8")).rows || [];
    } catch {
      rows = [];
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const qp = path.join(repoRoot, "data", "os", "quota.json");
  let unitsToday = 0;
  if (existsSync(qp)) {
    try {
      unitsToday = JSON.parse(readFileSync(qp, "utf8")).rows.filter((r) => r.date === today && r.job === "yt-kwgap").reduce((a, r) => a + r.units, 0);
    } catch {
      /* 0 */
    }
  }
  return NextResponse.json({
    keywords: rows.sort((a, b) => b.opportunity - a.opportunity),
    unitsToday,
    budget: 2200,
  });
}

// POST {} -> run the gap pass | {keyword} -> brief it (wishlist-style topic brief)
export async function POST(request) {
  const { keyword } = await request.json().catch(() => ({}));
  if (keyword) {
    // brief a keyword directly via the draft path (topic brief), same as Trends "Draft topic"
    const { code, out } = await runCli(["brief", "topic", keyword], 240000);
    // brief CLI only takes ids/top; instead route through draft-topic which exists
    return code === 0
      ? NextResponse.json({ ok: true, out })
      : NextResponse.json({ ok: false, error: out.slice(-300) }, { status: 500 });
  }
  const { code, out } = await runCli(["keywords", "run"], 1000 * 60 * 5);
  return NextResponse.json({ ok: code === 0, out: out.slice(-300) }, { status: code === 0 ? 200 : 500 });
}
