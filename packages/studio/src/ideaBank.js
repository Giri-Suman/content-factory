import { loadEnv, loadUserConfig, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection, newId } from "../../shared/src/store.js";
import { chat, providerStatus } from "../../llm/src/llm.js";

/**
 * P14 Idea Bank & Series Planner.
 * Every approved brief auto-enters the bank (pillar + effort tagged).
 * "Make Next" rank = baseScore × pillarBalance (MyPost 14d history) ×
 * effortFit (available hours/week from Settings) × freshness decay
 * (trend ideas past deadline). All four factors stored per idea so the
 * ranking is explainable, not a black box.
 */

export const PILLARS = ["build", "tool-verdict", "explainer", "news-take"];

/* ---------------- classification ---------------- */

export function heuristicPillar(title) {
  const t = title.toLowerCase();
  if (/\bvs\b|best |review|verdict|tested|compare|worth it/.test(t)) return "tool-verdict";
  if (/launch|release|update|announc|just (dropped|shipped)|new (model|version)|news/.test(t)) return "news-take";
  if (/\b(i|my|we)\b.*(built|made|automated|created)|build|automation|script that/.test(t)) return "build";
  if (/how|what|why|explained|guide|understand|means/.test(t)) return "explainer";
  return "explainer";
}

function heuristicEffort(brief) {
  const p = brief?.payload || {};
  const len = p.yt_short?.length_sec || 32;
  if (brief?.kind === "trend") return "S"; // ship it today or don't
  if (len > 90 || (p.blog_outline?.h2_sections || []).length > 4) return "M";
  return "S";
}

async function llmClassify(title, brief) {
  if (!providerStatus().active) return null;
  try {
    const res = await chat({
      task: "score",
      maxTokens: 300,
      system:
        `Classify a content idea for: ${NICHE_CONTEXT}. Reply ONLY JSON: ` +
        '{"pillar":"build|tool-verdict|explainer|news-take","effort":"S|M|L"} (S ≤2h, M ≤1 day, L >1 day of work).',
      user: `${title}\nformat: ${brief?.payload?.yt_short?.length_sec || 32}s short + carousel + posts`,
    });
    const p = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
    if (PILLARS.includes(p.pillar) && ["S", "M", "L"].includes(p.effort)) return p;
  } catch {
    /* heuristic */
  }
  return null;
}

/* ---------------- bank entry ---------------- */

function baseScoreFor(brief) {
  if (brief.topicClusterId) {
    const c = collection("clusters").get(brief.topicClusterId);
    if (c) return c.opportunityScore;
  }
  if (brief.wishlistEntryId) {
    const w = collection("wishlist").get(brief.wishlistEntryId);
    if (w) return { S: 90, A: 70, B: 50, C: 30 }[w.predictedTier] || 50;
  }
  if (brief.keyword) {
    const k = collection("keywords").all().find((x) => x.keyword === brief.keyword);
    if (k) return Math.min(95, Math.round(k.opportunity * 4));
  }
  return 50;
}

export async function enterIdeaBank(briefId) {
  loadEnv();
  const briefs = collection("briefs");
  const brief = briefs.get(briefId);
  if (!brief) throw new Error(`no brief ${briefId}`);

  const bank = collection("ideabank");
  const existing = bank.all().find((i) => i.briefId === briefId);
  if (existing) return { idea: existing, existed: true };

  const cls = (await llmClassify(brief.topic, brief)) || { pillar: heuristicPillar(brief.topic), effort: heuristicEffort(brief) };
  const idea = bank.upsert({
    id: newId(),
    briefId,
    title: brief.topic,
    pillar: cls.pillar,
    effort: cls.effort,
    status: "backlog",
    score: baseScoreFor(brief),
    kind: brief.kind,
    deadline: brief.deadline || null,
    seriesId: null,
    episodeNum: null,
    createdAt: new Date().toISOString(),
  });
  briefs.update(briefId, { pillar: cls.pillar }); // MyPost rows pick this up on publish
  return { idea, existed: false };
}

export async function syncApproved() {
  const approved = collection("briefs").find((b) => b.status === "approved");
  let entered = 0;
  for (const b of approved) {
    const r = await enterIdeaBank(b.id);
    if (!r.existed) entered++;
  }
  return { approved: approved.length, entered };
}

/* ---------------- ranking ---------------- */

export function rankIdeas() {
  const cfg = loadUserConfig();
  const hours = Number(cfg.availableHoursPerWeek) || 6;
  const bank = collection("ideabank").find((i) => i.status === "backlog" || i.status === "scheduled");

  // pillar balance from the last 14 days of MyPost history
  const cutoff = Date.now() - 14 * 864e5;
  const recent = collection("myposts").find((m) => m.postedAt && new Date(m.postedAt).getTime() >= cutoff);
  const byPillar = {};
  for (const m of recent) if (m.pillar) byPillar[m.pillar] = (byPillar[m.pillar] || 0) + 1;
  const total = recent.filter((m) => m.pillar).length;

  const factors = (idea) => {
    const share = total > 0 ? (byPillar[idea.pillar] || 0) / total : 0;
    const pillarBalance = Math.max(0.4, Math.round((1.3 - share * 1.2) * 100) / 100);
    const effortFit =
      idea.effort === "S" ? 1 : idea.effort === "M" ? (hours >= 5 ? 1 : 0.6) : hours >= 10 ? 0.9 : hours >= 6 ? 0.6 : 0.3;
    const freshness = idea.kind === "trend" && idea.deadline && Date.now() > new Date(idea.deadline).getTime() ? 0.3 : 1;
    return { pillarBalance, effortFit, freshness };
  };

  return bank
    .map((idea) => {
      const f = factors(idea);
      return { ...idea, factors: f, rank: Math.round(idea.score * f.pillarBalance * f.effortFit * f.freshness * 10) / 10 };
    })
    .sort((a, b) => b.rank - a.rank);
}

/* ---------------- series planner ---------------- */

export function createSeries(name, continuityNotes = "") {
  return collection("series").upsert(
    { id: newId(), name, continuityNotes, createdAt: new Date().toISOString() },
    (r) => r.name.toLowerCase()
  );
}

export function assignToSeries(ideaId, seriesId) {
  const bank = collection("ideabank");
  const idea = bank.get(ideaId);
  const series = collection("series").get(seriesId);
  if (!idea || !series) throw new Error("unknown idea or series");
  const episodes = bank.find((i) => i.seriesId === seriesId).map((i) => i.episodeNum || 0);
  const episodeNum = (episodes.length ? Math.max(...episodes) : 0) + 1;
  return bank.update(ideaId, { seriesId, episodeNum });
}

export function seriesView() {
  const bank = collection("ideabank").all();
  return collection("series").all().map((s) => {
    const episodes = bank.filter((i) => i.seriesId === s.id).sort((a, b) => (a.episodeNum || 0) - (b.episodeNum || 0));
    const nums = episodes.map((e) => e.episodeNum).filter(Boolean);
    const gaps = [];
    for (let n = 1; n < (nums.length ? Math.max(...nums) : 0); n++) if (!nums.includes(n)) gaps.push(n);
    return { ...s, episodes, gaps, nextEpisode: (nums.length ? Math.max(...nums) : 0) + 1 };
  });
}

/* ---------------- dedupe guard ---------------- */

const tokens = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter((w) => w.length > 3));

export function dedupeCheck(title) {
  const T = tokens(title);
  if (!T.size) return null;
  let best = null;
  for (const idea of collection("ideabank").all()) {
    const I = tokens(idea.title);
    if (!I.size) continue;
    let inter = 0;
    for (const w of T) if (I.has(w)) inter++;
    const sim = inter / Math.min(T.size, I.size);
    if (sim >= 0.6 && (!best || sim > best.sim)) best = { ideaId: idea.id, title: idea.title, sim: Math.round(sim * 100) / 100 };
  }
  return best;
}
