/**
 * One compiled script.
 *
 * R2 is canonical for remote edits. The sync layer compares remote timestamps
 * before a laptop push, so a reviewed script cannot be silently overwritten.
 */

import { getEnv } from "@factory-env";
export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

import { readScript, writeScript } from "../../../../lib/cloud.js";
import { identityFromRequest } from "../../../../lib/identity.js";

export async function GET(request, { params }) {
  const env = getEnv();
  const { id } = await params; // Next 15: params is a Promise
  const script = await readScript(env, id);
  if (!script) return json({ error: "not found" }, 404);
  return json({ script });
}

export async function PUT(request, { params }) {
  const env = getEnv();
  const { id } = await params;
  const { script } = await request.json().catch(() => ({}));
  try {
    const saved = await writeScript(env, id, script, identityFromRequest(request).email);
    return json({ ok: true, script: saved });
  } catch (error) {
    return json({ ok: false, error: error.message }, 400);
  }
}
