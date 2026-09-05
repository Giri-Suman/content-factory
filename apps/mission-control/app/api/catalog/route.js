/**
 * Fan a brief out into other formats.
 *
 * Ported for the Workers runtime. The disk version spawned the CLI; this queues
 * the same command and answers with when the laptop will run it. Execution is
 * the only thing that changed - the work is identical, it just happens on the
 * machine that has ffmpeg rather than inside this request.
 */

import { getEnv } from "@factory-env";
import { actOn, notAvailable, readCollection } from "../../../lib/cloud.js";

export const runtime = "edge";

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

/**
 * Which registry command each button means.
 *
 * The port dropped `action` entirely and enqueued one command whatever was
 * pressed, so every button on this page did the same thing. `null` marks an
 * action the registry has no row for - those are refused by name rather than
 * quietly running something else.
 */
const ACTIONS = {
  "seed-formats": null,
  "seed-ideas": null,
  newsletter: null,
  comments: "evidence-quotes",
};
const HINTS = { "seed-formats": "factory catalog seed", "seed-ideas": "factory catalog ideas", newsletter: "factory catalog newsletter" };

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").trim();
  if (action && !(action in ACTIONS)) return json(notAvailable(action, HINTS[action]), 400);
  const cmd = action ? ACTIONS[action] : Object.values(ACTIONS).find(Boolean);
  if (!cmd) return json(notAvailable(action || "this", HINTS[action]), 400);
  const arg = String(body.briefId || body.id || "").trim();
  try {
    return json(await actOn(env, request, { cmd, arg, requestedBy: body.requestedBy || "portal" }));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
