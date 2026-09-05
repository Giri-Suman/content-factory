/**
 * Render a brief into video.
 *
 * Ported for the Workers runtime. The disk version spawned the CLI; this queues
 * the same command and answers with when the laptop will run it. Execution is
 * the only thing that changed - the work is identical, it just happens on the
 * machine that has ffmpeg rather than inside this request.
 */

import { getEnv } from "@factory-env";
import { actOn } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const arg = String(body.briefId || body.id || "").trim();
  try {
    return json(await actOn(env, request, { cmd: "produce", arg, requestedBy: body.requestedBy || "portal" }));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
