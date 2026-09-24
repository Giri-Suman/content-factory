/**
 * Wishlist — posts you want to learn from, and their autopsies.
 *
 * The page reads `entries` and `hasYtKey`; the port returned `wishlist`, so the
 * list was permanently empty and the "add by URL" box never explained that it
 * needs a YouTube key.
 */

import { getEnv } from "@factory-env";
import { actOn, readCollection, readEnvFlags, writeCollection } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const [rows, flags] = await Promise.all([readCollection(env, "wishlist"), readEnvFlags(env)]);
  return json({ entries: rows, hasYtKey: Boolean(flags.youtube), wishlist: rows });
}

/**
 * Which registry command each button means.
 *
 * The port dropped `action` entirely and enqueued one command whatever was
 * pressed, so every button on this page did the same thing. `null` marks an
 * action the registry has no row for - those are refused by name rather than
 * quietly running something else.
 */
export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === "poll") return json(await actOn(env, request, { cmd: "wishlist-poll" }));
    if (body.url) {
      const url = String(body.url).trim();
      if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) return json({ ok: false, error: "Enter a YouTube video URL." }, 400);
      return json(await actOn(env, request, { cmd: "wishlist-add", arg: url }));
    }
    if (body.manual && typeof body.manual === "object") {
      const form = body.manual;
      const number = (value) => Number(value);
      for (const field of ["views", "likes", "comments", "hoursSincePost", "creatorFollowerCount"]) {
        if (!Number.isFinite(number(form[field])) || number(form[field]) < 0 || number(form[field]) > 1e12) {
          return json({ ok: false, error: `Enter a valid ${field}.` }, 400);
        }
      }
      if (form.shares && (!Number.isFinite(number(form.shares)) || number(form.shares) < 0)) return json({ ok: false, error: "Enter a valid shares count." }, 400);
      if (number(form.views) < 1 || number(form.hoursSincePost) < 1) return json({ ok: false, error: "Views and hours since post must be above zero." }, 400);
      const url = String(form.url || "").trim();
      if (url && !/^https:\/\//i.test(url)) return json({ ok: false, error: "Use an HTTPS post URL." }, 400);
      const views = number(form.views), followers = number(form.creatorFollowerCount), hours = number(form.hoursSincePost);
      const engagementRate = Math.round(((number(form.likes) + number(form.comments)) / views) * 1000) / 1000;
      const viewsPerFollower = followers > 0 ? Math.round(views / followers * 100) / 100 : 0;
      const predictedTier = viewsPerFollower >= 5 && engagementRate >= 0.05 ? "S"
        : viewsPerFollower >= 1.5 && engagementRate >= 0.03 ? "A"
          : viewsPerFollower >= 0.5 ? "B" : "C";
      const metrics = { mode: "manual", views, likes: number(form.likes), comments: number(form.comments),
        shares: form.shares ? number(form.shares) : null, hoursSincePost: hours, creatorFollowerCount: followers,
        viewsPerFollower, engagementRate, viewsPerHour: Math.round(views / hours) };
      const entry = { id: crypto.randomUUID(), platform: form.platform === "facebook" ? "facebook" : "instagram",
        url: url || null, title: String(form.caption || "").slice(0, 120) || "(manual entry)", mode: "manual", metrics,
        contentAnalysis: null, verdict: { predictedTier, rubric: `${predictedTier}: ${viewsPerFollower}x views/follower, engagement ${(engagementRate * 100).toFixed(1)}%, ${metrics.viewsPerHour}/h` },
        predictedTier, createdAt: new Date().toISOString() };
      const rows = await readCollection(env, "wishlist");
      await writeCollection(env, "wishlist", [...rows, entry]);
      return json({ ok: true, out: "Manual entry saved with a metrics-based tier; AI structural analysis is not available at the edge.", entry });
    }
    return json({ ok: false, error: "Choose a video URL or poll action." }, 400);
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}

export async function DELETE(request) {
  const env = getEnv();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ ok: false, error: "wishlist id required" }, 400);
  const rows = await readCollection(env, "wishlist");
  if (!rows.some((row) => row.id === id)) return json({ ok: false, error: "unknown wishlist entry" }, 404);
  await writeCollection(env, "wishlist", rows.filter((row) => row.id !== id));
  return json({ ok: true });
}
