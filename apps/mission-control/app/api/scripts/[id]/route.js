/**
 * One compiled script.
 *
 * Read-only in the cloud: editing a script writes to the laptop's data/scripts,
 * and a cloud write would be silently overwritten by the next `sync push`.
 * Saying so is better than accepting an edit that quietly disappears.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";
export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

import { readScript } from "../../../../lib/cloud.js";

export async function GET(request, { params }) {
  const { env } = getRequestContext();
  const { id } = await params; // Next 15: params is a Promise
  const script = await readScript(env, id);
  if (!script) return json({ error: "not found" }, 404);
  return json({ script });
}

export async function PUT() {
  return json(
    { ok: false, error: "Scripts are read-only from the cloud portal - edit on the laptop, then `factory sync push`." },
    405
  );
}
