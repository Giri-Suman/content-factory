/**
 * Wishlist — posts you want to learn from, and their autopsies.
 *
 * The page reads `entries` and `hasYtKey`; the port returned `wishlist`, so the
 * list was permanently empty and the "add by URL" box never explained that it
 * needs a YouTube key.
 */

import { getEnv } from "@factory-env";
import { enqueue, readCollection, readEnvFlags, queuedResponse, notAvailable } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const [rows, flags] = await Promise.all([readCollection(env, "wishlist"), readEnvFlags(env)]);
  return json({ entries: rows, hasYtKey: Boolean(flags.youtube), wishlist: rows });
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
  poll: null,
};
const HINTS = { poll: "factory wishlist poll" };

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").trim();
  if (action && !(action in ACTIONS)) return json(notAvailable(action, HINTS[action]), 400);
  const cmd = action ? ACTIONS[action] : Object.values(ACTIONS).find(Boolean);
  if (!cmd) return json(notAvailable(action || "this", HINTS[action]), 400);
  try {
    const r = await enqueue(env, {
      cmd,
      arg: "",
      requestedBy: body.requestedBy || "portal",
    });
    return json(queuedResponse(r));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
