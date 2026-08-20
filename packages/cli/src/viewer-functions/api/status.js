/**
 * Pages Function: what is happening right now.
 *
 * Reads the queue and the laptop's heartbeat straight from R2, so the answer is
 * live even though the page around it is static. This is what lets the page say
 * "asleep, next run at 14:00, 2 waiting" instead of leaving someone guessing.
 *
 * Read-only. It lists and reads objects; it cannot start or change anything.
 */

const STALE_MIN = 20; // no beat for this long => treat as asleep, not "working"

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });

async function readJson(env, key) {
  const obj = await env.QUEUE.get(key);
  if (!obj) return null;
  try {
    return JSON.parse(await obj.text());
  } catch {
    return null;
  }
}

export async function onRequestGet({ env }) {
  if (!env.QUEUE) return json({ ok: false, error: "queue storage is not bound" }, 500);

  const count = async (p) => (await env.QUEUE.list({ prefix: p, limit: 200 })).objects.length;
  const [pending, running, done, failed] = await Promise.all([
    count("queue/pending/"),
    count("queue/running/"),
    count("queue/done/"),
    count("queue/failed/"),
  ]);

  const hb = await readJson(env, "status/heartbeat.json");
  const now = Date.now();
  const seenMin = hb?.at ? Math.round((now - Date.parse(hb.at)) / 60000) : null;
  // A beat far in the FUTURE means clock skew or a bad write — not health.
  const awake = seenMin != null && seenMin < STALE_MIN && seenMin > -10;

  return json({
    ok: true,
    queue: { pending, running, done, failed },
    laptop: {
      awake,
      state: awake ? hb.state : "asleep",
      lastSeenMinutes: seenMin,
      nextWake: hb?.nextWake || null,
      current: awake && hb.state === "working" ? hb.current || null : null,
    },
    now: new Date(now).toISOString(),
  });
}
