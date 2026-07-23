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
  return NextResponse.json({
    playbooks: os("playbooks"),
    proposals: os("playbookproposals").filter((p) => p.status === "pending"),
    signals: os("playbooksignals").filter((s) => !s.reviewed),
  });
}

// POST {action: refresh|approve|reject, id?}
export async function POST(request) {
  const { action, id } = await request.json();
  const map = {
    refresh: ["playbook", "refresh"],
    approve: ["playbook", "approve", id || ""],
    reject: ["playbook", "reject", id || ""],
  };
  const args = map[action];
  if (!args) return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  const { code, out } = await runCli(args, 120000);
  return NextResponse.json({ ok: code === 0, out: out.slice(-300) }, { status: code === 0 ? 200 : 500 });
}
