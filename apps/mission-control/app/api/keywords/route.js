/**
 * Keyword gap analysis.
 *
 * Ported for Workers: reads come from R2 (the same JSON the laptop writes,
 * pushed by `factory sync push`); anything that used to spawn the CLI now
 * queues and reports when the laptop will run it.
 */

import { getEnv } from "@factory-env";
import { enqueue, readCollection, queuedResponse } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const rows = await readCollection(env, "keywords");
  return json({ keywords: rows });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  try {
    const r = await enqueue(env, { cmd: "keywords", arg: "", requestedBy: body.requestedBy || "portal" });
    return json(queuedResponse(r));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
