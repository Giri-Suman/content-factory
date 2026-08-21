/**
 * Today's shortlist.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";
export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

import { enqueue, queuedMessage } from "../../../lib/cloud.js";

export async function POST(request) {
  const { env } = getRequestContext();
  const body = await request.json().catch(() => ({}));
  try {
    const r = await enqueue(env, { cmd: "ideabank-rank", arg: "", requestedBy: body.requestedBy || "portal" });
    return json({ ok: true, queued: true, id: r.record.id, message: queuedMessage(r) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}

export async function GET() {
  return json({ ok: true, note: "queue-only endpoint - POST to run" });
}
