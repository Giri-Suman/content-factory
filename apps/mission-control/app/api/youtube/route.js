/**
 * YouTube signal - trends collected from the API, plus a queue trigger.
 */

import { getEnv } from "@factory-env";
export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

import { enqueue, queuedMessage, readTrends } from "../../../lib/cloud.js";

export async function GET() {
  const env = getEnv();
  const rows = await readTrends(env);
  return json({ trends: rows.filter((t) => t.source === "youtube").slice(0, 100) });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  try {
    const r = await enqueue(env, { cmd: "yt-trending", arg: "", requestedBy: body.requestedBy || "portal" });
    return json({ ok: true, queued: true, id: r.record.id, message: queuedMessage(r) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
