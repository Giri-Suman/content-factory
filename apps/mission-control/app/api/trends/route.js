/**
 * Trend radar — read from R2, scan by queueing.
 *
 * A radar scan sweeps 17 sources and takes about 11 minutes, so it was never
 * going to run inside a Worker request. GET is the part that matters day to day
 * and is now fully cloud-side; POST queues `radar-collect` and says when it runs.
 */

import { getEnv } from "@factory-env";
import { enqueue, queuedMessage, readConfig, readTrends } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const top = (trends) =>
  trends
    .filter((t) => !t.used)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .slice(0, 120);

export async function GET() {
  const env = getEnv();
  const [trends, config] = await Promise.all([readTrends(env), readConfig(env)]);
  return json({ trends: top(trends), config });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const [trends, config] = await Promise.all([readTrends(env), readConfig(env)]);
  try {
    const r = await enqueue(env, { cmd: "radar-collect", arg: "", requestedBy: body.requestedBy || "portal" });
    // trends/config still returned so the page can render while it waits
    return json({ ok: true, queued: true, id: r.record.id, log: queuedMessage(r), trends: top(trends), config });
  } catch (e) {
    return json({ ok: false, error: e.message, trends: top(trends), config }, 400);
  }
}
