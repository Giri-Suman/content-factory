/**
 * Publish queue.
 *
 * Ported for Workers: reads come from R2 (the same JSON the laptop writes,
 * pushed by `factory sync push`); anything that used to spawn the CLI now
 * queues and reports when the laptop will run it.
 */

import { getEnv } from "@factory-env";
import { enqueue, queuedMessage, readCollection, readUiMeta } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const [rows, ui] = await Promise.all([readCollection(env, "publishitems"), readUiMeta(env)]);
  /* The Publish page shows an OAuth banner from `ytOauth` and hides the
     one-click publish button unless `autoMode`. Both were missing from the port,
     so the page claimed YouTube was not connected regardless of the truth.
     They are env-derived on the laptop and arrive in state/ui.json. */
  return json({
    items: rows.sort((a, b) => String(a.scheduledFor || "z").localeCompare(String(b.scheduledFor || "z"))),
    ytOauth: Boolean(ui.flags?.youtubeOauth ?? ui.flags?.youtubeVerified),
    autoMode: ui.flags?.publishMode === "auto" && Boolean(ui.flags?.youtubeVerified),
  });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  try {
    const r = await enqueue(env, { cmd: "center", arg: "", requestedBy: body.requestedBy || "portal" });
    return json({ ok: true, queued: true, id: r.record.id, message: queuedMessage(r) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
