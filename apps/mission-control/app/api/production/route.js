/**
 * The production conveyor — briefs grouped into pipeline columns.
 *
 * The port returned `{ briefs }`, but the page renders a kanban: it reads
 * `data.alerts.map`, `data.states.map` and `data.columns[state].map`. Missing
 * keys are not blank columns, they are `Cannot read properties of undefined
 * (reading 'map')` — the whole page replaced by a client-side exception, behind
 * a 200 with clean server HTML.
 *
 * The grouping below is the disk version's, unchanged; only the source moved
 * from data/os/briefs.json to the same collection in R2.
 */

import { getEnv } from "@factory-env";
import { enqueue, queuedMessage, readCollection } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const STATES = ["approved", "scripted", "awaiting-capture", "rendered", "qc", "ready", "published"];
/** A trend brief goes stale in hours, an evergreen one in a day. */
const STUCK_H = { default: 24, trend: 6 };

export async function GET() {
  const env = getEnv();
  const briefs = await readCollection(env, "briefs");

  const columns = Object.fromEntries(STATES.map((s) => [s, []]));
  const alerts = [];

  for (const b of briefs) {
    if (b.status !== "approved" && !b.pipeline) continue;
    const state = b.pipeline?.state || (b.status === "approved" ? "approved" : null);
    if (!state || !columns[state]) continue;

    let stuck = null;
    if (b.pipeline && !["ready", "published"].includes(state)) {
      const hoursIn = (Date.now() - new Date(b.pipeline.updatedAt).getTime()) / 36e5;
      const limit = b.kind === "trend" ? STUCK_H.trend : STUCK_H.default;
      if (hoursIn > limit) stuck = `stuck ${Math.round(hoursIn)}h in ${state} (limit ${limit}h, ${b.kind})`;
    }

    columns[state].push({
      id: b.id,
      topic: b.topic,
      lane: b.lane || "?",
      kind: b.kind,
      escalated: b.pipeline?.escalated || false,
      stuck,
      shotList: b.pipeline?.shotList || null,
    });
    if (stuck) alerts.push({ id: b.id, topic: b.topic, reason: stuck });
  }

  return json({ columns, states: STATES, alerts, briefs });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const briefId = String(body.briefId || body.id || "").trim();
  if (!briefId) return json({ ok: false, error: "missing briefId" }, 400);
  try {
    const r = await enqueue(env, { cmd: "produce", arg: briefId, requestedBy: body.requestedBy || "portal" });
    return json({ ok: true, queued: true, jobId: r.record.id, message: queuedMessage(r) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
