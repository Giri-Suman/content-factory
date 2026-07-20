import { loadEnv, loadUserConfig, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection, newId } from "../../shared/src/store.js";
import { chat, providerStatus } from "../../llm/src/llm.js";
import { hasKey, yt, videosByIds, DEFAULT_KEYWORDS } from "./youtube.js";
import { getAllTrends } from "./db.js";

/**
 * P13 Keyword Gap Finder — honest edition.
 * Demand is a PROXY (autocomplete presence + mentions in collected
 * reddit/hn/rss items); there is no search-volume API and we never
 * pretend otherwise. No revenue/RPM numbers anywhere, ever.
 * Supply = saturationDetailed(): recent video count, median views,
 * top-result recency, and small-channel share (small channels ranking
 * = soft competition). Daily module budget ≤ 2,200 units, enforced
 * against the quota ledger's job tag before every scoring call.
 */

const MODULE_BUDGET = 2200;
const SCORE_PER_DAY = 20;
const JOB = "yt-kwgap";

/* ---------------- 1. suggestion mining ---------------- */

/** Public autocomplete — fragile-by-design: any failure returns []. */
export async function autocomplete(keyword) {
  try {
    const res = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(keyword)}`,
      { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return [];
    const data = JSON.parse(await res.text());
    return Array.isArray(data?.[1]) ? data[1].filter((s) => typeof s === "string") : [];
  } catch {
    return []; // endpoint blocked/reshaped — skip, never crash
  }
}

async function llmExpand(seeds) {
  if (!providerStatus().active) return [];
  try {
    const res = await chat({
      task: "score",
      maxTokens: 1200,
      system:
        `You expand seed keywords into search phrases people actually type, for: ${NICHE_CONTEXT}. ` +
        'Give questions, comparisons ("X vs Y"), and "how to X" variants. Reply ONLY JSON: {"keywords":["...",...]} (max 25).',
      user: seeds.join(", "),
    });
    const parsed = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
    return (parsed.keywords || []).filter((k) => typeof k === "string").slice(0, 25);
  } catch {
    return [];
  }
}

const TEMPLATE_VARIANTS = (kw) => [`how to ${kw}`, `${kw} tutorial`, `${kw} vs`, `best ${kw} tools`, `${kw} for beginners`];

export async function mineKeywords(seeds) {
  const found = new Map(); // keyword -> {sources:Set, autocompleteHits}
  const add = (kw, source) => {
    const key = kw.toLowerCase().trim();
    if (!key || key.length < 4) return;
    if (!found.has(key)) found.set(key, { sources: new Set(), autocompleteHits: 0 });
    found.get(key).sources.add(source);
    if (source === "autocomplete") found.get(key).autocompleteHits++;
  };

  for (const seed of seeds) {
    add(seed, "seed");
    const sugs = await autocomplete(seed);
    for (const s of sugs) add(s, "autocomplete");
    // template variants get their own autocomplete round-trip (still free)
    for (const v of TEMPLATE_VARIANTS(seed).slice(0, 2)) {
      for (const s of await autocomplete(v)) add(s, "autocomplete");
    }
  }
  for (const k of await llmExpand(seeds)) add(k, "llm");
  return found;
}

/* ---------------- 2. demand & supply ---------------- */

/** Demand proxy from signals we actually have. 0-10 + human-readable detail. */
export function demandProxy(keyword, meta) {
  const items = Object.values(getAllTrends());
  const toks = keyword.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
  const mentions = toks.length
    ? items.filter((t) => {
        const title = t.title.toLowerCase();
        return toks.every((tok) => title.includes(tok)) || (toks.length > 1 && toks.filter((tok) => title.includes(tok)).length >= toks.length - 1);
      })
    : [];
  const mentionVel = Math.max(0, ...mentions.map((m) => m.velocity || 0));
  const autoScore = Math.min(4, (meta?.autocompleteHits || 0) * 1.2 + (meta?.sources?.has("autocomplete") ? 1.5 : 0));
  // log-ish scaling so 15 mentions genuinely outranks 4 without a hard ceiling
  const mentionScore = Math.min(6, Math.sqrt(mentions.length) * 2 + (mentionVel > 5 ? 1 : 0));
  return {
    score: Math.round(Math.min(10, autoScore + mentionScore) * 10) / 10,
    autocompleteHits: meta?.autocompleteHits || 0,
    mentions: mentions.length,
    mentionVelocity: mentionVel || null,
    detail: `autocomplete ${meta?.autocompleteHits || 0} hit(s) · ${mentions.length} collected item(s)${mentionVel ? ` (max +${mentionVel}/h)` : ""} — proxy signals, not search volume`,
  };
}

function unitsTodayFor(job) {
  const today = new Date().toISOString().slice(0, 10);
  return collection("quota").find((r) => r.date === today && r.job === job).reduce((a, r) => a + r.units, 0);
}

/** Supply with competition texture — ~102 units per keyword, budget-gated. */
export async function supplyFor(keyword) {
  if (!hasKey()) {
    return { score: 5, detail: "no YouTube key — supply unknown (neutral 5/10)", unknown: true };
  }
  if (unitsTodayFor(JOB) + 102 > MODULE_BUDGET) {
    return { score: 5, detail: `daily keyword budget (${MODULE_BUDGET}u) reached — scored tomorrow`, unknown: true };
  }
  const publishedAfter = new Date(Date.now() - 48 * 36e5).toISOString();
  const data = await yt("search", { part: "snippet", q: keyword, type: "video", publishedAfter, maxResults: "25", order: "relevance" }, JOB);
  const items = data.items || [];
  const ids = items.map((i) => i.id?.videoId).filter(Boolean);
  const videos = ids.length ? await videosByIds(ids, JOB) : [];
  const views = videos.map((v) => parseInt(v.statistics?.viewCount || "0", 10)).sort((a, b) => a - b);
  const medianViews = views.length ? views[Math.floor(views.length / 2)] : 0;

  const channelIds = [...new Set(items.map((i) => i.snippet?.channelId).filter(Boolean))];
  let smallShare = null;
  if (channelIds.length) {
    const ch = await yt("channels", { part: "statistics", id: channelIds.slice(0, 50).join(",") }, JOB);
    const sizes = (ch.items || []).map((c) => parseInt(c.statistics?.subscriberCount || "0", 10));
    smallShare = sizes.length ? Math.round((sizes.filter((s) => s < 100_000).length / sizes.length) * 100) : null;
  }
  const ages = items.map((i) => (Date.now() - new Date(i.snippet?.publishedAt || 0).getTime()) / 36e5);
  const avgAgeH = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null;

  const videoCount = data.pageInfo?.totalResults ?? ids.length;
  // supply pressure 0-10: many recent videos + strong views = high; soft competition discounts it
  let score = videoCount > 200 ? 9 : videoCount > 80 ? 7 : videoCount > 30 ? 5 : videoCount > 10 ? 3 : 1;
  if (medianViews > 100_000) score = Math.min(10, score + 2);
  if (smallShare !== null && smallShare >= 60) score = Math.max(0, score - 2); // small channels ranking = beatable
  return {
    score,
    videoCount,
    medianViews,
    smallChannelShare: smallShare,
    avgResultAgeH: avgAgeH,
    detail: `${videoCount} videos/48h · median ${medianViews} views · ${smallShare ?? "?"}% small channels${smallShare >= 60 ? " (soft competition)" : ""}`,
  };
}

/* ---------------- 3. the daily pass ---------------- */

async function relevanceRank(keywords) {
  if (providerStatus().active) {
    try {
      const listing = keywords.map((k, i) => `${i} | ${k}`).join("\n");
      const res = await chat({
        task: "score",
        maxTokens: 1500,
        system: `Rate search phrases 0-10 for content relevance to: ${NICHE_CONTEXT}. Reply ONLY JSON: {"ratings":[{"i":0,"r":8},...]}`,
        user: listing,
      });
      const parsed = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
      const map = new Map((parsed.ratings || []).map((x) => [x.i, x.r]));
      if (map.size) return keywords.map((_, i) => map.get(i) ?? 5);
    } catch {
      /* heuristic */
    }
  }
  const NICHE = /\b(ai|automation|code|coding|python|javascript|react|agent|llm|claude|gpt|n8n|api|dev)\b/i;
  return keywords.map((k) => (NICHE.test(k) ? 7 : 3));
}

export async function keywordGapPass(seeds) {
  loadEnv();
  const seedList = seeds?.length ? seeds : loadUserConfig().youtubeKeywords || DEFAULT_KEYWORDS;
  console.log(`mining ${seedList.length} seeds (autocomplete is free; supply scoring ≤${MODULE_BUDGET}u/day)...`);

  const mined = await mineKeywords(seedList);
  const candidates = [...mined.keys()];
  const relevance = await relevanceRank(candidates);
  const ranked = candidates
    .map((k, i) => ({ keyword: k, meta: mined.get(k), relevance: relevance[i] }))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, SCORE_PER_DAY);

  const store = collection("keywords");
  const results = [];
  for (const c of ranked) {
    const demand = demandProxy(c.keyword, c.meta);
    const supply = await supplyFor(c.keyword);
    const opportunity = Math.round((demand.score * 1.4 - supply.score + 10) * 10) / 10; // 0-ish..24 scale, higher = better gap
    results.push(
      store.upsert(
        {
          id: newId(),
          keyword: c.keyword,
          sources: [...(c.meta?.sources || [])],
          relevance: c.relevance,
          demand,
          supply,
          opportunity,
          scoredAt: new Date().toISOString(),
        },
        (r) => r.keyword
      )
    );
  }
  const unitsUsed = unitsTodayFor(JOB);
  console.log(`scored ${results.length} keywords · ${unitsUsed} units used today by ${JOB} (≤${MODULE_BUDGET})`);
  return { mined: candidates.length, scored: results.length, unitsUsed };
}

export function topOpportunities(limit = 25) {
  return collection("keywords").all().sort((a, b) => b.opportunity - a.opportunity).slice(0, limit);
}
