/**
 * The one endpoint that runs a factory command.
 *
 * Replaces ~20 bespoke routes that each hardcoded their own argv and between
 * them still left 17 commands unreachable from the portal. Adding a row to the
 * registry makes a command clickable; there is no second place to update.
 *
 * WHAT CHANGED IN THE CLOUD: the disk version split commands two ways — slow
 * ones spawned a job, quick ones ran inline and returned their output. Workers
 * cannot spawn anything, so EVERY command now queues and the laptop runs it.
 * The response says so, and returns a jobId the UI already knows how to poll.
 *
 * SAFETY: it will only queue rows that exist in the registry, and the queue
 * record stores a KEY, never a command line — argv is rebuilt on the laptop from
 * that key. A crafted request cannot invent flags, chain shell syntax, or reach
 * a command the registry does not list. That matters more here than it did on
 * localhost, because this endpoint faces the internet.
 */

import { getEnv } from "@factory-env";
import { actOn, enqueue, readCommands } from "../../../lib/cloud.js";
import { COMMANDS, keyOf } from "../../../../../packages/shared/src/commands.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** The registry as the UI wants it, used until the laptop has pushed a manifest. */
const fromRegistry = () =>
  COMMANDS.map((c) => ({
    key: keyOf(c),
    label: c.label,
    desc: c.desc,
    stage: c.stage,
    cat: c.cat,
    argKind: c.argKind || null,
    argLabel: c.argLabel || null,
    slow: Boolean(c.slow),
    danger: c.danger || null,
    laptop: null, // unknown until the manifest says; the UI shows it as unqualified
  }));

export async function GET() {
  const env = getEnv();
  // Prefer the manifest: it carries the `laptop` flag and is exactly what
  // enqueue() validates against, so the catalog cannot drift from what will run.
  const man = await readCommands(env);
  return json({ ok: true, commands: man?.commands || fromRegistry(), synced: Boolean(man) });
}

export async function POST(request) {
  const env = getEnv();
  const { key, input = "", requestedBy = "portal" } = await request.json().catch(() => ({}));
  try {
    return json({ ...(await actOn(env, request, { cmd: key, arg: input, requestedBy })), mode: "job" });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
