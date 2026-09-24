/**
 * Idea bank and series planner.
 *
 * The disk route shelled out to `ideabank rank --json` so the ranking math lived
 * in one place. A Worker cannot, so it reads the stored ranking instead - the
 * same rows the CLI wrote on its last run. Re-rank from the button; it queues.
 *
 * `series` and `recentPillars` were missing entirely from the port, which is why
 * the series planner showed nothing.
 */

import { getEnv } from "@factory-env";
import { actOn, readCollection, writeCollection } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const [ideas, series, myposts] = await Promise.all([
    readCollection(env, "ideabank"),
    readCollection(env, "series"),
    readCollection(env, "myposts"),
  ]);
  return json({
    ideas,
    series: series.map((item) => {
      const episodes = ideas.filter((idea) => idea.seriesId === item.id).sort((a, b) => (a.episodeNum || 0) - (b.episodeNum || 0));
      const numbers = episodes.map((idea) => idea.episodeNum).filter(Boolean);
      const last = numbers.length ? Math.max(...numbers) : 0;
      const gaps = Array.from({ length: last }, (_, index) => index + 1).filter((number) => !numbers.includes(number));
      return { ...item, episodes, gaps, nextEpisode: last + 1 };
    }),
    recentPillars: myposts
      .filter((m) => m.pillar && m.postedAt && Date.now() - new Date(m.postedAt).getTime() < 14 * 864e5)
      .map((m) => m.pillar),
  });
}

export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === "seriesCreate") {
      const name = String(body.name || "").trim();
      if (!name || name.length > 120) return json({ ok: false, error: "series name must be 1–120 characters" }, 400);
      const series = await readCollection(env, "series");
      if (series.some((item) => item.name.toLowerCase() === name.toLowerCase())) return json({ ok: false, error: "series already exists" }, 409);
      const created = { id: crypto.randomUUID(), name, continuityNotes: "", createdAt: new Date().toISOString() };
      await writeCollection(env, "series", [...series, created]);
      return json({ ok: true, out: `Created series “${name}”.`, series: created });
    }
    if (body.action === "seriesAdd") {
      const [series, ideas] = await Promise.all([readCollection(env, "series"), readCollection(env, "ideabank")]);
      if (!series.some((item) => item.id === body.seriesId)) return json({ ok: false, error: "unknown series" }, 404);
      const index = ideas.findIndex((idea) => idea.id === body.ideaId);
      if (index < 0) return json({ ok: false, error: "unknown idea" }, 404);
      const used = ideas.filter((idea) => idea.seriesId === body.seriesId).map((idea) => idea.episodeNum || 0);
      const episodeNum = Math.max(0, ...used) + 1;
      ideas[index] = { ...ideas[index], seriesId: body.seriesId, episodeNum };
      await writeCollection(env, "ideabank", ideas);
      return json({ ok: true, out: `Assigned episode ${episodeNum}.`, idea: ideas[index] });
    }
    if (body.action === "sync") return json(await actOn(env, request, { cmd: "ideabank-sync" }));
    if (body.action === "brief") {
      const ideaId = String(body.ideaId || "").trim();
      const ideas = await readCollection(env, "ideabank");
      if (!ideas.some((idea) => idea.id === ideaId)) return json({ ok: false, error: "unknown idea" }, 404);
      return json(await actOn(env, request, { cmd: "ideabank-brief", arg: ideaId }));
    }
    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
