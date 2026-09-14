/**
 * Idea bank and series planner.
 *
 * The disk route shelled out to `ideabank rank --json` so the ranking math lived
 * in one place. A Worker cannot, so it reads the stored ranking instead - the
 * same rows the CLI wrote on its last run. Re-rank from the button; it queues.
 *
 * `series` and `recentPillars` were missing entirely from the port, which is why
 * the series planner showed nothing.
 */

import { getEnv } from "@factory-env";
import { actOn, readCollection } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const [ideas, series, myposts] = await Promise.all([
    readCollection(env, "ideabank"),
    readCollection(env, "series"),
    readCollection(env, "myposts"),
  ]);
  return json({
    ideas,
    series,
    recentPillars: myposts
      .filter((m) => m.pillar && m.postedAt && Date.now() - new Date(m.postedAt).getTime() < 14 * 864e5)
      .map((m) => m.pillar),
  });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  try {
    return json(await actOn(env, request, { cmd: "ideabank-rank", arg: "", requestedBy: body.requestedBy || "portal" }));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
