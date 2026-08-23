/**
 * Motion effect catalog.
 *
 * Ported for the Workers runtime. The disk version spawned the CLI; this queues
 * the same command and answers with when the laptop will run it. Execution is
 * the only thing that changed - the work is identical, it just happens on the
 * machine that has ffmpeg rather than inside this request.
 */

import { getEnv } from "@factory-env";
import { enqueue, queuedMessage } from "../../../lib/cloud.js";
import { EFFECTS, suggestEffects } from "../../../../../packages/studio/src/motionEffects.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/**
 * The effect catalog.
 *
 * The disk version also reported each effect's MEASURED attention score and
 * whether a preview mp4 existed - both produced by running ffmpeg here. Neither
 * can exist in a Worker, so they come back null and the UI shows the catalog
 * without them rather than inventing numbers. Run `motion bench` on the laptop
 * to fill them in.
 */
export async function GET(request) {
  const u = new URL(request.url);
  const scene = u.searchParams.get("scene");
  const niche = u.searchParams.get("niche");
  return json({
    ok: true,
    effects: EFFECTS.map((e) => ({ ...e, measured: null, yours: null, hasPreview: false })),
    suggested: scene ? suggestEffects({ sceneType: scene, niche: niche || "coding", limit: 6 }) : [],
    hasResults: false,
    measuredOnLaptop: true, // tells the UI why the measurement columns are empty
  });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const arg = "";
  try {
    const r = await enqueue(env, { cmd: "motion-list", arg, requestedBy: body.requestedBy || "portal" });
    return json({ ok: true, queued: true, id: r.record.id, message: queuedMessage(r) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
