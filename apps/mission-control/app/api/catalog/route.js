/**
 * Fan a brief out into other formats.
 *
 * Ported for the Workers runtime. The disk version spawned the CLI; this queues
 * the same command and answers with when the laptop will run it. Execution is
 * the only thing that changed - the work is identical, it just happens on the
 * machine that has ffmpeg rather than inside this request.
 */

import { getEnv } from "@factory-env";
import { enqueue, queuedMessage, readCollection } from "../../../lib/cloud.js";

export const runtime = process.env.FACTORY_TARGET === "pages" ? "edge" : "nodejs";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const [formats, bank, leads] = await Promise.all([
    readCollection(env, "formatregistry"),
    readCollection(env, "ideabank"),
    readCollection(env, "commentleads"),
  ]);
  const laneCounts = { synthetic: 0, capture: 0, hybrid: 0 };
  for (const f of formats) if (f.active) laneCounts[f.lane] = (laneCounts[f.lane] || 0) + 1;
  return json({
    formats: [...formats].sort((a, b) => a.num - b.num),
    laneCounts,
    ideaCount: bank.length,
    backlog: bank.filter((i) => i.status === "backlog").length,
    commentLeads: leads.filter((l) => !l.used).slice(0, 10),
  });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const arg = String(body.briefId || body.id || "").trim();
  try {
    const r = await enqueue(env, { cmd: "catalog-fanout", arg, requestedBy: body.requestedBy || "portal" });
    return json({ ok: true, queued: true, id: r.record.id, message: queuedMessage(r) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
