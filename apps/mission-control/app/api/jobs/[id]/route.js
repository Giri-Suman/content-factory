/**
 * Job status.
 *
 * On the laptop a "job" was a spawned child process writing a log file. Here it
 * is a queue record moving between prefixes, so the state comes from where the
 * record lives. The UI polls this after queueing something; while the laptop is
 * asleep it will legitimately sit at "pending" for hours, which is the honest
 * answer rather than a spinner that implies work is happening.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";
import { readJob, whenWillItRun } from "../../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET(_req, { params }) {
  const { env } = getRequestContext();
  const job = await readJob(env, params.id);
  if (!job) return json({ error: "not found" }, 404);
  const when = job.state === "pending" ? await whenWillItRun(env) : null;
  return json({ job: when ? { ...job, when: when.text } : job });
}
