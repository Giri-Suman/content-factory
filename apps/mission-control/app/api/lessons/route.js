/**
 * Refresh the lessons digest.
 *
 * Ported for the Workers runtime. The disk version spawned the CLI; this queues
 * the same command and answers with when the laptop will run it. Execution is
 * the only thing that changed - the work is identical, it just happens on the
 * machine that has ffmpeg rather than inside this request.
 */

import { getEnv } from "@factory-env";
import { enqueue, queuedMessage, readCollection } from "../../../lib/cloud.js";

export const runtime = process.env.FACTORY_TARGET === "pages" ? "edge" : "nodejs";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/**
 * The lessons digest: active lessons ranked by weight, plus the quality trend.
 *
 * Same arithmetic as the disk version - only the source moved, from
 * data/os/*.json to the copies of those files in R2.
 */
const recency = (iso) => {
  const d = (Date.now() - new Date(iso).getTime()) / 864e5;
  return d <= 7 ? 1 : d <= 30 ? 0.7 : d <= 60 ? 0.4 : 0.1;
};
const weight = (l) =>
  Math.round(l.evidenceCount * recency(l.lastEvidenceAt || l.createdAt) * (l.pinned ? 3 : 1) * 10) / 10;

export async function GET() {
  const env = getEnv();
  const [all, crits, versions] = await Promise.all([
    readCollection(env, "lessons"),
    readCollection(env, "critiques"),
    readCollection(env, "promptversions"),
  ]);

  const lessons = all
    .filter((l) => l.active)
    .map((l) => ({ ...l, weight: weight(l) }))
    .sort((a, b) => b.weight - a.weight);

  // weekly pass-rate + regen-rate over the last six weeks
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
  const lessonsThisMonth = all.filter((l) => new Date(l.createdAt).getTime() >= monthAgo).length;

  const promptVersions = ["script", "metadata", "idea", "brief"].map((task) => ({
    task,
    versions: versions.filter((v) => v.task === task).sort((a, b) => b.version - a.version),
  }));

  return json({ lessons, trend, lessonsThisMonth, promptVersions });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const arg = "";
  try {
    const r = await enqueue(env, { cmd: "lessons", arg, requestedBy: body.requestedBy || "portal" });
    return json({ ok: true, queued: true, id: r.record.id, message: queuedMessage(r) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
