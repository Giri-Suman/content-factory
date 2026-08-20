/**
 * Pages Function: accept a work request and drop it in the R2 queue.
 *
 * Runs on Cloudflare, so it is up whether or not the laptop is. This is the
 * ONLY write surface on the public page — everything else is a static list.
 *
 * It cannot run anything. It writes a JSON file naming a `kind` from a fixed
 * allowlist; the laptop maps that kind to a fixed argv when it drains. There is
 * no path from this endpoint to a command line.
 *
 * Binding required: R2 bucket bound as `QUEUE` on the Pages project.
 */

const KINDS = { math: 200, brief: 200 };
const CONTROL = /[\u0000-\u001f\u007f]/;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "x-robots-tag": "noindex" } });

export async function onRequestPost({ request, env }) {
  if (!env.QUEUE) return json({ ok: false, error: "queue storage is not bound on this deployment" }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "expected JSON" }, 400);
  }

  const kind = String(body.kind || "");
  const max = KINDS[kind];
  if (!max) return json({ ok: false, error: `unknown kind — allowed: ${Object.keys(KINDS).join(", ")}` }, 400);

  const input = String(body.input || "").trim();
  if (!input) return json({ ok: false, error: "input is required" }, 400);
  if (input.length > max) return json({ ok: false, error: `input too long (max ${max})` }, 400);
  if (CONTROL.test(input)) return json({ ok: false, error: "input contains control characters" }, 400);

  const who = String(body.requestedBy || "someone").replace(CONTROL, "").slice(0, 40);

  // Cheap flood guard: one requester cannot fill the bucket with pending jobs.
  const pending = await env.QUEUE.list({ prefix: "queue/pending/", limit: 60 });
  if (pending.objects.length >= 50) {
    return json({ ok: false, error: "queue is full — wait for it to drain" }, 429);
  }

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const record = { id, kind, input, requestedBy: who, state: "pending", queuedAt: new Date().toISOString() };
  await env.QUEUE.put(`queue/pending/${id}.json`, JSON.stringify(record, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });

  return json({ ok: true, id, queued: `${kind}: ${input}` });
}

/** Pending count, so the page can show the backlog honestly. */
export async function onRequestGet({ env }) {
  if (!env.QUEUE) return json({ ok: false, error: "queue storage is not bound" }, 500);
  const p = await env.QUEUE.list({ prefix: "queue/pending/", limit: 100 });
  return json({ ok: true, pending: p.objects.length });
}
