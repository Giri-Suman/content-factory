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

  const pending = await env.QUEUE.list({ prefix: "queue/pending/", limit: 60 });
  if (pending.objects.length >= 50) throw new Error("queue is full - wait for it to drain");

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
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
 * When will queued work actually run?
 *
 * `wakeTimes` is the durable fact; the stored `nextWake` is derived and goes
 * stale — a heartbeat written 26 hours ago produced "at about 03:30 (in 0 min)".
 * Recompute from the times every read.
 */
export async function whenWillItRun(env) {
  const hb = await readJson(env, "status/heartbeat.json", null);
  if (!hb) return { awake: false, text: "when the laptop is next on" };

  const mins = hb.at ? Math.round((Date.now() - Date.parse(hb.at)) / 60000) : null;
  const awake = mins != null && mins < 20 && mins > -10;
  if (awake) return { awake: true, text: "the laptop is awake - it runs next", state: hb.state, current: hb.current || null };

  const times = Array.isArray(hb.wakeTimes) && hb.wakeTimes.length ? hb.wakeTimes : null;
  if (times) {
    const now = new Date();
    let soonest = null;
    for (const t of times) {
      const [h, m] = String(t).split(":").map(Number);
      for (const off of [0, 1]) {
        const d = new Date(now);
        d.setDate(d.getDate() + off);
        d.setHours(h || 0, m || 0, 0, 0);
        if (d > now && (!soonest || d < soonest)) soonest = d;
      }
    }
    if (soonest) {
      const inMin = Math.round((soonest - now) / 60000);
      const hhmm = soonest.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      const wait = inMin < 60 ? `${inMin} min` : `${Math.floor(inMin / 60)}h ${inMin % 60}m`;
      return { awake: false, text: `at about ${hhmm} (in ${wait})`, nextWake: soonest.toISOString() };
    }
  }
  return { awake: false, text: "when the laptop is next on" };
}

/** The sentence a person reads after pressing a button. */
export function queuedMessage({ row, ahead, when }) {
  const tail = ahead ? ` ${ahead} job(s) ahead of it.` : "";
  return row.laptop
    ? `"${row.label}" is queued. It needs the laptop (ffmpeg/Chrome/Manim), so it runs ${when.text}.${tail}`
    : `"${row.label}" is queued and runs ${when.text}.${tail}`;
}
