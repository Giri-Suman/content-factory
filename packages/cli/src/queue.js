/**
 * `factory queue` — run work that was asked for while this machine was asleep.
 *
 * The point of the queue is that nobody has to wait for this laptop to be on.
 * `drain` is what the laptop runs when it wakes: take pending jobs oldest-first,
 * run them, record the outcome, move on.
 *
 * SAFETY — a queue entry can never name a command. `kind` is matched against a
 * fixed table here and argv is built locally, so the worst a malicious queue
 * write can do is ask for a math video about a rude topic. This mirrors the
 * portal's command registry, and matters more here because the writer is a
 * public endpoint.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { repoRoot } from "../../shared/src/config.js";
import { JOB_KINDS, claim, complete, counts, enqueue, fail, list, requeueStuck } from "../../shared/src/queue.js";
import { COMMANDS, argvFor, keyOf } from "../../shared/src/commands.js";
import { isConfigured, missingConfig } from "../../shared/src/r2.js";
import { beat } from "../../shared/src/status.js";
import { resolveInInbox } from "./inbox.js";

const CLI = path.join(repoRoot, "packages", "cli", "bin", "factory.js");
const pad = (s, n) => String(s).padEnd(n);

/**
 * kind -> argv. The ONLY place a queued job becomes a command line.
 * Input is passed as a single argv element, never interpolated into a string,
 * so shell metacharacters are inert (spawn without a shell).
 */
/** Measured medians, so the page can say "about 11 min" instead of "soon". */
const ETA = { math: "11 min", brief: "1 min", edit: "depends on footage length" };

const ARGV = {
  math: (job) => ["math", job.input],
  brief: (job) => ["brief", "topic", job.input],
  /* The queue stores only a BASENAME. resolveInInbox re-validates it here at
     run time — the file may have been deleted since it was queued, and a queue
     entry must never be able to point the pipeline outside the inbox folder. */
  edit: (job) => ["edit", ...(job.vertical === "beauty" ? ["--beauty"] : []), resolveInInbox(job.input)],
};

/**
 * Run one queued job, capturing enough of its output to explain a failure.
 *
 * This used to be spawnSync with stdio:"inherit", which showed everything live
 * and kept none of it - so a job that died reported `exited 1 after 0.4 min` and
 * that string was the entire diagnosis available from the cloud portal, where
 * nobody can see the console. Piping and echoing keeps the live view AND the
 * last lines, which is what actually gets read on the Jobs page.
 */
function runJob(job) {
  let argv;
  if (job.kind === "command") {
    /* A generic job carries a registry KEY. argv is rebuilt here from the
       registry, never taken from the queue entry - which is what keeps a public
       write surface from being able to name a command. */
    const row = COMMANDS.find((c) => keyOf(c) === job.cmd);
    if (!row) throw new Error(`queued command "${job.cmd}" is not in the registry`);
    argv = argvFor(row, job.input || undefined);
  } else {
    const build = ARGV[job.kind];
    if (!build) throw new Error(`no runner for kind "${job.kind}"`);
    argv = build(job);
  }

  const started = Date.now();
  const res = spawnSync(process.execPath, [CLI, ...argv], {
    cwd: repoRoot,
    encoding: "utf8",
    // piped rather than inherited so the tail survives for the error message
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 1000 * 60 * 180,
    maxBuffer: 32 * 1024 * 1024,
  });

  const out = `${res.stdout || ""}${res.stderr || ""}`;
  if (out) process.stdout.write(out);

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  /* The last non-empty lines are where a stack trace or "missing key" lands.
     Trimmed to 400 chars because complete() stores 500 and the rest is noise. */
  const tail = out
    .split(String.fromCharCode(10))
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-6)
    .join(" | ")
    .slice(0, 400);

  if (res.error) throw new Error(`${res.error.message} (after ${mins} min)${tail ? " - " + tail : ""}`);
  if (res.status !== 0) throw new Error(`exited ${res.status} after ${mins} min${tail ? " - " + tail : ""}`);
  return `ok in ${mins} min`;
}

/**
 * Run everything pending, once. Shared by `drain` and `watch`.
 *
 * Returns {ok, bad, ran} so a caller can decide whether anything happened -
 * `watch` uses that to stay quiet on an empty poll instead of printing a line
 * every few seconds.
 */
async function runPending({ limit = 0, quiet = false, watching = false } = {}) {
  const say = (m) => { if (!quiet) console.log(m); };

  // A crashed run leaves a job claimed forever, which looks identical to an
  // empty queue. Recover those before deciding there is nothing to do.
  const stuck = await requeueStuck({ olderThanMin: 45 });
  if (stuck.length) console.log(`
  requeued ${stuck.length} job(s) stuck in running`);

  const pending = await list("pending");
  if (!pending.length) {
    say(`
  queue is empty - nothing to do
`);
    await beat("idle", { pending: 0, watching });
    return { ok: 0, bad: 0, ran: 0 };
  }

  const todo = limit ? pending.slice(0, limit) : pending;
  console.log(`
  ${todo.length} job(s) to run
`);

  let ok = 0;
  let bad = 0;
  for (const job of todo) {
    console.log(`
  ---- ${job.kind}: ${job.input.slice(0, 60)}  (asked by ${job.requestedBy}) ----`);
    let claimed;
    try {
      claimed = await claim(job);
    } catch (e) {
      console.log(`  could not claim: ${e.message}`);
      continue;
    }
    // Publish WHICH job is running, so the page can name it rather than saying
    // a vague "working". This is the message someone waiting wants.
    await beat("working", {
      current: { kind: claimed.kind, input: claimed.input, startedAt: new Date().toISOString(), eta: ETA[claimed.kind] || "a few minutes" },
      pending: todo.length - ok - bad - 1,
      watching,
    });
    /* RUNNING THE JOB AND RECORDING THE OUTCOME ARE SEPARATE FAILURES.
       They used to share one try, so an R2 blip on the completion write landed
       in the same catch as a crashed render and called fail(). A demo short
       that rendered fine was reported to the portal as
       `failed - fetch failed`, with the finished mp4 sitting on disk. Whether
       the work succeeded is decided here, and only here. */
    let result = null;
    let jobError = null;
    try {
      result = runJob(claimed);
    } catch (e) {
      jobError = e;
    }

    if (jobError) {
      console.log(`  FAILED - ${String(jobError.message).slice(0, 160)}`);
      bad++;
    } else {
      console.log(`  DONE - ${result}`);
      ok++;
    }

    // Bookkeeping, retried - a network error here must never change the verdict.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (jobError) await fail(claimed, jobError.message);
        else await complete(claimed, result);
        break;
      } catch (writeErr) {
        if (attempt === 3) {
          console.log(`  (could not record the outcome: ${writeErr.message} - requeueStuck will recover it)`);
          break;
        }
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }
  await beat("idle", { lastFinishedAt: new Date().toISOString(), done: ok, failed: bad, watching });
  console.log(`
  ${ok} done, ${bad} failed`);
  // Renders push themselves to R2, so finished work is already shareable - but
  // the viewer's file list is a static page and has to be regenerated.
  if (ok) console.log(`  refresh the public page:  factory viewer build  &&  wrangler pages deploy
`);
  return { ok, bad, ran: todo.length };
}

export async function queue(argv) {
  const [action = "status", ...rest] = argv;
  const targs = rest.filter((a) => !a.startsWith("--"));

  if (!isConfigured()) {
    console.log(`\n  The queue lives in R2, which is not configured. Missing: ${missingConfig().join(", ")}\n`);
    return false;
  }

  switch (action) {
    /* ---------------------------------------------------- status --- */
    case "status": {
      const c = await counts();
      console.log("");
      console.log(`  pending ${c.pending}   running ${c.running}   done ${c.done}   failed ${c.failed}`);
      const pending = await list("pending");
      if (pending.length) {
        console.log("");
        for (const j of pending) {
          console.log(`  ${pad(j.cmd || j.kind, 16)} ${pad((j.input||"").slice(0, 32), 34)} by ${pad(j.requestedBy, 12)} ${j.queuedAt.slice(0, 16).replace("T", " ")}`);
        }
        console.log(`\n  run them:  factory queue drain`);
      }
      const failed = await list("failed");
      if (failed.length) {
        console.log(`\n  ${failed.length} failed:`);
        for (const j of failed.slice(0, 5)) console.log(`    ${pad(j.kind, 6)} ${pad(j.input.slice(0, 30), 32)} ${String(j.error).slice(0, 50)}`);
      }
      console.log("");
      return true;
    }

    /* ------------------------------------------------------- add --- */
    case "add": {
      const kind = targs[0];
      const input = targs.slice(1).join(" ");
      if (!kind || !input) {
        console.log(`\nusage: factory queue add <kind> <input>`);
        console.log(`  kinds: ${Object.entries(JOB_KINDS).map(([k, v]) => `${k} (${v.input})`).join(" · ")}\n`);
        return false;
      }
      try {
        const j = await enqueue({ kind, input, requestedBy: "cli" });
        console.log(`\n  queued ${j.id} — ${JOB_KINDS[j.kind].describe(j)}\n`);
        return true;
      } catch (e) {
        console.log(`\n  ${e.message}\n`);
        return false;
      }
    }

    /* ----------------------------------------------------- drain --- */
    case "drain": {
      // Announce we are up before doing anything, so someone refreshing the
      // page during a long job sees "awake" rather than a stale "asleep".
      await beat("awake");
      const limit = Number((rest.find((a) => a.startsWith("--max=")) || "").split("=")[1]) || 0;
      const { bad } = await runPending({ limit });
      return bad === 0;
    }

    /* ----------------------------------------------------- watch --- */
    /**
     * Stay up and run work the moment it is asked for.
     *
     * `drain` is a scheduled visit: it runs at 09:00 and again at 14:00, so
     * something queued at 09:05 waits five hours even though the machine is
     * sitting there switched on. That is the gap this closes - while this runs,
     * queued work starts within one poll.
     *
     * It also keeps the heartbeat FRESH, which is what lets the portal say "the
     * laptop is awake, it runs now" at all. The heartbeat was only ever written
     * during a drain, so between scheduled runs an awake machine was
     * indistinguishable from a sleeping one, and every queued job was quoted a
     * time hours away.
     *
     * Ctrl-C to stop. Safe to run alongside the scheduled task: claiming a job
     * is atomic, so whichever gets there first runs it and the other skips it.
     */
    case "watch": {
      const every = Math.max(2, Number((rest.find((a) => a.startsWith("--every=")) || "").split("=")[1]) || 3);
      // The portal treats a heartbeat older than 20 minutes as asleep, so beat
      // well inside that even when there is nothing to do.
      const BEAT_EVERY_MS = 5 * 60 * 1000;

      console.log(`
  watching the queue every ${every}s - Ctrl-C to stop
`);
      /* `watching` is what lets the portal promise immediacy honestly. A fresh
         heartbeat alone only means someone touched R2 recently - it could be a
         scheduled drain that is about to finish and go back to sleep. Only a
         live watcher guarantees the next job starts in seconds. */
      await beat("awake", { watching: true });
      let lastBeat = Date.now();
      let idle = false;

      for (;;) {
        let pending = [];
        try {
          pending = await list("pending");
        } catch (e) {
          // A network blip must not kill an all-day watcher.
          console.log(`  (could not reach R2: ${String(e.message).slice(0, 80)})`);
        }

        if (pending.length) {
          idle = false;
          await runPending({ watching: true });
          lastBeat = Date.now();
        } else {
          if (!idle) {
            idle = true;
            console.log(`  idle - waiting for work (${new Date().toLocaleTimeString()})`);
          }
          if (Date.now() - lastBeat > BEAT_EVERY_MS) {
            await beat("idle", { pending: 0, watching: true });
            lastBeat = Date.now();
          }
        }
        await new Promise((r) => setTimeout(r, every * 1000));
      }
    }

    /* ----------------------------------------------------- retry --- */
    case "retry": {
      const failed = await list("failed");
      if (!failed.length) return console.log("\n  nothing failed\n"), true;
      let n = 0;
      for (const j of failed) {
        await enqueue({ kind: j.kind, input: j.input, requestedBy: j.requestedBy });
        n++;
      }
      console.log(`\n  requeued ${n} failed job(s) — they keep their failed record for history\n`);
      return true;
    }

    default:
      console.log(`unknown: queue ${action}\n  status · add · drain · watch · retry`);
      return false;
  }
}
