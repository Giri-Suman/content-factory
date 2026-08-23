/**
 * CLOUD DATA LAYER — what lib/factory.js does, without node:fs or child_process.
 *
 * lib/factory.js reads `data/` from disk and spawns the CLI. Neither is possible
 * on Cloudflare Workers, which is the only reason the portal has been tied to
 * one laptop. This is the same surface backed by R2 instead:
 *
 *   readCollection()  state/os/<name>.json   <- pushed by `factory sync push`
 *   listRenders()     renders/               <- pushed on every render
 *   enqueue()         queue/pending/         <- drained by the laptop
 *
 * WHAT CHANGES FOR THE USER: reading is identical and faster (edge, not a tunnel
 * to a 2-core CPU). EXECUTING becomes asynchronous - a click queues the job and
 * the laptop runs it. That is the one real behavioural difference, and the UI is
 * expected to say so rather than pretend the work happened.
 *
 * WHAT DOES NOT MOVE: `doctor` and `health` inspect the local machine - ffmpeg,
 * disk, the Python venv. Run from the cloud they would describe a runner that
 * does not exist, so they stay laptop-only and are marked as such.
 *
 * SAFETY: enqueue() writes a registry KEY, never a command line. argv is rebuilt
 * on the laptop from that key. This is the same rule the local runner has always
 * followed, and it matters more here because the endpoint is public.
 */

import { dedupeKey, jobIdentity } from "../../../packages/shared/src/commands.js";

const STATE = "state";
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Commands that only make sense on the machine they inspect. */
export const LAPTOP_ONLY_INSPECTION = new Set(["doctor", "health"]);

/* --------------------------------------------------------------- reads --- */

async function readJson(env, key, fallback = null) {
  if (!env?.QUEUE) return fallback;
  const obj = await env.QUEUE.get(key);
  if (!obj) return fallback;
  try {
    return JSON.parse(await obj.text());
  } catch {
    return fallback;
  }
}

/**
 * A collection, as the store writes it: { updatedAt, rows }.
 * Tolerates a bare array so a shape change degrades rather than blanks a page.
 */
export async function readCollection(env, name) {
  const parsed = await readJson(env, `${STATE}/os/${name}.json`, null);
  if (!parsed) return [];
  return Array.isArray(parsed) ? parsed : parsed.rows || [];
}

export const readConfig = (env) => readJson(env, `${STATE}/config.json`, {});
export const readPerf = (env) => readJson(env, `${STATE}/perf.json`, {});

/**
 * Which credentials the laptop has, as booleans - published by `factory sync
 * push`, never containing a value. Without it the Settings page has nothing to
 * render and sits on "loading..." forever, so the fallback is a real object
 * rather than null. `unknown` says the flags have not been pushed yet, so the
 * page can avoid claiming a configured key is missing.
 */
/**
 * Tier tables, edit options and languages, published by `factory sync push`.
 *
 * These live in packages/llm, which imports node:fs through shared/config.js
 * and therefore cannot run at the edge. Returning {} rather than null keeps the
 * Settings page rendering with empty tier lists instead of blanking on a
 * missing field.
 */
/** Motion bench numbers, measured on the laptop and pushed by `sync push`. */
export const readMotionMeta = (env) => readJson(env, `${STATE}/motion.json`, {});

export const readUiMeta = (env) => readJson(env, `${STATE}/ui.json`, {});

export async function readEnvFlags(env) {
  const f = await readJson(env, `${STATE}/envkeys.json`, null);
  if (f) return f;
  return {
    provider: null,
    anthropic: false,
    openrouter: false,
    ollama: false,
    elevenlabs: false,
    telegram: false,
    youtube: false,
    unknown: true,
  };
}

/** Trends live outside the collection store and have their own shape. */
export async function readTrends(env) {
  const t = await readJson(env, `${STATE}/trends.json`, null);
  if (!t) return [];
  return Array.isArray(t) ? t : Object.values(t.trends || {});
}

/** One compiled script, by brief id. */
export const readScript = (env, id) => readJson(env, `${STATE}/scripts/${id}.json`, null);

/* ------------------------------------------------------------- renders --- */

/**
 * Finished videos, grouped per render id — the shape the Renders page expects.
 * Reads the R2 listing rather than a directory.
 */
export async function listRenders(env) {
  if (!env?.QUEUE) return [];
  const listed = await env.QUEUE.list({ prefix: "renders/", limit: 900 });
  const byId = new Map();
  for (const o of listed.objects) {
    const parts = o.key.split("/");
    if (parts.length < 3) continue;
    const id = parts[1];
    if (!byId.has(id)) byId.set(id, { id, files: [], newest: 0 });
    const g = byId.get(id);
    const t = o.uploaded ? new Date(o.uploaded).getTime() : 0;
    g.files.push({ name: parts.slice(2).join("/"), size: o.size, key: o.key, when: t });
    if (t > g.newest) g.newest = t;
  }
  return [...byId.values()].sort((a, b) => b.newest - a.newest);
}

/* --------------------------------------------------------------- queue --- */

export async function queueCounts(env) {
  if (!env?.QUEUE) return { pending: 0, running: 0, done: 0, failed: 0 };
  const n = async (p) => (await env.QUEUE.list({ prefix: `queue/${p}/`, limit: 300 })).objects.length;
  const [pending, running, done, failed] = await Promise.all([n("pending"), n("running"), n("done"), n("failed")]);
  return { pending, running, done, failed };
}

export async function listQueue(env, state = "pending") {
  if (!env?.QUEUE) return [];
  const listed = await env.QUEUE.list({ prefix: `queue/${state}/`, limit: 200 });
  const out = [];
  for (const o of listed.objects) {
    const j = await readJson(env, o.key, null);
    if (j) out.push(j);
  }
  return out.sort((a, b) => String(a.queuedAt).localeCompare(String(b.queuedAt)));
}

/** The command manifest, published by `factory sync push`. */
export const readCommands = (env) => readJson(env, `${STATE}/_commands.json`, null);

/**
 * Queue a command. Returns the record plus a sentence saying when it will run.
 * Throws on anything the registry does not recognise.
 */
/**
 * The identical request, if it is already waiting or running.
 *
 * Every read is a GET BY KEY, never a list. R2 list is eventually consistent
 * and a list-based check demonstrably missed a job written one second earlier -
 * click 1 created a job, click 2 could not see it and created a second, click 3
 * finally saw it. Keyed reads are strongly consistent, which is the whole
 * reason the marker exists.
 *
 * The marker is a hint, not truth: normally it counts only while the job it
 * names is really in pending or running, so a leftover marker cannot block a
 * finished job from being re-run. The exception is `graceMs` - a marker written
 * seconds ago whose job is not visible yet means a concurrent request is
 * mid-write, and that IS a duplicate even though the job cannot be read.
 */
async function findDuplicate(env, want, { graceMs = 0 } = {}) {
  const marker = await readJson(env, dedupeKey(want), null);
  // the full identity is stored so a hash collision cannot merge two jobs
  if (!marker || marker.identity !== want) return null;
  for (const state of ["pending", "running"]) {
    const job = await readJson(env, `queue/${state}/${marker.jobId}.json`, null);
    if (job) return job;
  }
  if (graceMs && marker.at && Date.now() - Date.parse(marker.at) < graceMs) {
    // the winner of the race has claimed the identity but not finished writing
    return { id: marker.jobId, state: "pending", queuedAt: marker.at, cmd: marker.cmd || "", input: marker.input || "" };
  }
  return null;
}

const newJobId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Position in the queue, by key order - ids carry a time prefix. */
async function aheadOfJob(env, id) {
  const listed = await env.QUEUE.list({ prefix: "queue/pending/", limit: 100 });
  return listed.objects.filter((o) => o.key < `queue/pending/${id}.json`).length;
}

export async function enqueue(env, { cmd, arg = "", requestedBy = "portal" }) {
  if (!env?.QUEUE) throw new Error("queue storage is not bound");
  const man = await readCommands(env);
  if (!man) throw new Error("no command manifest - run `factory sync push` once");

  const row = man.commands.find((c) => c.key === cmd);
  if (!row) throw new Error(`unknown command "${cmd}"`);

  const text = String(arg ?? "").trim();
  if (row.argKind && !text) throw new Error(`${row.label} needs ${row.argLabel || row.argKind}`);
  if (text.length > 300) throw new Error("input too long (max 300)");
  if (CONTROL.test(text)) throw new Error("input contains control characters");

  const want = jobIdentity({ cmd, input: text });
  const duplicateOf = async (job) => ({
    record: job,
    row,
    ahead: await aheadOfJob(env, job.id),
    when: await whenWillItRun(env),
    duplicate: true,
  });

  // Asking twice for the same thing is one request, not two. A page that says
  // "queued" with nothing visible invites a second click from anyone unsure the
  // first one landed - which is exactly how three identical renders happened.
  const already = await findDuplicate(env, want);
  if (already) return duplicateOf(already);

  const pending = await env.QUEUE.list({ prefix: "queue/pending/", limit: 60 });
  if (pending.objects.length >= 50) throw new Error("queue is full - wait for it to drain");

  const id = newJobId();
  const marker = { identity: want, jobId: id, cmd, input: text, at: new Date().toISOString() };

  /* CLAIM THE IDENTITY BEFORE WRITING THE JOB.
     Checking-then-writing cannot stop two requests that both read "absent"
     before either writes. `etagDoesNotMatch: "*"` makes this a create-only put,
     so R2 decides the winner and returns null to the loser. */
  const won = await env.QUEUE.put(dedupeKey(want), JSON.stringify(marker), {
    httpMetadata: { contentType: "application/json" },
    onlyIf: { etagDoesNotMatch: "*" },
  });

  if (won === null) {
    // Someone else holds it. Grace window: their job may not be readable yet.
    const other = await findDuplicate(env, want, { graceMs: 15000 });
    if (other) return duplicateOf(other);
    // Held by a marker whose job is long gone - take it over outright.
    await env.QUEUE.put(dedupeKey(want), JSON.stringify(marker), { httpMetadata: { contentType: "application/json" } });
  }

  const record = {
    id,
    kind: "command",
    cmd,
    input: text,
    requestedBy: String(requestedBy).replace(CONTROL, "").slice(0, 40),
    state: "pending",
    queuedAt: new Date().toISOString(),
  };
  await env.QUEUE.put(`queue/pending/${id}.json`, JSON.stringify(record, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
  return { record, row, ahead: pending.objects.length, when: await whenWillItRun(env) };
}

/* -------------------------------------------------------------- status --- */

/**
 * EVERY TIME SHOWN TO A PERSON IS IST, and that is a correctness rule, not a
 * formatting preference.
 *
 * Workers run in UTC. `wakeTimes` are wall-clock times set on a laptop in
 * India ("14:00" means 14:00 IST), so building them with the Worker's local
 * clock read them as 14:00 UTC and every estimate was 5h30m out - a job queued
 * at 14:33 IST was quoted "runs at about 14:00, in 4h 57m", a time that had
 * already passed.
 *
 * A fixed offset is correct here rather than lazy: India has no daylight
 * saving, so IST is UTC+05:30 all year. Doing the arithmetic explicitly also
 * avoids depending on the Workers runtime carrying a full timezone database.
 */
const IST_OFFSET_MIN = 330;

/** Wall-clock HH:MM in IST for any instant. */
export function istTime(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60000);
  return `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}`;
}

/** The soonest future instant matching one of the IST wall-clock `times`. */
function nextWakeInstant(times, now) {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60000);
  let soonest = null;
  for (const t of times) {
    const [h, m] = String(t).split(":").map(Number);
    // today and tomorrow in IST, converted back to real instants
    for (const dayOffset of [0, 1]) {
      const wall = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + dayOffset, h || 0, m || 0, 0, 0);
      const instant = new Date(wall - IST_OFFSET_MIN * 60000);
      if (instant > now && (!soonest || instant < soonest)) soonest = instant;
    }
  }
  return soonest;
}

const humanWait = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`);

/**
 * When will queued work actually run?
 *
 * `wakeTimes` is the durable fact; the stored `nextWake` is derived and goes
 * stale - a heartbeat written 26 hours ago produced "at about 03:30 (in 0 min)".
 * Recompute from the times every read.
 */
export async function whenWillItRun(env) {
  const hb = await readJson(env, "status/heartbeat.json", null);
  if (!hb) return { awake: false, text: "when the laptop is next on" };

  const now = new Date();
  const mins = hb.at ? Math.round((now - Date.parse(hb.at)) / 60000) : null;
  const awake = mins != null && mins < 20 && mins > -10;
  if (awake) {
    /* `watching` is the difference between "someone touched R2 recently" and
       "a process is polling right now and will start this in seconds". Only the
       second one justifies showing a spinner instead of a queue position. */
    return {
      awake: true,
      watching: Boolean(hb.watching),
      text: hb.watching
        ? "now - the laptop is watching the queue and starts it within seconds"
        : "now - the laptop is awake and picks up work as it arrives",
      state: hb.state,
      current: hb.current || null,
    };
  }

  const times = Array.isArray(hb.wakeTimes) && hb.wakeTimes.length ? hb.wakeTimes : null;
  const soonest = times ? nextWakeInstant(times, now) : null;
  if (soonest) {
    const inMin = Math.round((soonest - now) / 60000);
    return {
      awake: false,
      text: `at about ${istTime(soonest)} IST (in ${humanWait(inMin)})`,
      nextWake: soonest.toISOString(),
    };
  }
  return { awake: false, text: "when the laptop is next on" };
}

/** The sentence a person reads after pressing a button. */
export function queuedMessage({ row, ahead, when, duplicate }) {
  const tail = ahead ? ` ${ahead} job(s) ahead of it.` : "";
  // Silently reusing the existing job would look like the click did nothing -
  // the very thing that caused the double-click in the first place.
  if (duplicate) {
    return when.awake
      ? `"${row.label}" is already in the queue with the same input, so this did not add a second copy. The laptop is awake and working through it.${tail}`
      : `"${row.label}" is already queued with the same input, so this did not add a second copy. It runs ${when.text}.${tail}`;
  }
  // An awake laptop runs it immediately, so do not dress that up as a schedule.
  if (when.awake) {
    if (!ahead) return `"${row.label}" is starting now - the laptop is ${when.watching ? "watching" : "awake"}.`;
    return `"${row.label}" is queued. The laptop is awake and working through the queue -${tail.replace(" job(s) ahead of it.", " job(s) ahead of this one.")}`;
  }
  return row.laptop
    ? `"${row.label}" is queued. It needs the laptop (ffmpeg/Chrome/Manim), so it runs ${when.text}.${tail}`
    : `"${row.label}" is queued and runs ${when.text}.${tail}`;
}

/* ------------------------------------------------- scripts and job state --- */

/**
 * Every drafted script, newest first — the shape the Scripts page expects.
 *
 * The disk version stat()ed a directory. R2 gives `uploaded` on the listing, so
 * ordering needs no extra read, but title and scene types live INSIDE each
 * object and do cost one read apiece. Capped, because a portal listing does not
 * need to fan out unboundedly at the edge.
 */
export async function listScripts(env, limit = 60) {
  if (!env?.QUEUE) return [];
  const listed = await env.QUEUE.list({ prefix: `${STATE}/scripts/`, limit: 300 });
  const rendered = new Set((await listRenders(env)).map((r) => r.id));

  const rows = listed.objects
    .filter((o) => o.key.endsWith(".json") && !o.key.endsWith(".meta.json"))
    .map((o) => ({ o, id: o.key.slice(`${STATE}/scripts/`.length).replace(/\.json$/, "") }))
    .sort((a, b) => new Date(b.o.uploaded || 0) - new Date(a.o.uploaded || 0))
    .slice(0, limit);

  return Promise.all(
    rows.map(async ({ o, id }) => {
      const s = (await readJson(env, o.key, null)) || {};
      return {
        id,
        title: s.title || id,
        sceneTypes: (s.scenes || []).map((sc) => sc.type),
        mtime: o.uploaded ? new Date(o.uploaded).getTime() : 0,
        rendered: rendered.has(id),
      };
    })
  );
}

/**
 * One queued job by id, wherever it currently sits.
 *
 * The disk version read a job log the local runner wrote while a child process
 * streamed into it. There is no child process here: a job is a queue record that
 * moves pending -> running -> done|failed, so "status" means which prefix holds
 * it. The UI polls this, so it returns the same {state} vocabulary it did before
 * and adds `log` only once the laptop has written one.
 */
export async function readJob(env, id) {
  if (!env?.QUEUE) return null;
  const safe = String(id).split("/").pop();
  for (const state of ["running", "pending", "done", "failed"]) {
    const rec = await readJson(env, `queue/${state}/${safe}.json`, null);
    if (rec) return { ...rec, state: rec.state || state };
  }
  return null;
}

/* --------------------------------------------------------------- writes --- */

/**
 * Write a collection back to R2.
 *
 * The portal is mostly a reader, but a few things are edits rather than jobs:
 * approving a brief, ticking a checklist item, removing a wishlist row. Queuing
 * those would mean clicking "approve" and seeing nothing change until the laptop
 * next wakes, which is not a reasonable way to run a pipeline.
 *
 * THE HAZARD, STATED PLAINLY: the laptop has its own copy in data/os/, and
 * `factory sync push` used to overwrite the cloud copy whenever the byte length
 * differed. An edit made here would have vanished the next time the laptop
 * pushed. pushState() now refuses to overwrite an object that is newer than its
 * local file and tells you to pull first, so the loss cannot happen silently -
 * but the ordering still matters: pull before you work on the laptop.
 */
export async function writeCollection(env, name, rows) {
  if (!env?.QUEUE) throw new Error("storage is not bound");
  const body = JSON.stringify({ updatedAt: new Date().toISOString(), rows }, null, 2);
  await env.QUEUE.put(`${STATE}/os/${name}.json`, body, {
    httpMetadata: { contentType: "application/json" },
  });
  return rows;
}
