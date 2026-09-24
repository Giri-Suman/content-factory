/**
 * Keyword gap analysis.
 *
 * Ported for Workers: reads come from R2 (the same JSON the laptop writes,
 * pushed by `factory sync push`); anything that used to spawn the CLI now
 * queues and reports when the laptop will run it.
 */

import { getEnv } from "@factory-env";
import { actOn, readCollection } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const [rows, quota] = await Promise.all([readCollection(env, "keywords"), readCollection(env, "quota")]);
  const today = new Date().toISOString().slice(0, 10);
  const unitsToday = quota.filter((r) => r.date === today && r.job === "yt-kwgap").reduce((sum, r) => sum + (Number(r.units) || 0), 0);
  return json({ keywords: rows.sort((a, b) => (b.opportunity || 0) - (a.opportunity || 0)), unitsToday, budget: 2200 });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  try {
    const keyword = String(body.keyword || "").trim();
    return json(await actOn(env, request, { cmd: keyword ? "brief-topic" : "keywords", arg: keyword }));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
