/**
 * R2-BACKED JOB QUEUE — decouples "asking for a video" from "the laptop being on".
 *
 * The problem it solves: the portal executes immediately, so every request needs
 * the machine awake at that exact moment. Someone else wanting a video therefore
 * has to wait for the laptop's owner. Measured reality: a math short is ~11
 * minutes of laptop time and a makeup cut is ~26s plus the upload — none of it
 * urgent, all of it currently blocking on presence.
 *
 * WHY R2 AND NOT THE REPO: the queue must be writable by an always-on surface
 * (a Pages Function) and readable by the laptop. R2 is already configured, is up
 * whether or not this machine is, and needs no DNS record. A git branch would
 * need credentials in the browser.
 *
 * LIFECYCLE — a job moves between prefixes rather than being mutated in place,
 * so its state is visible from a plain object listing and a crashed run cannot
 * leave a half-written record:
 *
 *   queue/pending/<id>.json    waiting for the laptop
 *   queue/running/<id>.json    claimed — survives a crash as a visible stuck job
 *   queue/done/<id>.json       finished, with the result
 *   queue/failed/<id>.json     finished, with the error
 *
 * SAFETY: `kind` is validated against an allowlist here, and the drainer maps a
 * kind to a fixed argv. A queue entry can never name a command or pass flags —
 * this is the same rule the portal's command registry follows, and it matters
 * more here because the writer is a public endpoint.
 */

import { deleteObject, isConfigured, listObjects, putObject } from "./r2.js";

/**
 * What may be queued, and the shape of its input.
 *
 * Deliberately small. Rendering and editing are the jobs worth waiting for;
 * anything that spends real money or publishes is NOT here and should not be.
 */
export const JOB_KINDS = {
  math: {
    label: "Math short",
    input: "topic",
    describe: (j) => `math short: ${j.input}`,
    maxInput: 200,
  },
  brief: {
    label: "Brief an idea",
    input: "topic",
    describe: (j) => `brief: ${j.input}`,
    maxInput: 200,
  },
  edit: {
    label: "AI Cut footage from the inbox",
    input: "file name in data/footage",
    describe: (j) => `edit: ${j.input}`,
    maxInput: 300,
  },
};

const PREFIX = "queue";
const STATES = ["pending", "running", "done", "failed"];

const keyFor = (state, id) => `${PREFIX}/${state}/${id}.json`;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Reject anything not on the allowlist, and cap input length. */
const VERTICALS = new Set(["all", "beauty", "coding", "ai-automation", "math"]);

export function validate({ kind, input, requestedBy, vertical }) {
  const spec = JOB_KINDS[kind];
  if (!spec) throw new Error(`unknown job kind "${kind}" — allowed: ${Object.keys(JOB_KINDS).join(", ")}`);
  const text = String(input ?? "").trim();
  if (!text) throw new Error(`"${kind}" needs ${spec.input}`);
  if (text.length > spec.maxInput) throw new Error(`input too long (max ${spec.maxInput} characters)`);
  // Control characters would corrupt logs and could smuggle terminal escapes.
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new Error("input contains control characters");
  return {
    kind,
    input: text,
    requestedBy: String(requestedBy || "someone").slice(0, 40),
    // Carried so a queued beauty edit keeps its colour protection. Without it
    // the job runs as a generic edit and the saturation lock never applies.
    vertical: VERTICALS.has(String(vertical)) ? String(vertical) : "all",
  };
}

export async function enqueue(job) {
  const clean = validate(job);
  const id = newId();
  const record = { id, ...clean, state: "pending", queuedAt: new Date().toISOString() };
  await putObject(keyFor("pending", id), JSON.stringify(record, null, 2), { contentType: "application/json" });
  return record;
}

async function readJson(key) {
  // listObjects gives keys; fetching one object needs a signed GET, which
  // presignGet already produces — cheaper than adding another signed verb.
  const { presignGet } = await import("./r2.js");
  const res = await fetch(presignGet(key, 300));
  if (!res.ok) throw new Error(`could not read ${key}: ${res.status}`);
  return res.json();
}

/** Every job in one state, oldest first — the order a queue should run in. */
export async function list(state = "pending") {
  if (!STATES.includes(state)) throw new Error(`unknown state ${state}`);
  if (!isConfigured()) return [];
  const objects = await listObjects(`${PREFIX}/${state}/`);
  const out = [];
  for (const o of objects) {
    try {
      out.push(await readJson(o.key));
    } catch {
      /* a malformed entry must not stop the drain */
    }
  }
  return out.sort((a, b) => String(a.queuedAt).localeCompare(String(b.queuedAt)));
}

/** Counts for every state — what a status view needs, in one call each. */
export async function counts() {
  const out = {};
  for (const s of STATES) {
    out[s] = (await listObjects(`${PREFIX}/${s}/`)).length;
  }
  return out;
}

/** Move a job between states. Write-then-delete: a crash duplicates, never loses. */
async function move(job, from, to, extra = {}) {
  const updated = { ...job, ...extra, state: to };
  await putObject(keyFor(to, job.id), JSON.stringify(updated, null, 2), { contentType: "application/json" });
  await deleteObject(keyFor(from, job.id));
  return updated;
}

export const claim = (job) => move(job, "pending", "running", { startedAt: new Date().toISOString() });
export const complete = (job, result) =>
  move(job, "running", "done", { finishedAt: new Date().toISOString(), result: String(result || "").slice(0, 500) });
export const fail = (job, error) =>
  move(job, "running", "failed", { finishedAt: new Date().toISOString(), error: String(error || "").slice(0, 500) });

/**
 * Return jobs stuck in `running` for too long back to pending.
 *
 * A job is claimed before the work starts, so a power cut mid-render leaves it
 * claimed forever. Without this the queue silently stops draining, which looks
 * identical to "nothing was requested".
 */
export async function requeueStuck({ olderThanMin = 45 } = {}) {
  const cutoff = Date.now() - olderThanMin * 60000;
  const stuck = (await list("running")).filter((j) => (Date.parse(j.startedAt || "") || 0) < cutoff);
  for (const j of stuck) await move(j, "running", "pending", { requeuedAt: new Date().toISOString() });
  return stuck;
}
