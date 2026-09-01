/**
 * Publish dry run. The real upload (--go) is deliberately absent from the registry and stays a terminal action.
 */

import { getEnv } from "@factory-env";
export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

import { enqueue, queuedResponse } from "../../../lib/cloud.js";

/**
 * Compliance report for one render.
 *
 * The disk version ran `compliance <id> --json` and returned the parsed report.
 * That check inspects the actual video file with ffmpeg, so it cannot run here -
 * it queues, and the page is told to come back for the result rather than being
 * handed a made-up verdict on whether something is safe to publish.
 */
export async function GET(request) {
  const env = getEnv();
  const id = String(new URL(request.url).searchParams.get("id") || "").replace(/[^a-z0-9-]/gi, "");
  if (!id) return json({ error: "missing id" }, 400);
  try {
    const r = await enqueue(env, { cmd: "compliance", arg: id, requestedBy: "portal" });
    return json({ report: null, canRealUpload: false, ...queuedResponse(r) });
  } catch (e) {
    return json({ report: null, error: e.message }, 400);
  }
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  try {
    const r = await enqueue(env, { cmd: "publish", arg: String(body.renderId || body.id || "").trim(), requestedBy: body.requestedBy || "portal" });
    return json(queuedResponse(r));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}

