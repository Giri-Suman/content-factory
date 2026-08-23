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

import { getEnv } from "@factory-env";
import { istTime, readCommands, readJob, whenWillItRun } from "../../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const STATUS = { pending: "queued", running: "running", done: "done", failed: "failed" };

/** Workers run in UTC; every time a person reads here is IST. */
const hhmm = (iso) => istTime(iso);

/**
 * How much work has to finish before this job starts.
 *
 * Counts the job already RUNNING as well as the pending ones queued earlier.
 * Pending-only gave zero while an 11-minute radar scan had the laptop, and the
 * page cheerfully said "starting now" on top of it.
 */
async function aheadOf(env, job) {
  if (!env?.QUEUE) return 0;
  const [pending, running] = await Promise.all([
    env.QUEUE.list({ prefix: "queue/pending/", limit: 100 }),
    env.QUEUE.list({ prefix: "queue/running/", limit: 10 }),
  ]);
  // ids are time-ordered (base36 Date.now prefix), so key order is queue order
  const earlier = pending.objects.filter((o) => o.key < `queue/pending/${job.id}.json`).length;
  return earlier + running.objects.length;
}

export async function GET(_req, { params }) {
  const env = getEnv();
  const { id } = await params; // Next 15: params is a Promise
  const job = await readJob(env, id);
  if (!job) return json({ error: "not found" }, 404);

  let status = STATUS[job.state] || job.state || "queued";
  let log = "";

  if (status === "queued") {
    const [when, man, ahead] = await Promise.all([whenWillItRun(env), readCommands(env), aheadOf(env, job)]);

    /* A live watcher claims work within a couple of seconds, so calling this
       "queued" and handing back a queue position is the wrong story - there is
       nothing to wait for. Report it as running so the page shows a spinner and
       keeps polling, exactly as it would on the laptop.

       This is gated on `watching`, NOT merely on the laptop being awake: a
       spinner over work that has not started and will not start for hours is
       the dishonest-progress bug this whole design avoids. */
    if (when.watching && !ahead) {
      return json({
        job: { ...job, status: "running", log: "Starting on the laptop now…" },
      });
    }
    const row = man?.commands?.find((c) => c.key === job.cmd);
    const label = row?.label || job.cmd;
    /* "Runs now" printed above "13 jobs ahead of it" is self-contradictory, so
       the awake case has to account for the queue rather than promise speed. */
    let line;
    if (when.awake) {
      line = ahead
        ? `The laptop is awake and working through the queue — ${ahead} job(s) ahead of this one.`
        : "The laptop is awake — this starts now.";
    } else {
      const needs = row?.laptop ? "Needs the laptop (ffmpeg / Chrome / Manim). " : "";
      const queue = ahead ? ` ${ahead} job(s) ahead of it.` : "";
      line = `${needs}Runs ${when.text}.${queue}`;
    }
    log = [
      `${label} — queued at ${hhmm(job.queuedAt)} IST`,
      line,
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
