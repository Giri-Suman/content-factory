/**
 * Pages Function: the full command surface, always available.
 *
 * factory.coderfact.com should work whether or not the laptop is awake. Half
 * its commands spawn ffmpeg, Chrome, Manim or whisper and genuinely need that
 * machine — so rather than hiding them, they are QUEUED here and the laptop
 * runs them the next time it wakes. The page says what will happen and when.
 *
 * GET  -> the command list, each marked laptop-required or not
 * POST -> queue one, returning the message the page should show
 *
 * SAFETY: a POST carries a registry KEY, never a command line. The key is
 * checked against the registry copy below, and the laptop rebuilds argv from
 * its own registry when it drains. Nothing here can name a shell command.
 *
 * The registry is duplicated as data rather than imported because Workers
 * cannot load the repo's ESM modules. `factory viewer build` regenerates this
 * file's companion manifest, so the two cannot drift silently.
 */

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });

const CONTROL = /[\u0000-\u001f\u007f]/;

async function manifest(env) {
  const obj = await env.QUEUE.get("state/_commands.json");
  if (!obj) return null;
  try {
    return JSON.parse(await obj.text());
  } catch {
    return null;
  }
}

export async function onRequestGet({ env }) {
  if (!env.QUEUE) return json({ ok: false, error: "storage is not bound" }, 500);
  const m = await manifest(env);
  if (!m) return json({ ok: false, error: "no command manifest — run `factory sync push` on the laptop" }, 503);
  return json({ ok: true, stages: m.stages, commands: m.commands, at: m.at });
}

export async function onRequestPost({ request, env }) {
  if (!env.QUEUE) return json({ ok: false, error: "storage is not bound" }, 500);
  const m = await manifest(env);
  if (!m) return json({ ok: false, error: "no command manifest yet" }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "expected JSON" }, 400);
  }

  const row = m.commands.find((c) => c.key === body.cmd);
  if (!row) return json({ ok: false, error: "unknown command" }, 400);

  const input = String(body.input || "").trim();
  if (row.argKind && !input) return json({ ok: false, error: `${row.label} needs ${row.argLabel || row.argKind}` }, 400);
  if (input.length > 300) return json({ ok: false, error: "input too long" }, 400);
  if (CONTROL.test(input)) return json({ ok: false, error: "input contains control characters" }, 400);

  const pending = await env.QUEUE.list({ prefix: "queue/pending/", limit: 60 });
  if (pending.objects.length >= 50) return json({ ok: false, error: "queue is full — wait for it to drain" }, 429);

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const record = {
    id,
    kind: "command",
    cmd: row.key,
    input,
    requestedBy: String(body.requestedBy || "portal").replace(CONTROL, "").slice(0, 40),
    vertical: row.cat && row.cat !== "all" ? row.cat : "all",
    state: "pending",
    queuedAt: new Date().toISOString(),
  };
  await env.QUEUE.put(`queue/pending/${id}.json`, JSON.stringify(record, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });

  /* Tell the person what will actually happen. "Queued" alone invites a refresh
     loop; a time does not. */
  let hb = null;
  try {
    const o = await env.QUEUE.get("status/heartbeat.json");
    if (o) hb = JSON.parse(await o.text());
  } catch {
    /* heartbeat is optional */
  }
  const seen = hb?.at ? Math.round((Date.now() - Date.parse(hb.at)) / 60000) : null;
  const awake = seen != null && seen < 20 && seen > -10;
  const when = hb?.nextWake ? new Date(hb.nextWake) : null;

  return json({
    ok: true,
    id,
    queued: row.label,
    message: awake
      ? `Queued. The laptop is awake, so this runs shortly.`
      : when
        ? `Queued. The laptop is asleep — this runs at about ${when.toISOString().slice(11, 16)} UTC.`
        : `Queued. It runs the next time the laptop is on.`,
    position: pending.objects.length + 1,
  });
}
