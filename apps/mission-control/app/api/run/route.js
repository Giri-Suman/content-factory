/**
 * The one endpoint that runs a factory command.
 *
 * Replaces ~20 bespoke routes that each hardcoded their own argv and between
 * them still left 17 commands unreachable from the portal. Adding a row to the
 * registry makes a command clickable; there is no second place to update.
 *
 * WHAT CHANGED IN THE CLOUD: the disk version split commands two ways — slow
 * ones spawned a job, quick ones ran inline and returned their output. Workers
 * cannot spawn anything, so EVERY command becomes a durable R2 job. A configured
 * GitHub Actions runner starts it immediately; the laptop watcher remains the
 * local fallback. The response returns a jobId the UI already knows how to poll.
 *
 * SAFETY: it will only queue rows that exist in the registry, and the queue
 * record stores a KEY, never a command line — argv is rebuilt on the laptop from
 * that key. A crafted request cannot invent flags, chain shell syntax, or reach
 * a command the registry does not list. That matters more here than it did on
 * localhost, because this endpoint faces the internet.
 */

import { getEnv } from "@factory-env";
import { actOn, readCommands } from "../../../lib/cloud.js";
import { githubConfig } from "../../../lib/github.js";
import { identityFromRequest } from "../../../lib/identity.js";
import { CLOUD_RUNNABLE_KEYS, COMMANDS, keyOf } from "../../../../../packages/shared/src/commands.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** The registry as the UI wants it, used until the laptop has pushed a manifest. */
const fromRegistry = () =>
  COMMANDS.map((c) => ({
    key: keyOf(c),
    id: c.id,
    args: c.args,
    label: c.label,
    desc: c.desc,
    stage: c.stage,
    cat: c.cat,
    argKind: c.argKind || null,
    argLabel: c.argLabel || null,
    slow: Boolean(c.slow),
    primary: Boolean(c.primary),
    danger: c.danger || null,
    laptop: null, // unknown until the manifest says; the UI shows it as unqualified
    cloud: CLOUD_RUNNABLE_KEYS.has(keyOf(c)),
  }));

export async function GET(request) {
  const env = getEnv();
  // Prefer the manifest: it carries the `laptop` flag and is exactly what
  // enqueue() validates against, so the catalog cannot drift from what will run.
  const man = await readCommands(env);
  const published = new Map((man?.commands || []).map((row) => [row.key, row]));
  let cloudMode = false;
  try {
    cloudMode = Boolean(githubConfig(env));
  } catch (error) {
    return json({ ok: false, error: error.message, commands: [] }, 503);
  }
  const host = new URL(request.url).hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  const identity = identityFromRequest(request);
  const commands = fromRegistry().map((row) => ({
    ...row,
    ...(published.get(row.key) || {}),
    cloud: row.cloud,
    danger: row.danger,
    ownerOnly: Boolean(row.danger),
    available: (local || !cloudMode || row.cloud) && (!row.danger || identity.isOwner),
  }));
  return json({ ok: true, commands, synced: Boolean(man), executor: cloudMode ? "github-actions" : "laptop", user: identity });
}

export async function POST(request) {
  const env = getEnv();
  const { key, input = "" } = await request.json().catch(() => ({}));
  try {
    return json({ ...(await actOn(env, request, { cmd: key, arg: input })), mode: "job" });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
