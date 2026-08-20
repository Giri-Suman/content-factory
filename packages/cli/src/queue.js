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

function runJob(job) {
  const build = ARGV[job.kind];
  if (!build) throw new Error(`no runner for kind "${job.kind}"`);
  const argv = build(job);
  const started = Date.now();
  const res = spawnSync(process.execPath, [CLI, ...argv], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
    timeout: 1000 * 60 * 180,
  });
  const mins = ((Date.now() - started) / 60000).toFixed(1);
  if (res.error) throw new Error(`${res.error.message} (after ${mins} min)`);
  if (res.status !== 0) throw new Error(`exited ${res.status} after ${mins} min`);
  return `ok in ${mins} min`;
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
          console.log(`  ${pad(j.kind, 6)} ${pad(j.input.slice(0, 40), 42)} by ${pad(j.requestedBy, 12)} ${j.queuedAt.slice(0, 16).replace("T", " ")}`);
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

      // A crashed run leaves a job claimed forever, which looks identical to an
      // empty queue. Recover those before deciding there is nothing to do.
      const stuck = await requeueStuck({ olderThanMin: 45 });
      if (stuck.length) console.log(`\n  requeued ${stuck.length} job(s) stuck in running`);

      const pending = await list("pending");
      if (!pending.length) {
        console.log(`\n  queue is empty — nothing to do\n`);
        await beat("idle", { pending: 0 });
        return true;
      }
      const limit = Number((rest.find((a) => a.startsWith("--max=")) || "").split("=")[1]) || pending.length;
      const todo = pending.slice(0, limit);
      console.log(`\n  ${todo.length} job(s) to run\n`);

      let ok = 0;
      let bad = 0;
      for (const job of todo) {
        console.log(`\n  ---- ${job.kind}: ${job.input.slice(0, 60)}  (asked by ${job.requestedBy}) ----`);
        let claimed;
        try {
          claimed = await claim(job);
        } catch (e) {
          console.log(`  could not claim: ${e.message}`);
          continue;
        }
        // Publish WHICH job is running, so the page can name it rather than
        // saying a vague "working". This is the message someone waiting wants.
        await beat("working", {
          current: { kind: claimed.kind, input: claimed.input, startedAt: new Date().toISOString(), eta: ETA[claimed.kind] || "a few minutes" },
          pending: todo.length - ok - bad - 1,
        });
        try {
          const result = runJob(claimed);
          await complete(claimed, result);
          console.log(`  DONE — ${result}`);
          ok++;
        } catch (e) {
          await fail(claimed, e.message);
          console.log(`  FAILED — ${String(e.message).slice(0, 160)}`);
          bad++;
          // Keep going: one bad job must not strand everything behind it.
        }
      }
      await beat("idle", { lastFinishedAt: new Date().toISOString(), done: ok, failed: bad });
      console.log(`\n  ${ok} done, ${bad} failed`);
      // Renders push themselves to R2, so finished work is already shareable —
      // but the viewer's file list is a static page and has to be regenerated.
      if (ok) console.log(`  refresh the public page:  factory viewer build  &&  wrangler pages deploy\n`);
      return bad === 0;
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
      console.log(`unknown: queue ${action}\n  status · add · drain · retry`);
      return false;
  }
}
