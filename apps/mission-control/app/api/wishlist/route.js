/**
 * Wishlist — posts you want to learn from, and their autopsies.
 *
 * The page reads `entries` and `hasYtKey`; the port returned `wishlist`, so the
 * list was permanently empty and the "add by URL" box never explained that it
 * needs a YouTube key.
 */

import { getEnv } from "@factory-env";
import { enqueue, queuedMessage, readCollection, readEnvFlags } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const [rows, flags] = await Promise.all([readCollection(env, "wishlist"), readEnvFlags(env)]);
  return json({ entries: rows, hasYtKey: Boolean(flags.youtube), wishlist: rows });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  try {
    const r = await enqueue(env, {
      cmd: "ideabank-rank",
      arg: "",
      requestedBy: body.requestedBy || "portal",
    });
    return json({ ok: true, queued: true, jobId: r.record.id, message: queuedMessage(r) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
