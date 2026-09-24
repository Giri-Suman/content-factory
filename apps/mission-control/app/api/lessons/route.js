/**
 * Refresh the lessons digest.
 *
 * Ported for the Workers runtime. The disk version spawned the CLI; this queues
 * the same command and answers with when the laptop will run it. Execution is
 * the only thing that changed - the work is identical, it just happens on the
 * machine that has ffmpeg rather than inside this request.
 */

import { getEnv } from "@factory-env";
import { actOn, readCollection, writeCollection } from "../../../lib/cloud.js";

export const runtime = "edge";

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
  try {
    if (body.action === "distill") return json(await actOn(env, request, { cmd: "lessons-distill" }));
    if (body.action === "pin" || body.action === "kill") {
      const rows = await readCollection(env, "lessons");
      const index = rows.findIndex((row) => row.id === body.id);
      if (index < 0) return json({ ok: false, error: "unknown lesson" }, 404);
      rows[index] = body.action === "pin"
        ? { ...rows[index], pinned: !rows[index].pinned, active: true }
        : { ...rows[index], active: false };
      await writeCollection(env, "lessons", rows);
      return json({ ok: true, out: body.action === "pin" ? (rows[index].pinned ? "Lesson pinned." : "Lesson unpinned.") : "Lesson retired." });
    }
    if (body.action === "approve") {
      const rows = await readCollection(env, "promptversions");
      const target = rows.find((row) => row.id === body.id && row.proposed);
      if (!target) return json({ ok: false, error: "unknown proposed version" }, 404);
      const now = new Date().toISOString();
      await writeCollection(env, "promptversions", rows.map((row) => row.task !== target.task ? row
        : row.id === target.id ? { ...row, active: true, proposed: false, approvedAt: now }
          : row.active ? { ...row, active: false, retired: true } : row));
      return json({ ok: true, out: `Approved ${target.task} version ${target.version}.` });
    }
    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
