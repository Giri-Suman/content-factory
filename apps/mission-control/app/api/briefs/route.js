/**
 * Briefs — read from R2, generate by queueing.
 *
 * Ported from the disk version: `readFileSync(data/os/briefs.json)` becomes an
 * R2 read of the same file, pushed there by `factory sync push`. Generating a
 * brief used to spawn the CLI; on Workers it queues, and the response says when
 * the laptop will run it.
 */

import { getEnv } from "@factory-env";
import { enqueue, queuedMessage, readCollection, writeCollection, queuedResponse } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const rows = await readCollection(env, "briefs");
  return json({ briefs: rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")) });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  // The old route spawned `factory brief ...`. Same intent, queued instead.
  const cmd = body.topic ? "brief-topic" : "brief";
  try {
    const r = await enqueue(env, { cmd, arg: body.topic || "", requestedBy: body.requestedBy || "portal" });
    return json(queuedResponse(r));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}

/**
 * Edit a brief: approve, kill, tick a checklist item, override the lane.
 *
 * This WRITES rather than queues. Approving a brief is the gate the whole
 * pipeline waits on, and a button that does nothing visible until the laptop
 * wakes would make the page useless from a phone. writeCollection explains the
 * ordering rule this creates with `factory sync push`.
 *
 * The approval side effects (entering the idea bank, fanning out derivatives)
 * DO still need the laptop, so they queue. That is why an approval can be
 * visible here instantly while its downstream work is still pending.
 */
export async function PATCH(request) {
  const env = getEnv();
  const { id, status, payload, checklistState, lane } = await request.json().catch(() => ({}));

  const rows = await readCollection(env, "briefs");
  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return json({ ok: false, error: "unknown brief" }, 404);

  const becameApproved = status === "approved" && rows[i].status !== "approved";
  const now = new Date().toISOString();

  if (status && ["draft", "approved", "killed"].includes(status)) rows[i].status = status;
  if (payload && typeof payload === "object") rows[i].payload = payload;
  if (Array.isArray(checklistState)) rows[i].checklistState = checklistState.map(Boolean);
  if (lane === "synthetic" || lane === "capture") rows[i].lane = lane;
  if (becameApproved && !rows[i].pipeline) {
    rows[i].pipeline = { state: "approved", updatedAt: now, history: [{ state: "approved", at: now }] };
  }
  rows[i].updatedAt = now;

  await writeCollection(env, "briefs", rows);

  let queued = null;
  if (becameApproved) {
    // Best effort: the edit itself already succeeded, and failing the whole
    // request because the queue was full would be a lie about what happened.
    queued = await enqueue(env, { cmd: "catalog-fanout", arg: id, requestedBy: "portal" })
      .then((r) => queuedMessage(r))
      .catch((e) => `approved, but the follow-up did not queue: ${e.message}`);
  }
  return json({ ok: true, brief: rows[i], queued });
}
