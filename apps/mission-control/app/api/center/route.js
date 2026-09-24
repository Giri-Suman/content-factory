/**
 * Publish queue.
 *
 * Ported for Workers: reads come from R2 (the same JSON the laptop writes,
 * pushed by `factory sync push`); anything that used to spawn the CLI now
 * queues and reports when the laptop will run it.
 */

import { getEnv } from "@factory-env";
import { actOn, readCollection, readUiMeta, writeCollection } from "../../../lib/cloud.js";

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
    if (body.action === "send") {
      const id = String(body.briefId || "").trim();
      const briefs = await readCollection(env, "briefs");
      if (!briefs.some((brief) => brief.id === id && brief.status === "approved")) return json({ ok: false, error: "Select an approved brief." }, 400);
      return json(await actOn(env, request, { cmd: "center-send", arg: id }));
    }
    if (body.action === "golden") {
      const rows = await readCollection(env, "publishitems");
      const index = rows.findIndex((item) => item.id === body.itemId && item.status === "published");
      if (index < 0) return json({ ok: false, error: "unknown published item" }, 404);
      rows[index] = { ...rows[index], golden60Done: !rows[index].golden60Done };
      await writeCollection(env, "publishitems", rows);
      return json({ ok: true, out: rows[index].golden60Done ? "Golden 60 completed." : "Golden 60 unchecked." });
    }
    if (body.action === "live" || body.action === "publish") {
      const rows = await readCollection(env, "publishitems");
      const item = rows.find((row) => row.id === body.itemId);
      if (!item) return json({ ok: false, error: "unknown publish item" }, 404);
      if (body.action === "publish" && item.platform === "youtube") return json({ ok: false, error: "YouTube upload still requires the local authenticated publisher. Run factory center publish <itemId> on the laptop." }, 400);
      return json(await actOn(env, request, { cmd: "center-live", arg: item.id }));
    }
    if (body.action === "attach") return json({ ok: false, error: "Attaching a local file path requires the laptop. Use the cloud Footage page for remote uploads." }, 400);
    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
