import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
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

export function GET() {
  const formats = os("formatregistry").sort((a, b) => a.num - b.num);
  const bank = os("ideabank");
  const leads = os("commentleads").filter((l) => !l.used);
  const laneCounts = { synthetic: 0, capture: 0, hybrid: 0 };
  for (const f of formats) if (f.active) laneCounts[f.lane] = (laneCounts[f.lane] || 0) + 1;
  return NextResponse.json({
    formats,
    laneCounts,
    ideaCount: bank.length,
    backlog: bank.filter((i) => i.status === "backlog").length,
    commentLeads: leads.slice(0, 10),
  });
}

// POST {action} — seed / compose jobs via the CLI
export async function POST(request) {
  const { action, briefId } = await request.json();
  const map = {
    "seed-formats": ["catalog", "seed-formats"],
    "seed-ideas": ["catalog", "seed-ideas"],
    newsletter: ["catalog", "newsletter"],
    comments: ["catalog", "comments"],
    carousel: ["catalog", "carousel", briefId || ""],
    blog: ["catalog", "blog", briefId || ""],
  };
  const args = map[action];
  if (!args) return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  const { code, out } = await runCli(args, 1000 * 60 * 3);
  return NextResponse.json({ ok: code === 0, out: out.slice(-300) }, { status: code === 0 ? 200 : 500 });
}
