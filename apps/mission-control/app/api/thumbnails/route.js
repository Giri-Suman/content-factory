/**
 * Generate thumbnails for a render.
 *
 * Ported for the Workers runtime. The disk version spawned the CLI; this queues
 * the same command and answers with when the laptop will run it. Execution is
 * the only thing that changed - the work is identical, it just happens on the
 * machine that has ffmpeg rather than inside this request.
 */

import { getEnv } from "@factory-env";
import { actOn, readCollection } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const rows = await readCollection(env, "thumbnails");
  const thumbnails = rows
    .map((t) => ({
      briefId: t.briefId,
      renderId: `brief-${String(t.briefId).slice(0, 10)}`,
      variants: (t.variants || []).map((v) => v.layout),
      judged: t.judged || [],
      copy: t.copy,
      at: t.at,
    }))
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  return json({ thumbnails });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const arg = String(body.renderId || body.id || "").trim();
  try {
    return json(await actOn(env, request, { cmd: "thumbnails", arg, requestedBy: body.requestedBy || "portal" }));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
