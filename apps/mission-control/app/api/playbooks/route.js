/**
 * Refresh playbooks.
 *
 * Ported for the Workers runtime. The disk version spawned the CLI; this queues
 * the same command and answers with when the laptop will run it. Execution is
 * the only thing that changed - the work is identical, it just happens on the
 * machine that has ffmpeg rather than inside this request.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";
import { enqueue, queuedMessage } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function POST(request) {
  const { env } = getRequestContext();
  const body = await request.json().catch(() => ({}));
  const arg = "";
  try {
    const r = await enqueue(env, { cmd: "playbook", arg, requestedBy: body.requestedBy || "portal" });
    return json({ ok: true, queued: true, id: r.record.id, message: queuedMessage(r) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
