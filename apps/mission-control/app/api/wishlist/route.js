/**
 * Idea wishlist.
 *
 * Ported for Workers: reads come from R2 (the same JSON the laptop writes,
 * pushed by `factory sync push`); anything that used to spawn the CLI now
 * queues and reports when the laptop will run it.
 */

import { getEnv } from "@factory-env";
import { enqueue, queuedMessage, readCollection, writeCollection } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const rows = await readCollection(env, "wishlist");
  return json({ wishlist: rows });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  try {
    const r = await enqueue(env, { cmd: "ideabank-rank", arg: "", requestedBy: body.requestedBy || "portal" });
    return json({ ok: true, queued: true, id: r.record.id, message: queuedMessage(r) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}

/** Remove one row. A direct edit, not a job - see writeCollection's note. */
export async function DELETE(request) {
  const env = getEnv();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ ok: false, error: "id required" }, 400);
  const rows = await readCollection(env, "wishlist");
  await writeCollection(env, "wishlist", rows.filter((r) => r.id !== id));
  return json({ ok: true });
}
