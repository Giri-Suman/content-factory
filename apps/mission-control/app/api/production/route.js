/**
 * Briefs moving through the pipeline.
 *
 * Ported for Workers: reads come from R2 (the same JSON the laptop writes,
 * pushed by `factory sync push`); anything that used to spawn the CLI now
 * queues and reports when the laptop will run it.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";
import { enqueue, queuedMessage, readCollection } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const { env } = getRequestContext();
  const rows = await readCollection(env, "briefs");
  return json({ briefs: rows });
}

export async function POST(request) {
  const { env } = getRequestContext();
  const body = await request.json().catch(() => ({}));
  try {
    const r = await enqueue(env, { cmd: "produce", arg: String(body.briefId || body.id || "").trim(), requestedBy: body.requestedBy || "portal" });
    return json({ ok: true, queued: true, id: r.record.id, message: queuedMessage(r) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
