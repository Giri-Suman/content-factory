/**
 * Calibration — measured performance vs the system's predictions.
 *
 * The port returned `{ snapshots }`, a key the page never reads. It wants
 * `perf` (the calibration record) and `youtube` (whether a key is configured).
 */

import { getEnv } from "@factory-env";
import { actOn, notAvailable, readEnvFlags, readPerf } from "../../../lib/cloud.js";

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

/**
 * Which registry command each button means.
 *
 * The port dropped `action` entirely and enqueued one command whatever was
 * pressed, so every button on this page did the same thing. `null` marks an
 * action the registry has no row for - those are refused by name rather than
 * quietly running something else.
 */
const ACTIONS = {
  ingest: "analytics",
  tune: "analytics",
  memo: "cal-memo",
  seed: null,
  revert: null,
};
const HINTS = { seed: "factory seed myposts", revert: "factory analytics" };

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").trim();
  if (action && !(action in ACTIONS)) return json(notAvailable(action, HINTS[action]), 400);
  const cmd = action ? ACTIONS[action] : Object.values(ACTIONS).find(Boolean);
  if (!cmd) return json(notAvailable(action || "this", HINTS[action]), 400);
  try {
    return json(await actOn(env, request, { cmd, arg: "", requestedBy: body.requestedBy || "portal" }));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
