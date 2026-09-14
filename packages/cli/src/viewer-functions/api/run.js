/**
 * Pages Function: trigger any of the factory's commands from the always-on portal.
 *
 * ONE portal, every command visible. Roughly a third of them spawn ffmpeg,
 * Chrome, Manim or whisper and therefore need the laptop — those are not hidden
 * or greyed out, they are QUEUED, and the response says when they will actually
 * run. The rest are queued too: the laptop drains everything in order, so there
 * is one path and one place to look.
 *
 * SAFETY — this is a public endpoint, so it gets the same rule the local portal
 * has always had: the client sends a registry KEY, never a command line. The key
 * is checked against the manifest published by `factory sync push`, and argv is
 * rebuilt on the laptop from that key alone. There is no path from this endpoint
 * to a shell, and adding one would require changing the drainer, not this file.
 *
 * `publish --go`, `worker` and `auth-youtube` are absent from the registry
 * entirely, so they cannot be reached from here at all — the one real upload
 * stays a deliberate terminal action.
 */

const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_PENDING = 50;

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });

async function manifest(env) {
  const obj = await env.QUEUE.get("state/_commands.json");
  if (!obj) return null;
  try {
    return JSON.parse(await obj.text());
  } catch {
    return null;
  }
}

/** When will this actually run? Read the laptop's heartbeat rather than guess. */
async function whenWillItRun(env) {
  const obj = await env.QUEUE.get("status/heartbeat.json");
  if (!obj) return { awake: false, text: "when the laptop is next on" };
  try {
    const hb = JSON.parse(await obj.text());
    const mins = hb.at ? Math.round((Date.now() - Date.parse(hb.at)) / 60000) : null;
    // Same staleness window the status endpoint uses: a beat older than 20
    // minutes means the machine slept without saying so.
    const awake = mins != null && mins < 20 && mins > -10;
    if (awake) return { awake: true, text: "the laptop is awake - it runs next" };
    /* RECOMPUTE the next wake rather than trusting the stored one. `nextWake`
       was calculated when the laptop last beat - if that was 26 hours ago the
       stored time is in the PAST, and the message reads "at about 03:30 (in 0
       min)", which is worse than saying nothing. `wakeTimes` is the durable
       fact; the derived timestamp is not. */
    const times = Array.isArray(hb.wakeTimes) && hb.wakeTimes.length ? hb.wakeTimes : null;
    if (times) {
      const now = new Date();
      let soonest = null;
      for (const t of times) {
        const [h, m] = String(t).split(":").map(Number);
        for (const dayOffset of [0, 1]) {
          const d = new Date(now);
          d.setDate(d.getDate() + dayOffset);
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
    if (hb.nextWake && new Date(hb.nextWake) > new Date()) {
      const at = new Date(hb.nextWake);
      const inMin = Math.max(0, Math.round((at - Date.now()) / 60000));
      const hhmm = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      const wait = inMin < 60 ? `${inMin} min` : `${Math.floor(inMin / 60)}h ${inMin % 60}m`;
      return { awake: false, text: `at about ${hhmm} (in ${wait})`, nextWake: hb.nextWake };
    }
    return { awake: false, text: "when the laptop is next on" };
  } catch {
    return { awake: false, text: "when the laptop is next on" };
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.QUEUE) return json({ ok: false, error: "queue storage is not bound" }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "expected JSON" }, 400);
  }

  const man = await manifest(env);
  if (!man) return json({ ok: false, error: "no command manifest - run `factory sync push` once" }, 503);

  const key = String(body.cmd || "");
  const row = man.commands.find((c) => c.key === key);
  if (!row) return json({ ok: false, error: `unknown command "${key}"` }, 400);

  const arg = String(body.arg ?? "").trim();
  if (row.argKind && !arg) return json({ ok: false, error: `${row.label} needs ${row.argLabel || row.argKind}` }, 400);
  if (arg.length > 300) return json({ ok: false, error: "input too long (max 300)" }, 400);
  if (CONTROL.test(arg)) return json({ ok: false, error: "input contains control characters" }, 400);

  // One requester should not be able to fill the bucket with pending work.
  const pending = await env.QUEUE.list({ prefix: "queue/pending/", limit: MAX_PENDING + 10 });
  if (pending.objects.length >= MAX_PENDING) {
    return json({ ok: false, error: "queue is full - wait for it to drain" }, 429);
  }

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const record = {
    id,
    kind: "command",
    cmd: key,
    input: arg,
    requestedBy: String(body.requestedBy || "portal").replace(CONTROL, "").slice(0, 40),
    state: "pending",
    queuedAt: new Date().toISOString(),
  };
  await env.QUEUE.put(`queue/pending/${id}.json`, JSON.stringify(record, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });

  const when = await whenWillItRun(env);
  const ahead = pending.objects.length;

  return json({
    ok: true,
    id,
    queued: row.label,
    laptop: row.laptop,
    // The message the person actually reads. Concrete about time, and honest
    // that a laptop job is waiting on a machine rather than on nothing.
    message: row.laptop
      ? `"${row.label}" is queued. It needs the laptop (it runs ffmpeg/Chrome/Manim), so it will run ${when.text}.` +
        (ahead ? ` ${ahead} job(s) ahead of it.` : "")
      : `"${row.label}" is queued and will run ${when.text}.` + (ahead ? ` ${ahead} ahead.` : ""),
    when,
  });
}
