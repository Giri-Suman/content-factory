import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { repoRoot, runCli } from "../../../lib/factory.js";

const os = (name) => {
  const p = path.join(repoRoot, "data", "os", `${name}.json`);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8")).rows || [];
  } catch {
    return [];
  }
};

export async function GET() {
  const crits = os("critiques");
  const judges = ["idea", "script", "metadata", "visual", "audio"];
  const perJudge = judges.map((j) => {
    const rows = crits.filter((c) => c.judge === j);
    const passes = rows.filter((c) => c.verdict === "pass").length;
    return { judge: j, total: rows.length, passes, passRate: rows.length ? Math.round((passes / rows.length) * 100) : null };
  });
  const recentFailures = crits.filter((c) => c.verdict === "fail").slice(-15).reverse();
  const escalations = os("escalations").filter((e) => !e.resolved);
  return NextResponse.json({ perJudge, recentFailures, escalations, total: crits.length });
}

// POST {briefId} -> run QC chain | {resolve: escalationId}
export async function POST(request) {
  const { briefId, resolve } = await request.json();
  if (resolve) {
    const p = path.join(repoRoot, "data", "os", "escalations.json");
    if (existsSync(p)) {
      const store = JSON.parse(readFileSync(p, "utf8"));
      const row = (store.rows || []).find((e) => e.id === resolve);
      if (row) row.resolved = true;
      writeFileSync(p, JSON.stringify(store, null, 2));
    }
    return NextResponse.json({ ok: true });
  }
  if (!briefId) return NextResponse.json({ ok: false, error: "missing briefId" }, { status: 400 });
  const { code, out } = await runCli(["qc", "brief", briefId], 1000 * 60 * 5);
  return NextResponse.json({ ok: code === 0, out: out.slice(-500) }, { status: code === 0 ? 200 : 500 });
}
