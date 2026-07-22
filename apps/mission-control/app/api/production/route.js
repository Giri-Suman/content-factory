import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { repoRoot, startJob } from "../../../lib/factory.js";

const STATES = ["approved", "scripted", "awaiting-capture", "rendered", "qc", "ready", "published"];
const STUCK_H = { default: 24, trend: 6 };

export function GET() {
  const p = path.join(repoRoot, "data", "os", "briefs.json");
  const briefs = existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")).rows || []) : [];
  const cols = Object.fromEntries(STATES.map((s) => [s, []]));
  const alerts = [];
  for (const b of briefs) {
    if (b.status !== "approved" && !b.pipeline) continue;
    const state = b.pipeline?.state || (b.status === "approved" ? "approved" : null);
    if (!state || !cols[state]) continue;
    let stuck = null;
    if (b.pipeline && !["ready", "published"].includes(state)) {
      const hoursIn = (Date.now() - new Date(b.pipeline.updatedAt).getTime()) / 36e5;
      const limit = b.kind === "trend" ? STUCK_H.trend : STUCK_H.default;
      if (hoursIn > limit) stuck = `stuck ${Math.round(hoursIn)}h in ${state} (limit ${limit}h, ${b.kind})`;
    }
    const card = { id: b.id, topic: b.topic, lane: b.lane || "?", kind: b.kind, escalated: b.pipeline?.escalated || false, stuck, shotList: b.pipeline?.shotList || null };
    cols[state].push(card);
    if (stuck) alerts.push({ id: b.id, topic: b.topic, reason: stuck });
  }
  return NextResponse.json({ columns: cols, states: STATES, alerts });
}

// POST {briefId, captureFile?} -> run the lane pipeline as a background job
export async function POST(request) {
  const { briefId, captureFile } = await request.json();
  if (!briefId) return NextResponse.json({ ok: false, error: "missing briefId" }, { status: 400 });
  const args = ["produce", briefId];
  if (captureFile) args.push("--capture-file", captureFile);
  const job = startJob("produce", args);
  return NextResponse.json({ ok: true, jobId: job.id });
}
