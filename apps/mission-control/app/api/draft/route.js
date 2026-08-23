/**
 * Draft a script from a trend headline.
 *
 * The disk route ran the CLI, waited up to six minutes, then handed back an id
 * so the page could navigate straight to the new script. Queued work cannot do
 * that — the script does not exist yet, so navigating would 404.
 *
 * So this deliberately answers `ok: false` with the queue message in `error`,
 * which is the field the Trends page renders. The wording says it was queued and
 * when it will run; what it must NOT do is claim success and then send the user
 * to a page that is not there.
 */

import { getEnv } from "@factory-env";
import { enqueue, queuedMessage } from "../../../lib/cloud.js";

export const runtime = process.env.FACTORY_TARGET === "pages" ? "edge" : "nodejs";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function POST(request) {
  const env = getEnv();
  const { input } = await request.json().catch(() => ({}));
  if (!input || typeof input !== "string") return json({ ok: false, error: "missing input" }, 400);
  try {
    const r = await enqueue(env, { cmd: "brief-topic", arg: input, requestedBy: "portal" });
    return json({ ok: false, queued: true, id: r.record.id, error: queuedMessage(r) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
