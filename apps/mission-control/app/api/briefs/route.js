/**
 * Briefs — read from R2, generate by queueing.
 *
 * Ported from the disk version: `readFileSync(data/os/briefs.json)` becomes an
 * R2 read of the same file, pushed there by `factory sync push`. Generating a
 * brief used to spawn the CLI; on Workers it queues, and the response says when
 * the laptop will run it.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";
import { enqueue, queuedMessage, readCollection } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const { env } = getRequestContext();
  const rows = await readCollection(env, "briefs");
  return json({ briefs: rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")) });
}

export async function POST(request) {
  const { env } = getRequestContext();
  const body = await request.json().catch(() => ({}));
  // The old route spawned `factory brief ...`. Same intent, queued instead.
  const cmd = body.topic ? "brief-topic" : "brief";
  try {
    const r = await enqueue(env, { cmd, arg: body.topic || "", requestedBy: body.requestedBy || "portal" });
    return json({ ok: true, queued: true, id: r.record.id, message: queuedMessage(r) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
