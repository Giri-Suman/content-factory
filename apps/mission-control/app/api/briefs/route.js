import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { repoRoot, runCli } from "../../../lib/factory.js";

const STORE = path.join(repoRoot, "data", "os", "briefs.json");

const read = () => {
  if (!existsSync(STORE)) return [];
  try {
    return JSON.parse(readFileSync(STORE, "utf8")).rows || [];
  } catch {
    return [];
  }
};
const write = (rows) => writeFileSync(STORE, JSON.stringify({ updatedAt: new Date().toISOString(), rows }, null, 2));

export async function GET() {
  return NextResponse.json({ briefs: read().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")) });
}

// POST {clusterId} | {wishlistId} -> generate via the CLI
export async function POST(request) {
  const { clusterId, wishlistId } = await request.json();
  const target = clusterId || wishlistId;
  if (!target) return NextResponse.json({ ok: false, error: "missing clusterId/wishlistId" }, { status: 400 });
  const { code, out } = await runCli(["brief", target], 240000);
  return code === 0
    ? NextResponse.json({ ok: true, out })
    : NextResponse.json({ ok: false, error: out.slice(-300) }, { status: 500 });
}

// PATCH {id, status?|payload?|checklistState?} — direct JSON edit per repo convention
export async function PATCH(request) {
  const { id, status, payload, checklistState } = await request.json();
  const rows = read();
  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return NextResponse.json({ ok: false, error: "unknown brief" }, { status: 404 });
  const becameApproved = status === "approved" && rows[i].status !== "approved";
  if (status && ["draft", "approved", "killed"].includes(status)) rows[i].status = status;
  if (payload && typeof payload === "object") rows[i].payload = payload;
  if (Array.isArray(checklistState)) rows[i].checklistState = checklistState.map(Boolean);
  rows[i].updatedAt = new Date().toISOString();
  write(rows);
  // P14: approval auto-enters the Idea Bank (via CLI — routes never import factory packages)
  if (becameApproved) await runCli(["ideabank", "enter", id], 120000).catch(() => {});
  return NextResponse.json({ ok: true, brief: rows[i] });
}
