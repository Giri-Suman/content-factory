/**
 * QC judge network — pass rates per judge, recent failures, open escalations.
 *
 * The port returned only `{ escalations }`, so the page read `total.toString()`,
 * `perJudge.map` and `recentFailures.map` off undefined. The aggregation is the
 * disk version's; only the source moved to R2.
 */

import { getEnv } from "@factory-env";
import { actOn, readCollection } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const JUDGES = ["idea", "script", "metadata", "visual", "audio"];

export async function GET() {
  const env = getEnv();
  const [crits, escalations] = await Promise.all([
    readCollection(env, "critiques"),
    readCollection(env, "escalations"),
  ]);

  const perJudge = JUDGES.map((judge) => {
    const rows = crits.filter((c) => c.judge === judge);
    const passes = rows.filter((c) => c.verdict === "pass").length;
    return { judge, total: rows.length, passes, passRate: rows.length ? Math.round((passes / rows.length) * 100) : null };
  });

  return json({
    perJudge,
    recentFailures: crits.filter((c) => c.verdict === "fail").slice(-15).reverse(),
    escalations: escalations.filter((e) => !e.resolved),
    total: crits.length,
  });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  // Resolving an escalation is a WRITE to a collection the laptop owns; the next
  // `sync push` would overwrite it, so it queues like everything else.
  try {
    const r = await actOn(env, request, { cmd: "qc", arg: String(body.briefId || body.id || "").trim(), requestedBy: body.requestedBy || "portal", });
    return json(r);
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
