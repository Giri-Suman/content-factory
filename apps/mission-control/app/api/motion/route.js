/**
 * Motion effect catalog.
 *
 * Ported for the Workers runtime. The disk version spawned the CLI; this queues
 * the same command and answers with when the laptop will run it. Execution is
 * the only thing that changed - the work is identical, it just happens on the
 * machine that has ffmpeg rather than inside this request.
 */

import { getEnv } from "@factory-env";
import { enqueue, readMotionMeta, queuedResponse, notAvailable } from "../../../lib/cloud.js";
import { EFFECTS, suggestEffects } from "../../../../../packages/studio/src/motionEffects.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/**
 * The effect catalog, with the measurements the laptop published.
 *
 * The first port hardcoded `measured: null` and `hasPreview: false` on the
 * grounds that neither can be produced inside a Worker. True, but they do not
 * have to be produced here - the preview mp4s are in R2 under renders/_motion/,
 * and the bench numbers are pushed to state/motion.json by `sync push`. Left as
 * they were, the page showed 22 effects with every column blank and no preview,
 * which reads as "never measured" rather than "measured elsewhere".
 */
export async function GET(request) {
  const env = getEnv();
  const u = new URL(request.url);
  const scene = u.searchParams.get("scene");
  const niche = u.searchParams.get("niche");

  const [meta, listed] = await Promise.all([
    readMotionMeta(env),
    env?.QUEUE ? env.QUEUE.list({ prefix: "renders/_motion/", limit: 100 }) : Promise.resolve({ objects: [] }),
  ]);
  const previews = new Set(listed.objects.map((o) => o.key.slice("renders/_motion/".length).replace(/\.mp4$/i, "")));
  const bench = Object.fromEntries((meta.bench || []).map((b) => [b.effectId || b.id, b]));
  const perf = meta.performance || {};

  return json({
    ok: true,
    effects: EFFECTS.map((e) => ({
      ...e,
      measured: bench[e.id] || null,
      yours: perf[e.id] || null,
      hasPreview: previews.has(e.id),
    })),
    suggested: scene ? suggestEffects({ sceneType: scene, niche: niche || "coding", limit: 6 }) : [],
    hasResults: Object.keys(perf).length > 0,
    benchedAt: meta.at || null,
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
  bench: null,
  benchAll: null,
};
const HINTS = { bench: "factory motion bench <id>", benchAll: "factory motion bench --all" };

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").trim();
  if (action && !(action in ACTIONS)) return json(notAvailable(action, HINTS[action]), 400);
  const cmd = action ? ACTIONS[action] : Object.values(ACTIONS).find(Boolean);
  if (!cmd) return json(notAvailable(action || "this", HINTS[action]), 400);
  const arg = "";
  try {
    const r = await enqueue(env, { cmd, arg, requestedBy: body.requestedBy || "portal" });
    return json(queuedResponse(r));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
