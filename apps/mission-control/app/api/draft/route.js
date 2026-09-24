/**
 * Generate a topic brief in a background job. The caller follows the returned
 * job on Brief Studio rather than navigating to a script that does not exist.
 */

import { getEnv } from "@factory-env";
import { actOn } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function POST(request) {
  const env = getEnv();
  const { input } = await request.json().catch(() => ({}));
  if (!input || typeof input !== "string") return json({ ok: false, error: "missing input" }, 400);
  try {
    return json(await actOn(env, request, { cmd: "brief-topic", arg: input }));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
