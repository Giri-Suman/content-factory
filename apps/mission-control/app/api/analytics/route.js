/**
 * Calibration — measured performance vs the system's predictions.
 *
 * The port returned `{ snapshots }`, a key the page never reads. It wants
 * `perf` (the calibration record) and `youtube` (whether a key is configured).
 */

import { getEnv } from "@factory-env";
import { enqueue, queuedMessage, readEnvFlags, readPerf } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const [perf, flags] = await Promise.all([readPerf(env), readEnvFlags(env)]);
  return json({
    perf,
    youtube: Boolean(flags.youtube),
    tuning: perf?.tuning || null,
    snapshots: perf?.snapshots || [],
  });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  try {
    const r = await enqueue(env, { cmd: "analytics", arg: "", requestedBy: body.requestedBy || "portal" });
    return json({ ok: true, queued: true, jobId: r.record.id, message: queuedMessage(r) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
