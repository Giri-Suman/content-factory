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

const recency = (iso) => {
  const d = (Date.now() - new Date(iso).getTime()) / 864e5;
  return d <= 7 ? 1 : d <= 30 ? 0.7 : d <= 60 ? 0.4 : 0.1;
};
const weight = (l) => Math.round(l.evidenceCount * recency(l.lastEvidenceAt || l.createdAt) * (l.pinned ? 3 : 1) * 10) / 10;

export function GET() {
  const lessons = os("lessons").filter((l) => l.active).map((l) => ({ ...l, weight: weight(l) })).sort((a, b) => b.weight - a.weight);
  const crits = os("critiques");

  // weekly pass-rate + regen-rate trend (last 6 weeks)
  const weekOf = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / (7 * 864e5));
  const buckets = {};
  for (const c of crits) {
    const wk = weekOf(c.createdAt);
    if (wk > 5 || wk < 0) continue;
    (buckets[wk] ??= { total: 0, pass: 0, regen: 0 }).total++;
    if (c.verdict === "pass") buckets[wk].pass++;
    if (c.attempt > 1) buckets[wk].regen++;
  }
  const trend = [5, 4, 3, 2, 1, 0].map((wk) => {
    const b = buckets[wk] || { total: 0, pass: 0, regen: 0 };
    return {
      label: wk === 0 ? "this wk" : `-${wk}w`,
      passRate: b.total ? Math.round((b.pass / b.total) * 100) : null,
      regenRate: b.total ? Math.round((b.regen / b.total) * 100) : null,
    };
  });

  const monthAgo = Date.now() - 30 * 864e5;
  const lessonsThisMonth = os("lessons").filter((l) => new Date(l.createdAt).getTime() >= monthAgo).length;

  const tasks = ["script", "metadata", "idea", "brief"];
  const versions = os("promptversions");
  const promptVersions = tasks.map((t) => ({
    task: t,
    versions: versions.filter((v) => v.task === t).sort((a, b) => b.version - a.version),
  }));

  return NextResponse.json({ lessons, trend, lessonsThisMonth, promptVersions });
}

// POST {action: distill|pin|kill|propose|approve, id?, task?, template?}
export async function POST(request) {
  const { action, id, task, template } = await request.json();
  const map = {
    distill: ["lessons", "distill"],
    pin: ["lessons", "pin", id || ""],
    kill: ["lessons", "kill", id || ""],
    propose: ["prompts", "propose", task || "", template || "(proposed)"],
    approve: ["prompts", "approve", id || ""],
  };
  const args = map[action];
  if (!args) return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  const { code, out } = await runCli(args, 1000 * 60 * 3);
  return NextResponse.json({ ok: code === 0, out: out.slice(-300) }, { status: code === 0 ? 200 : 500 });
}
