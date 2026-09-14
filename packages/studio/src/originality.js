import { collection } from "../../shared/src/store.js";
import { PACKS } from "./nichePacks.js";

/**
 * ORIGINALITY GUARD — "have I already made this?"
 *
 * The previous check compared lowercased titles for EXACT equality against the
 * idea bank only. That misses the two cases that actually happen:
 *   - "5 Python tricks" vs "Five Python Tricks You Should Know" — same video,
 *     different string, zero characters in common at the ends
 *   - anything already PUBLISHED, which the idea bank does not contain
 *
 * Republishing your own topic is worse than wasting the production time: it
 * splits the search result and teaches the algorithm your channel repeats
 * itself.
 *
 * Deliberately lexical, not embedding-based — embeddings would need a model,
 * and content titles in these niches are keyword-dense enough that token
 * overlap works. It is also inspectable, which matters when it blocks a brief.
 */

const STOP = new Set([
  "the", "a", "an", "of", "for", "and", "or", "to", "in", "on", "at", "is", "are", "was", "with",
  "from", "by", "as", "it", "its", "this", "that", "new", "how", "why", "what", "when", "your",
  "you", "i", "we", "my", "best", "top", "vs", "versus", "using", "use", "make", "made", "get",
  "should", "know", "need", "guide", "tutorial", "tips", "easy", "quick", "simple", "ultimate",
]);

// number words collapse so "5 tricks" and "five tricks" are the same idea
const NUMS = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };

export function tokens(text) {
  return [
    ...new Set(
      String(text || "")
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .map((w) => NUMS[w] || w)
        .filter((w) => w.length > 1 && !STOP.has(w))
    ),
  ];
}

/** Jaccard overlap, 0..1. */
export function similarity(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size < 2 || B.size < 2) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit++;
  return hit / new Set([...A, ...B]).size;
}

/**
 * Everything this channel has already committed to: published posts, briefs
 * already written, and the idea bank. Published carries the most weight —
 * a duplicate of a live video is the expensive mistake.
 */
function corpus() {
  const rows = [];
  for (const p of collection("myposts").find((m) => !m.seed)) {
    if (p.title) rows.push({ text: p.title, kind: "published", id: p.id, weight: 1 });
  }
  for (const b of collection("briefs").all()) {
    if (b.status === "killed") continue;
    const t = b.payload?.yt_short?.title || b.topic;
    if (t) rows.push({ text: t, kind: b.status === "approved" ? "approved brief" : "brief", id: b.id, weight: 0.9 });
  }
  for (const i of collection("ideabank").all()) {
    if (i.title) rows.push({ text: i.title, kind: "idea", id: i.id, weight: 0.6 });
  }
  return rows;
}

/**
 * @returns {{ original: boolean, score: number, matches: Array }}
 * score 0..1 where 1 = certainly a repeat.
 */
export function checkOriginality(title, { threshold = 0.45 } = {}) {
  const matches = corpus()
    .map((c) => ({ ...c, sim: similarity(title, c.text) }))
    .filter((c) => c.sim >= 0.28)
    .sort((a, b) => b.sim * b.weight - a.sim * a.weight)
    .slice(0, 4);

  const top = matches[0];
  const score = top ? Math.round(top.sim * top.weight * 100) / 100 : 0;
  return {
    original: score < threshold,
    score,
    matches,
    reading: !top
      ? "no similar title in your catalog"
      : score >= threshold
        ? `too close to an existing ${top.kind}: "${String(top.text).slice(0, 60)}" (${Math.round(top.sim * 100)}% overlap)`
        : `nearest is a ${top.kind} at ${Math.round(top.sim * 100)}% — distinct enough`,
  };
}

/* ------------------------------------------------------------------ */
/* niche fit across ALL configured categories                          */
/* ------------------------------------------------------------------ */

/**
 * The old check was a single coding/AI regex, so every makeup, nails and math
 * idea was docked for "weak niche fit" — the judge actively penalised three of
 * the four categories this channel covers. Signals now come from the niche
 * packs, so adding a niche never needs a judge edit.
 */
const EXTRA_SIGNALS = {
  coding: /\b(code|coding|python|javascript|typescript|react|rust|go|api|cli|framework|debug|refactor|git|deploy|database|sql)\b/i,
  "ai-automation": /\b(ai|llm|gpt|claude|agent|automation|workflow|prompt|model|rag|embedding|n8n|zapier)\b/i,
  // `proof` must not match "sweat-proof" / "water-proof" — that false positive
  // classified a foundation review as a math video
  math: /\b(math|maths|theorem|paradox|infinity|calculus|algebra|geometry|probability|equation|fractal|factorial|fibonacci|derivative|integral|logarithm|prime number|number theory)\b|(?<![-\w])proofs?\b|\d\s*!(?:\s|$|=)|\bpi\b/i,
  makeup: /\b(makeup|make-up|beauty|skin|skincare|foundation|concealer|lipstick|lip|eyeliner|eyeshadow|mascara|brow|blush|glam|contour|highlighter|bronzer|primer|serum|spf|sunscreen|moisturi[sz]er|cleanser|toner|routine|dupe|swatch|kajal|bindi|mehndi|henna)\b/i,
  nails: /\b(nail|nails|manicure|pedicure|gel|acrylic|cuticle|polish|french tip|nail art|chrome)\b/i,
  cooking: /\b(recipe|cook|cooking|bake|baking|kitchen|ingredient|meal|dish)\b/i,
  fitness: /\b(workout|fitness|exercise|gym|reps|mobility|stretch|cardio|form)\b/i,
};

/** @returns {{ niche: string|null, hit: boolean, matched: string[] }} */
export function nicheFit(text) {
  const t = String(text || "");
  const matched = [];
  for (const [niche, re] of Object.entries(EXTRA_SIGNALS)) {
    if (!PACKS[niche] && niche !== "ai-automation") continue; // stay aligned with real packs
    if (re.test(t)) matched.push(niche);
  }
  return { niche: matched[0] || null, hit: matched.length > 0, matched };
}
