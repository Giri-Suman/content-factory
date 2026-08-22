/**
 * Job status.
 *
 * On the laptop a "job" was a spawned child process writing a log file. Here it
 * is a queue record moving between R2 prefixes, so its state is which prefix
 * holds it.
 *
 * THE SHAPE MATTERS AS MUCH AS THE DATA. `useJob`/`JobLog` read `status` and
 * `log`, and the queue record has neither - it has `state` and, once finished,
 * `result` or `error`. Returning the raw record made every job page render a
 * badge reading "undefined" above an empty log, so clicking Render looked like
 * nothing happened even though the job had queued correctly. Translating here
 * keeps that vocabulary in one place rather than teaching four pages a second
 * one.
 *
 * "queued" is a state the old UI never had: on the laptop a job started
 * immediately. It is reported as its own status rather than folded into
 * "running", because a spinner for work that starts in six hours is a lie.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";
import { istTime, readCommands, readJob, whenWillItRun } from "../../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const STATUS = { pending: "queued", running: "running", done: "done", failed: "failed" };

/** Workers run in UTC; every time a person reads here is IST. */
const hhmm = (iso) => istTime(iso);

/** How many pending jobs were queued before this one. */
async function aheadOf(env, job) {
  if (!env?.QUEUE) return 0;
  const listed = await env.QUEUE.list({ prefix: "queue/pending/", limit: 100 });
  // ids are time-ordered (base36 Date.now prefix), so key order is queue order
  return listed.objects.filter((o) => o.key < `queue/pending/${job.id}.json`).length;
}

export async function GET(_req, { params }) {
  const { env } = getRequestContext();
  const { id } = await params; // Next 15: params is a Promise
  const job = await readJob(env, id);
  if (!job) return json({ error: "not found" }, 404);

  const status = STATUS[job.state] || job.state || "queued";
  let log = "";

  if (status === "queued") {
    const [when, man, ahead] = await Promise.all([whenWillItRun(env), readCommands(env), aheadOf(env, job)]);
    const row = man?.commands?.find((c) => c.key === job.cmd);
    const label = row?.label || job.cmd;
    log = [
      `${label} — queued at ${hhmm(job.queuedAt)} IST`,
      row?.laptop
        ? `Needs the laptop (ffmpeg / Chrome / Manim). Runs ${when.text}.`
        : `Runs ${when.text}.`,
      ahead ? `${ahead} job(s) ahead of it.` : "Next in line.",
      "",
      "You can close this page — it runs whether or not the tab is open.",
    ].join("\n");
  } else if (status === "running") {
    log = `Running on the laptop since ${hhmm(job.startedAt)} IST.`;
  } else if (status === "done") {
    log = job.result || "Finished.";
  } else if (status === "failed") {
    log = job.error || "Failed.";
  }

  return json({ job: { ...job, status, log } });
}
