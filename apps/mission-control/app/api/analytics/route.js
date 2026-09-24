/**
 * Calibration — measured performance vs the system's predictions.
 *
 * The port returned `{ snapshots }`, a key the page never reads. It wants
 * `perf` (the calibration record) and `youtube` (whether a key is configured).
 */

import { getEnv } from "@factory-env";
import { actOn, notAvailable, readEnvFlags, readPerf } from "../../../lib/cloud.js";
import { readCollection } from "../../../lib/cloud.js";
import { calibrationView } from "../../../lib/calibration-view.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const [perf, flags, posts, memos, tuning] = await Promise.all([
    readPerf(env), readEnvFlags(env), readCollection(env, "myposts"), readCollection(env, "memos"), readCollection(env, "tuning"),
  ]);
  return json({
    state: calibrationView(posts),
    memo: memos[0] || null,
    tuning: [...tuning].reverse(),
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
  ingest: "cal-ingest",
  tune: "cal-tune",
  memo: "cal-memo",
  seed: "cal-seed",
  revert: "cal-revert",
};
const HINTS = {};

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").trim();
  if (action && !(action in ACTIONS)) return json(notAvailable(action, HINTS[action]), 400);
  const cmd = action ? ACTIONS[action] : Object.values(ACTIONS).find(Boolean);
  if (!cmd) return json(notAvailable(action || "this", HINTS[action]), 400);
  try {
    return json(await actOn(env, request, { cmd, arg: action === "revert" ? String(body.id || "").trim() : "" }));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
