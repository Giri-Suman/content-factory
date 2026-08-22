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
import { dedupeKey, jobIdentity } from "./commands.js";

/**
 * What may be queued, and the shape of its input.
 *
 * Deliberately small. Rendering and editing are the jobs worth waiting for;
 * anything that spends real money or publishes is NOT here and should not be.
 */
export const JOB_KINDS = {
  math: { label: "Math short", input: "topic", describe: (j) => `math short: ${j.input}`, maxInput: 200 },
  brief: { label: "Brief an idea", input: "topic", describe: (j) => `brief: ${j.input}`, maxInput: 200 },
  edit: { label: "AI Cut footage", input: "file name in data/footage", describe: (j) => `edit: ${j.input}`, maxInput: 300 },
};

/**
 * ANY registry command can be queued, not just the three above.
 *
 * The portal at factory.coderfact.com is always up, but half its commands spawn
 * ffmpeg, Chrome, Manim or whisper and therefore need the laptop. Rather than
 * greying those out, they are QUEUED: the page says what will happen and when,
 * and the laptop runs them the next time it wakes.
 *
 * SAFETY IS UNCHANGED. A queue entry still cannot name a command — `cmd` is a
 * registry KEY, validated against the table, and argv is rebuilt locally from
 * that key. A hostile write can request a video about a rude topic; it cannot
 * request a shell.
 *
 * Deliberately NOT queueable: `publish --go` (the one real upload, kept a
 * manual terminal action), `worker` (a daemon), and `auth-youtube` (interactive
 * OAuth). Those are excluded by the registry itself, which never lists them.
 */
export const COMMAND_KIND = "command";

const PREFIX = "queue";
const STATES = ["pending", "running", "done", "failed"];

const keyFor = (state, id) => `${PREFIX}/${state}/${id}.json`;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Verticals a queued job can carry, so colour protection survives the queue. */
export const VERTICALS = new Set(["all", "beauty", "makeup", "nails", "coding", "ai-automation", "math"]);

const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * Validate a job.
 *
 * Two shapes, one record:
 *   { kind: "command", cmd: "<registry key>" }  any of the 76 portal commands
 *   { kind: "math"|"brief"|"edit", input }      the original three
 *
 * SAFETY IS THE SAME EITHER WAY. `cmd` is a registry KEY, never a command line;
 * the drainer rebuilds argv locally from that key. A hostile write can ask for a
 * video about a rude topic. It cannot ask for a shell.
 */
export function validate({ kind, input, requestedBy, cmd, vertical = "all" }) {
  const who = String(requestedBy || "portal").slice(0, 40);
  const v = VERTICALS.has(String(vertical)) ? String(vertical) : "all";
  const text = String(input ?? "").trim();

  if (CONTROL.test(text)) throw new Error("input contains control characters");
  if (text.length > 300) throw new Error("input too long (max 300 characters)");

  if (kind === COMMAND_KIND) {
    if (!cmd) throw new Error("a command job needs a registry key");
    return { kind, cmd: String(cmd).slice(0, 60), input: text, requestedBy: who, vertical: v };
  }

  const spec = JOB_KINDS[kind];
  if (!spec) throw new Error(`unknown job kind "${kind}" - allowed: ${Object.keys(JOB_KINDS).join(", ")}, ${COMMAND_KIND}`);
  if (!text) throw new Error(`"${kind}" needs ${spec.input}`);
  if (text.length > spec.maxInput) throw new Error(`input too long (max ${spec.maxInput} characters)`);
  // Carried so a queued beauty edit keeps its colour protection - without it the
  // job would run as a generic edit and the saturation lock would never apply.
  return { kind, input: text, requestedBy: who, vertical: v };
}

/**
 * Add a job, unless the identical job is already waiting or running.
 *
 * Returns the EXISTING record with `duplicate: true` rather than throwing: the
 * caller asked for a thing to happen, and it is going to happen - there is just
 * no second copy. Callers that report an id keep working unchanged.
 *
 * Only pending and running block. A finished job must be re-runnable, or you
 * could never render the same short twice.
 */
export async function enqueue(job) {
  const clean = validate(job);
  const want = jobIdentity(clean);

  /* Keyed reads only. R2 LIST is eventually consistent, so scanning the pending
     prefix missed a job written a second earlier and two fast clicks still
     produced two jobs. The marker is a hint: it counts only while the job it
     names is still pending or running, which makes a stale marker harmless. */
  const marker = await readJsonOrNull(dedupeKey(want));
  if (marker && marker.identity === want) {
    for (const state of ["pending", "running"]) {
      const existing = await readJsonOrNull(keyFor(state, marker.jobId));
      if (existing) return { ...existing, duplicate: true };
    }
  }

  const id = newId();
  const record = { id, ...clean, state: "pending", queuedAt: new Date().toISOString() };
  await putObject(keyFor("pending", id), JSON.stringify(record, null, 2), { contentType: "application/json" });
  // after the job, so the marker can never point at something that is not there
  await putObject(dedupeKey(want), JSON.stringify({ identity: want, jobId: id }), { contentType: "application/json" });
  return record;
}

/** GET by key, absent-tolerant — strongly consistent, unlike list(). */
async function readJsonOrNull(key) {
  try {
    return await readJson(key);
  } catch {
    return null;
  }
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
/** Finishing frees the identity, so the same thing can be asked for again. */
async function clearMarker(job) {
  try {
    await deleteObject(dedupeKey(jobIdentity(job)));
  } catch {
    /* findDuplicate re-checks the job is live, so a leftover marker is inert */
  }
}

export const complete = async (job, result) => {
  const moved = await move(job, "running", "done", { finishedAt: new Date().toISOString(), result: String(result || "").slice(0, 500) });
  await clearMarker(job);
  return moved;
};
export const fail = async (job, error) => {
  const moved = await move(job, "running", "failed", { finishedAt: new Date().toISOString(), error: String(error || "").slice(0, 500) });
  await clearMarker(job);
  return moved;
};

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
