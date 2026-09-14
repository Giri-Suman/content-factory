import { loadEnv } from "../../shared/src/config.js";
import { collection } from "../../shared/src/store.js";

/**
 * Growth tools that read the data the factory already accumulates:
 *
 *  catalogGaps()   what my niche/keywords cover that I have NOT published.
 *  repurposeScan() my own past posts worth a sequel, an update, or a re-cut.
 *  competitorDiff() what changed on the watchlist since last week.
 *
 * All three are pure analysis over existing stores — no API cost, works
 * with zero keys.
 */

const words = (s) =>
  new Set(
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );

/**
 * Similarity that can't be fooled by one shared word: it needs BOTH a
 * decent ratio and at least 2 words in common. ("signal post" vs "post
 * office" is 0.5 by ratio alone — meaningless.)
 */
const overlap = (a, b) => {
  if (a.size < 2 || b.size < 2) return 0;
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  if (hit < 2) return 0;
  return hit / Math.min(a.size, b.size);
};

const outcome = (m) => (m.statsSnapshots || []).slice(-1)[0]?.views || 0;
const median = (arr) => (arr.length ? [...arr].sort((x, y) => x - y)[Math.floor(arr.length / 2)] : 0);

/* ---------------- 1. back-catalog gaps ---------------- */

/**
 * Cross-references what I've PUBLISHED against every demand signal the
 * system has collected (opportunity keywords, top clusters, idea bank).
 * A high-demand topic with no published coverage is the cleanest "make
 * this next" signal there is.
 */
export function catalogGaps({ limit = 15 } = {}) {
  loadEnv();
  const published = collection("myposts").find((m) => !m.seed).map((m) => words(m.title));
  const covered = (title) => published.some((p) => overlap(words(title), p) >= 0.5);

  const candidates = [
    ...collection("keywords").all().map((k) => ({ source: "keyword", title: k.keyword, demand: k.opportunity ?? 0, detail: k.demand?.detail })),
    ...collection("clusters").all().map((c) => ({ source: "cluster", title: c.label, demand: c.opportunityScore ?? 0, detail: `${c.status} · ${c.memberCount} member(s)` })),
    ...collection("ideabank").find((i) => i.status === "backlog").map((i) => ({ source: "ideabank", title: i.title, demand: i.score ?? 50, detail: `${i.pillar} · ${i.effort}` })),
  ];

  // de-dupe near-identical candidates, keep the strongest demand signal
  const unique = [];
  for (const c of candidates.sort((a, b) => b.demand - a.demand)) {
    if (!unique.some((u) => overlap(words(u.title), words(c.title)) >= 0.6)) unique.push(c);
  }

  // count coverage over the FULL set, then truncate for display — otherwise
  // `limit` silently inflates "already covered"
  const allGaps = unique.filter((c) => !covered(c.title));
  return {
    publishedCount: published.length,
    candidatesConsidered: unique.length,
    gaps: allGaps.slice(0, limit),
    gapCount: allGaps.length,
    coveredCount: unique.length - allGaps.length,
  };
}

/* ---------------- 2. repurpose scanner ---------------- */

/**
 * My own back catalog, mined for second bites:
 *   sequel   — beat my median by 1.5x+  -> make a follow-up, the demand is proven
 *   update   — 60+ days old and evergreen -> refresh and repost
 *   recut    — long-form that never got a Short cut from it
 */
export function repurposeScan() {
  loadEnv();
  const posts = collection("myposts").find((m) => !m.seed && m.title);
  if (posts.length < 3) return { posts: posts.length, suggestions: [], note: "need 3+ published posts" };

  const med = median(posts.map(outcome));
  const suggestions = [];

  for (const m of posts) {
    const views = outcome(m);
    const ageDays = m.postedAt ? Math.round((Date.now() - new Date(m.postedAt).getTime()) / 864e5) : null;
    const ratio = med > 0 ? Math.round((views / med) * 100) / 100 : null;

    if (ratio && ratio >= 1.5) {
      suggestions.push({ kind: "sequel", title: m.title, why: `${ratio}× your median (${views.toLocaleString()} views) — proven demand, make part 2`, priority: ratio });
    }
    if (ageDays !== null && ageDays >= 60 && m.kind !== "trend" && ratio && ratio >= 0.8) {
      suggestions.push({ kind: "update", why: `${ageDays}d old evergreen that held up (${ratio}×) — refresh and repost`, title: m.title, priority: ratio * 0.8 });
    }
    if ((m.lengthSec || 0) > 120) {
      suggestions.push({ kind: "recut", title: m.title, why: `${Math.round(m.lengthSec / 60)}min long-form — mine it for Shorts (factory longform <file>)`, priority: 1.2 });
    }
  }

  return {
    posts: posts.length,
    medianViews: med,
    suggestions: suggestions.sort((a, b) => b.priority - a.priority).slice(0, 12),
  };
}

/* ---------------- 3. competitor diff ---------------- */

/**
 * What moved on the watchlist in the last `days` vs the window before it.
 * Surfaces new outliers, format shifts (shorts vs long), and channels that
 * changed cadence — the "what are they doing differently" digest.
 */
export function competitorDiff({ days = 7 } = {}) {
  loadEnv();
  const now = Date.now();
  const cut = now - days * 864e5;
  const prevCut = now - days * 2 * 864e5;
  const channels = new Map(collection("watchchannels").all().map((c) => [c.id, c.title]));
  const vids = collection("watchvideos").all().filter((v) => v.publishedAt);

  const recent = vids.filter((v) => new Date(v.publishedAt).getTime() >= cut);
  const prior = vids.filter((v) => {
    const t = new Date(v.publishedAt).getTime();
    return t >= prevCut && t < cut;
  });

  if (!vids.length) return { watching: channels.size, note: "no watchlist videos yet — add channels on the YouTube page (needs YOUTUBE_API_KEY)", newOutliers: [] };

  const shortShare = (set) => (set.length ? Math.round((set.filter((v) => v.isShort).length / set.length) * 100) : null);
  const perChannel = [...channels.entries()].map(([id, title]) => {
    const r = recent.filter((v) => v.channelId === id).length;
    const p = prior.filter((v) => v.channelId === id).length;
    return { channel: title, recent: r, prior: p, delta: r - p };
  });

  return {
    watching: channels.size,
    windowDays: days,
    newOutliers: recent
      .filter((v) => v.outlierRatio >= 3)
      .sort((a, b) => b.outlierRatio - a.outlierRatio)
      .slice(0, 10)
      .map((v) => ({ ratio: v.outlierRatio, title: v.title, channel: channels.get(v.channelId) || "?", isShort: v.isShort })),
    formatShift: { recentShortsPct: shortShare(recent), priorShortsPct: shortShare(prior) },
    cadence: perChannel.filter((c) => c.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8),
  };
}
