/**
 * Refresh playbooks.
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
  const [playbooks, proposals, signals] = await Promise.all([
    readCollection(env, "playbooks"),
    readCollection(env, "playbookproposals"),
    readCollection(env, "playbooksignals"),
  ]);
  return json({
    playbooks,
    proposals: proposals.filter((p) => p.status === "pending"),
    signals: signals.filter((s) => !s.reviewed),
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
  refresh: "playbook",
  approve: null,
  reject: null,
};
const HINTS = { approve: "factory playbook approve <id>", reject: "factory playbook reject <id>" };

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").trim();
  if (action && !(action in ACTIONS)) return json(notAvailable(action, HINTS[action]), 400);
  const cmd = action ? ACTIONS[action] : Object.values(ACTIONS).find(Boolean);
  if (!cmd) return json(notAvailable(action || "this", HINTS[action]), 400);
  const arg = "";
  try {
    return json(await actOn(env, request, { cmd, arg, requestedBy: body.requestedBy || "portal" }));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
