/**
 * Today's shortlist.
 */

import { getEnv } from "@factory-env";
export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

import { actOn, readCollection } from "../../../lib/cloud.js";

/**
 * The Today dashboard.
 *
 * Identical arithmetic to the disk version, over the same JSON read from R2.
 * One thing genuinely cannot come along: `makeNext` was produced by running
 * `ideabank rank` inline. That is a laptop command, so it comes back empty and
 * the card hides itself - the same thing it already did when ranking failed.
 */
export async function GET() {
  const env = getEnv();
  const [clusters, briefs, jobruns, watchchannels, watchvideos, digests, memos, critiques, lessons, escalations] =
    await Promise.all(
      ["clusters", "briefs", "jobruns", "watchchannels", "watchvideos", "digests", "memos", "critiques", "lessons", "escalations"].map(
        (n) => readCollection(env, n)
      )
    );

  const ranked = [...clusters].sort((a, b) => b.opportunityScore - a.opportunityScore);

  const rising = ranked
    .map((c) => {
      const h = c.scoreHistory || [];
      return { ...c, delta: h.length >= 2 ? h[h.length - 1] - h[h.length - 2] : 0 };
    })
    .filter((c) => c.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);

  const channels = new Map(watchchannels.map((c) => [c.id, c.title]));
  const weekAgo = Date.now() - 7 * 864e5;
  const outliers = watchvideos
    .filter((v) => v.outlierRatio >= 3 && v.publishedAt && new Date(v.publishedAt).getTime() >= weekAgo)
    .map((v) => ({ ...v, channelTitle: channels.get(v.channelId) || "?" }))
    .sort((a, b) => b.outlierRatio - a.outlierRatio)
    .slice(0, 8);

  const lastCollect = jobruns
    .filter((j) => j.job === "collect")
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0];

  const today = new Date().toISOString().slice(0, 10);
  const memoRow = memos[0] || null;
  const recentCrits = critiques.filter((c) => Date.now() - new Date(c.createdAt).getTime() < 14 * 864e5);

  return json({
    digest: digests.find((r) => r.date === today) || null,
    memo: memoRow && Date.now() - new Date(memoRow.at).getTime() < 8 * 864e5 ? memoRow : null,
    selfImprove: {
      activeLessons: lessons.filter((l) => l.active).length,
      passRate: recentCrits.length
        ? Math.round((recentCrits.filter((c) => c.verdict === "pass").length / recentCrits.length) * 100)
        : null,
      escalations: escalations.filter((e) => !e.resolved).length,
    },
    makeNext: [], // needs `ideabank rank` on the laptop
    top: ranked.slice(0, 10),
    rising,
    outliers,
    awaiting: briefs
      .filter((b) => b.status === "draft")
      .sort((a, b) => (a.deadline || "z").localeCompare(b.deadline || "z")),
    toPost: briefs.filter((b) => b.status === "approved" && (b.checklistState || []).some((x) => !x)),
    lastCollect: lastCollect ? { at: lastCollect.startedAt, ok: lastCollect.ok, ms: lastCollect.ms } : null,
  });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  try {
    return json(await actOn(env, request, { cmd: "ideabank-rank", arg: "", requestedBy: body.requestedBy || "portal" }));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}

