import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { repoRoot, runCli, readEnvKeys } from "../../../lib/factory.js";

const os = (name) => {
  const p = path.join(repoRoot, "data", "os", `${name}.json`);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8")).rows || [];
  } catch {
    return [];
  }
};

// GET -> calibration state (joins/memo/scorecard/tuning) computed via CLI --json
export async function GET() {
  const { code, out } = await runCli(["calibrate", "state", "--json"], 60000);
  const line = out.split(/\r?\n/).reverse().find((l) => l.startsWith("RESULT "));
  const state = code === 0 && line ? JSON.parse(line.slice(7)) : null;
  return NextResponse.json({
    state,
    memo: os("memos")[0] || null,
    tuning: os("tuning").slice(-20).reverse(),
    youtube: readEnvKeys().youtube,
  });
}

// POST {action: seed|ingest|memo|tune|revert, id?}
export async function POST(request) {
  const { action, id } = await request.json().catch(() => ({}));
  const map = {
    seed: ["calibrate", "seed", "25"],
    ingest: ["calibrate", "ingest"],
    memo: ["calibrate", "memo"],
    tune: ["calibrate", "tune"],
    revert: ["calibrate", "revert", id || ""],
  };
  const args = map[action];
  if (!args) return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  const { code, out } = await runCli(args, 1000 * 60 * 3);
  return NextResponse.json({ ok: code === 0, out: out.slice(-400) }, { status: code === 0 ? 200 : 500 });
}
