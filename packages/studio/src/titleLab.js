import { loadEnv, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection, newId } from "../../shared/src/store.js";
import { chat, providerStatus } from "../../llm/src/llm.js";
import { HOOK_PATTERNS } from "./wishlist.js";

/**
 * P11 Title & Hook Lab. Three parts:
 *  - extractPatterns(): nightly — outlier titles (>=2x) -> reusable
 *    TitlePatterns via ONE LLM batch, near-duplicates merged
 *  - scoreTitle(): sub-scores 0-10 (specificity / curiosity gap /
 *    identity call) + closest patterns + a rewrite per weak dimension.
 *    LLM-rated when a key exists; CODED heuristics otherwise — the lab
 *    is useful keyless and honest about which mode produced a score.
 *  - scoreHook(): 9-pattern classification + banned-opener auto-fail.
 */

const BANNED = /\b(wait for it|you won'?t believe|gone wrong|mind[- ]?blown|blow your mind|watch till the end|number \d+ will|shocking|insane trick)\b/i;
const TOOLS = /\b(ai|llm|claude|chatgpt|gpt|gemini|python|javascript|typescript|react|next\.?js|node|n8n|zapier|cursor|copilot|docker|linux|excel|api|mcp|ollama)\b/i;
const OUTCOME = /\b(\d+ ?(seconds?|minutes?|hours?|days?|lines?|files?|x)|[₹$€]\d|%|faster|cheaper|free|automat)\b/i;

/* ---------------- heuristic sub-scores (keyless mode) ---------------- */

export function heuristicSubScores(text) {
  const t = text.trim();
  let specificity = 3;
  if (/\d/.test(t)) specificity += 2;
  if (TOOLS.test(t)) specificity += 2;
  if (OUTCOME.test(t)) specificity += 2;
  if (t.length >= 28 && t.length <= 65) specificity += 1;

  let curiosityGap = 2;
  if (/\?|^(why|how|what|which)\b/i.test(t)) curiosityGap += 3;
  if (/\b(but|without|until|instead|nobody|wrong|myth|actually|hidden|quietly)\b/i.test(t)) curiosityGap += 2;
  if (/\b(here'?s (what|why|how)|the result|then this|so you don'?t have to)\b/i.test(t)) curiosityGap += 2;
  if (/\.\.\.|—/.test(t)) curiosityGap += 1;

  let identityCall = 2;
  if (/\b(you|your)\b/i.test(t)) identityCall += 3;
  if (/\b(developer|dev|coder|freelancer|beginner|engineer|creator)s?\b/i.test(t)) identityCall += 3;
  if (/^(stop|start|never|always|try|don'?t)\b/i.test(t)) identityCall += 2;

  const clamp = (n) => Math.max(0, Math.min(10, n));
  return { specificity: clamp(specificity), curiosityGap: clamp(curiosityGap), identityCall: clamp(identityCall) };
}

const HEURISTIC_REWRITES = {
  specificity: (t) => `Add a number or named tool: e.g. "${t.slice(0, 40)}" -> name the exact tool, count, time saved, or ₹/$ figure`,
  curiosityGap: (t) => `Open a loop: state the surprising outcome but hold back the how — "…and the fix was 4 lines" / "…here's what nobody mentions"`,
  identityCall: (t) => `Call the viewer out: start with "If you're a developer…" / use "you/your" so the right person stops scrolling`,
};

/* ---------------- title scorer ---------------- */

function similarity(a, b) {
  const tok = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter((w) => w.length > 2));
  const A = tok(a);
  const B = tok(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}

export function closestPatterns(title, limit = 3) {
  return collection("titlepatterns")
    .all()
    .map((p) => ({
      template: p.template,
      avgOutlierRatio: p.avgOutlierRatio,
      sampleSize: p.sampleSize,
      sim: Math.max(similarity(title, p.template), ...(p.exampleTitles || []).map((e) => similarity(title, e))),
    }))
    .filter((p) => p.sim > 0.15)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, limit);
}

export async function scoreTitle(title) {
  loadEnv();
  const banned = BANNED.test(title);
  let subScores, rewrites, mode;

  if (providerStatus().active) {
    try {
      const res = await chat({
        task: "score",
        maxTokens: 800,
        system:
          `You score YouTube Short titles for this creator: ${NICHE_CONTEXT}. Reply ONLY JSON: ` +
          '{"specificity":0-10,"curiosityGap":0-10,"identityCall":0-10,"rewrites":{"specificity":"<better title, only if weak>","curiosityGap":"...","identityCall":"..."}}',
        user: title,
      });
      const p = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
      subScores = { specificity: p.specificity, curiosityGap: p.curiosityGap, identityCall: p.identityCall };
      rewrites = p.rewrites || {};
      mode = "llm";
    } catch {
      /* fall through */
    }
  }
  if (!subScores) {
    subScores = heuristicSubScores(title);
    rewrites = {};
    mode = "heuristic";
  }
  if (banned) for (const k of Object.keys(subScores)) subScores[k] = Math.min(subScores[k], 2);
  for (const [k, v] of Object.entries(subScores)) {
    if (v < 6 && !rewrites[k]) rewrites[k] = HEURISTIC_REWRITES[k](title);
  }
  const overall = Math.round(((subScores.specificity + subScores.curiosityGap + subScores.identityCall) / 3) * 10) / 10;
  return { title, overall, subScores, rewrites, banned, mode, matches: closestPatterns(title) };
}

/* ---------------- hook analyzer ---------------- */

export function classifyHookHeuristic(hook) {
  const h = hook.toLowerCase();
  if (/\?$/.test(hook.trim()) || /^(why|how|what|did you|have you)\b/.test(h)) return "Direct Question";
  if (/^\d+ |^(these|the) \d+|top \d+/.test(h) || /\b\d+ (tools?|ways?|things?|scripts?)\b/.test(h)) return "List Tease";
  if (/^(stop|never|don'?t|you'?re (doing|using).*wrong)/.test(h) || /\b(mistake|ruin|leak|danger)\b/.test(h)) return "Mistake Warning";
  if (/^(i |my |we )/.test(h)) return /\b(failed|wasted|lost|wrong|confess|burn)\b/.test(h) ? "Confession" : "Results First";
  if (/^(pov|when you|that feeling)/.test(h)) return "POV/Relatable";
  if (/\b(everyone|nobody|actually|myth|isn'?t|overrated)\b/.test(h)) return "Contrarian Strike";
  if (/\b(you|your)\b/.test(h)) return "Identity Call";
  return "Open Loop";
}

export async function scoreHook(hook) {
  loadEnv();
  const banned = BANNED.test(hook);
  let pattern, score, rewrite, mode;
  if (providerStatus().active) {
    try {
      const res = await chat({
        task: "score",
        maxTokens: 500,
        system:
          `You score 2-second video hooks for: ${NICHE_CONTEXT}. Classify against EXACTLY one of: ${HOOK_PATTERNS.join(", ")}. ` +
          'Reply ONLY JSON: {"pattern":"...","score":0-10,"rewrite":"<stronger hook, only if score<7>"}',
        user: hook,
      });
      const p = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
      ({ pattern, score, rewrite } = p);
      mode = "llm";
    } catch {
      /* fall through */
    }
  }
  if (pattern === undefined) {
    pattern = classifyHookHeuristic(hook);
    const s = heuristicSubScores(hook);
    score = Math.round((s.specificity + s.curiosityGap + s.identityCall) / 3);
    mode = "heuristic";
  }
  if (banned) {
    score = 1;
    rewrite = rewrite || `Generic opener — lead with the concrete payoff instead: what changes for the viewer in the first 2 seconds?`;
  }
  if (score < 7 && !rewrite) rewrite = HEURISTIC_REWRITES.curiosityGap(hook);
  return { hook, pattern, score, rewrite: score < 7 ? rewrite : null, banned, mode };
}

/* ---------------- pattern extraction (nightly) ---------------- */

export async function extractPatterns() {
  loadEnv();
  const fromWatch = collection("watchvideos").find((v) => v.outlierRatio >= 2).map((v) => ({ title: v.title, ratio: v.outlierRatio }));
  const fromWishlist = collection("wishlist")
    .find((w) => (w.metrics?.outlierRatio ?? 0) >= 2)
    .map((w) => ({ title: w.title, ratio: w.metrics.outlierRatio }));
  const samples = [...fromWatch, ...fromWishlist].filter((s) => s.title && s.title.length > 8);

  if (samples.length < 3) return { skipped: `only ${samples.length} outlier titles (need 3+ — add watchlist channels)` };
  if (!providerStatus().active) return { skipped: "no LLM key — pattern extraction idle" };

  const listing = samples.map((s) => `${s.ratio}x | ${s.title}`).join("\n");
  let parsed;
  try {
    const res = await chat({
      task: "score",
      maxTokens: 3000,
      system:
        "You extract REUSABLE title templates from outlier YouTube titles (given as 'ratio | title'). " +
        'Generalize with {placeholders}, e.g. "I {did extreme thing} so you don\'t have to". Reply ONLY JSON: ' +
        '{"patterns":[{"template":"...","exampleTitles":["..."],"avgOutlierRatio":<mean ratio of its examples>}]}',
      user: listing,
    });
    parsed = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
  } catch {
    return { skipped: "LLM extraction failed (after retry policy)" };
  }

  const store = collection("titlepatterns");
  let added = 0;
  let merged = 0;
  for (const p of parsed.patterns || []) {
    if (!p.template || !Array.isArray(p.exampleTitles)) continue;
    const near = store.all().find((e) => similarity(e.template, p.template) > 0.6);
    if (near) {
      const examples = [...new Set([...near.exampleTitles, ...p.exampleTitles])];
      store.update(near.id, {
        exampleTitles: examples,
        sampleSize: examples.length,
        avgOutlierRatio: Math.round(((near.avgOutlierRatio + (p.avgOutlierRatio || near.avgOutlierRatio)) / 2) * 10) / 10,
        updatedAt: new Date().toISOString(),
      });
      merged++;
    } else {
      store.upsert({
        id: newId(),
        template: p.template,
        exampleTitles: p.exampleTitles,
        sampleSize: p.exampleTitles.length,
        avgOutlierRatio: Math.round((p.avgOutlierRatio || 2) * 10) / 10,
        updatedAt: new Date().toISOString(),
      });
      added++;
    }
  }
  return { added, merged, samples: samples.length };
}
