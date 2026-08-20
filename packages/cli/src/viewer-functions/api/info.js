/**
 * Pages Function: read the factory's STATE from R2 and serve it as JSON.
 *
 * This is what makes the portal's information available with the laptop off.
 * The ops portal at factory.coderfact.com cannot move to Cloudflare - 30 of its
 * 37 routes spawn ffmpeg, Chrome, Manim or whisper, and Workers has no
 * child_process. But *reading* needs none of that: the state is 71 JSON files
 * synced to R2 by `factory sync push`.
 *
 * So: execution stays on the laptop, information lives here, always on.
 *
 * Read-only by construction. It lists and reads objects and cannot start,
 * change or delete anything.
 */

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });

async function readState(env, name) {
  const obj = await env.QUEUE.get(`state/os/${name}.json`);
  if (!obj) return [];
  try {
    const parsed = JSON.parse(await obj.text());
    // The collection store writes { updatedAt, rows }. Tolerate a bare array
    // too, so a shape change does not blank the page.
    return Array.isArray(parsed) ? parsed : parsed.rows || [];
  } catch {
    return [];
  }
}

export async function onRequestGet({ env, request }) {
  if (!env.QUEUE) return json({ ok: false, error: "state storage is not bound" }, 500);
  const want = new URL(request.url).searchParams.get("of") || "summary";

  if (want === "briefs") {
    const rows = await readState(env, "briefs");
    return json({
      ok: true,
      briefs: rows
        .slice(-40)
        .reverse()
        .map((b) => ({
          id: b.id,
          topic: b.topic || b.payload?.title || "(untitled)",
          kind: b.kind,
          status: b.status,
          deadline: b.deadline || b.scheduledDate || null,
          createdAt: b.createdAt,
          hook: b.payload?.hooks?.[0] || b.payload?.hook || null,
        })),
    });
  }

  if (want === "trends") {
    const rows = await readState(env, "clusters");
    return json({
      ok: true,
      clusters: rows
        .filter((c) => Number.isFinite(c.score))
        .sort((a, b) => b.score - a.score)
        .slice(0, 25)
        .map((c) => ({ label: c.label, score: c.score, category: c.category, size: c.members?.length ?? c.size ?? null })),
    });
  }

  // summary: the numbers someone opening this page actually wants
  const [briefs, clusters, items] = await Promise.all([
    readState(env, "briefs"),
    readState(env, "clusters"),
    readState(env, "publishitems"),
  ]);
  const count = async (p) => (await env.QUEUE.list({ prefix: p, limit: 300 })).objects.length;
  const [renders, pending] = await Promise.all([count("renders/"), count("queue/pending/")]);

  const byStatus = {};
  for (const b of briefs) byStatus[b.status || "unknown"] = (byStatus[b.status || "unknown"] || 0) + 1;

  return json({
    ok: true,
    briefs: { total: briefs.length, byStatus },
    clusters: { total: clusters.length, scored: clusters.filter((c) => Number.isFinite(c.score)).length },
    publishItems: items.length,
    renderFiles: renders,
    queuePending: pending,
  });
}
