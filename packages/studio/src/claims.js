import { collection } from "../../shared/src/store.js";
import { getByIds } from "../../radar/src/db.js";
import { quotesForCluster } from "../../radar/src/quotes.js";

/**
 * CLAIMS MAP — every factual assertion, and what backs it.
 *
 * Adapted from the "AI Content Factory" idea of shipping a claims map where
 * each assertion links to a receipt (learnwithhasan.com/guide/ai-content-factory).
 * Their version backs a written technical guide with experiment logs; this one
 * backs a video script, where the receipts are different but the problem is
 * identical.
 *
 * It exists because instructions do not work. This repo already tells every
 * generation prompt "never invent a fact, name, number or citation" — and a
 * real brief still produced "This $8 primer is the only reason my makeup
 * survived", inventing a price for a product the creator never named. A
 * prompt cannot enforce factuality; a checklist you have to clear can.
 *
 * Three receipt kinds, in descending strength:
 *   source   a URL already in the store (a trend item or an attributed quote)
 *   own      YOUR first-hand evidence — a timestamped photo, a benchmark, a
 *            screen recording. You supply it; nothing here invents one.
 *   none     unbacked. Not automatically wrong — it may be your own lived
 *            experience — but you should see it before it goes out.
 *
 * Nothing here blocks a render. It blocks nothing at all: it produces a list
 * you clear. The compliance gate reads it so an unbacked NUMBER cannot reach
 * publish silently.
 */

/* ------------------------------------------------------------------ */
/* claim extraction                                                    */
/* ------------------------------------------------------------------ */

/**
 * Patterns that mark a sentence as an assertion of fact rather than opinion or
 * instruction. Deliberately narrow: "dab it on with a damp sponge" is a method
 * and needs no receipt, while "lasts 8 hours" is a testable claim.
 */
const CLAIM_PATTERNS = [
  { kind: "price", re: /[$₹£€]\s?\d[\d,.]*|\b\d+\s?(?:rupees|dollars|usd|inr)\b/i, why: "a price you did not source" },
  // word-numbers count: "four hours" is exactly as much a claim as "4 hours",
  // and spoken scripts spell them out far more often than they use digits
  { kind: "duration", re: /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|thirty|sixty)\s?(?:hours?|hrs?|minutes?|mins?|days?|weeks?)\b/i, why: "a duration claim — testable, so it needs a test" },
  { kind: "percentage", re: /\b\d{1,3}(?:\.\d+)?\s?%/, why: "a percentage" },
  { kind: "multiplier", re: /\b\d+(?:\.\d+)?\s?(?:x|times)\s+(?:faster|slower|cheaper|better|more|less)\b/i, why: "a comparative measurement" },
  { kind: "benchmark", re: /\b\d+\s?(?:ms|s|sec|seconds?|mb|gb|kb|fps|req\/s|tokens?)\b/i, why: "a benchmark number" },
  { kind: "superlative", re: /\b(?:the (?:only|best|fastest|cheapest|worst)|never|always|every|no one|nobody)\b/i, why: "an absolute claim" },
  { kind: "attribution", re: /\b(?:studies show|research (?:shows|suggests)|experts? (?:say|agree)|according to)\b/i, why: "an appeal to an unnamed authority" },
  { kind: "causal", re: /\b(?:because of|thanks to|the reason (?:why )?|causes?|proves?)\b/i, why: "a causal claim" },
];

const sentences = (text) =>
  String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);

/** Pull every assertion out of a block of text. */
export function extractClaims(text, { where = "" } = {}) {
  const out = [];
  for (const s of sentences(text)) {
    for (const p of CLAIM_PATTERNS) {
      const m = s.match(p.re);
      if (!m) continue;
      out.push({ text: s, kind: p.kind, trigger: m[0], why: p.why, where });
      break; // one claim per sentence — the strongest pattern wins
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* evidence linking                                                    */
/* ------------------------------------------------------------------ */

const STOP = new Set(["the", "a", "an", "of", "for", "and", "to", "in", "on", "is", "are", "it", "this", "that", "with", "your", "my"]);
const toks = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));

/**
 * Try to back a claim with something ALREADY in the store — a source URL from
 * the trend that produced this brief, or an attributed community quote.
 *
 * This is the part that makes a claims map cheap here rather than a chore: the
 * radar already collected the receipts, they were just never linked to the
 * sentences they support.
 */
function findSource(claim, { members = [], quotes = [] }) {
  const ct = new Set(toks(claim.text));
  if (ct.size < 2) return null;

  const score = (text) => {
    const t = toks(text);
    if (!t.length) return 0;
    let hit = 0;
    for (const w of t) if (ct.has(w)) hit++;
    return hit / Math.max(ct.size, t.length);
  };

  const cands = [
    ...quotes.map((q) => ({ kind: "quote", label: `${q.author}: "${String(q.text).slice(0, 80)}"`, url: q.url, s: score(q.text) })),
    ...members.map((m) => ({ kind: "source", label: String(m.title).slice(0, 80), url: m.url, s: score(m.title) })),
  ].sort((a, b) => b.s - a.s);

  const top = cands[0];
  return top && top.s >= 0.25 ? { ...top, confidence: Math.round(top.s * 100) / 100 } : null;
}

/* ------------------------------------------------------------------ */
/* the map                                                             */
/* ------------------------------------------------------------------ */

/** Manually attach your own receipt to a claim (a photo, a benchmark, a link). */
export function addReceipt(briefId, claimText, receipt) {
  if (!receipt || !String(receipt).trim()) throw new Error("a receipt needs a value — a file path, a URL, or a note about what you measured");
  const store = collection("claimreceipts");
  return store.upsert(
    { id: `${briefId}::${String(claimText).slice(0, 60)}`, briefId, claimText: String(claimText), receipt: String(receipt), kind: "own", at: new Date().toISOString() },
    (r) => r.id
  );
}

const receiptsFor = (briefId) => collection("claimreceipts").find((r) => r.briefId === briefId);

/**
 * Build the map for one brief: every claim in the hooks, beats, caption and
 * (if compiled) the scene voiceover, with whatever backs it.
 */
export function claimsMap(briefId) {
  const brief = collection("briefs").get(briefId);
  if (!brief) throw new Error(`no brief ${briefId}`);
  const p = brief.payload || {};

  const blocks = [
    // EVERY hook variant, not just the first — you pick one at edit time, and
    // the invented "$8 primer" that motivated this module was in variant 3
    ...(p.yt_short?.hook_variants || []).map((h, i) => [h, `hook ${i + 1}`]),
    [(p.yt_short?.beats || []).join(" "), "beats"],
    [p.core_idea, "core idea"],
    [p.ig_reel?.caption, "caption"],
    [p.yt_short?.description, "description"],
  ];
  const claims = blocks.flatMap(([t, where]) => (t ? extractClaims(t, { where }) : []));

  // Evidence already in the store, from the cluster this brief came from.
  // This is what makes a claims map cheap here instead of a chore: the radar
  // already collected these receipts, they were just never linked to the
  // sentences they support.
  let members = [];
  let quotes = [];
  try {
    const clusterId = brief.source?.topicClusterId;
    if (clusterId) {
      const cluster = collection("clusters").get(clusterId);
      if (cluster) {
        members = getByIds(cluster.memberIds || []);
        quotes = quotesForCluster(cluster, { limit: 8 });
      }
    }
  } catch {
    /* evidence linking is a bonus; the map still works without it */
  }

  const manual = receiptsFor(briefId);
  const rows = claims.map((c) => {
    const own = manual.find((m) => m.claimText === c.text || c.text.includes(m.claimText.slice(0, 40)));
    if (own) return { ...c, backing: { kind: "own", label: own.receipt } };
    const src = findSource(c, { members, quotes });
    return { ...c, backing: src || null };
  });

  const unbacked = rows.filter((r) => !r.backing);
  const numeric = unbacked.filter((r) => ["price", "duration", "percentage", "multiplier", "benchmark"].includes(r.kind));
  return {
    briefId,
    topic: brief.topic,
    total: rows.length,
    backed: rows.length - unbacked.length,
    unbacked: unbacked.length,
    unbackedNumeric: numeric.length,
    rows,
    verdict: numeric.length
      ? `${numeric.length} unbacked NUMBER(S) — these are the ones that get you called out; attach a receipt or cut them`
      : unbacked.length
        ? `${unbacked.length} unbacked claim(s), none numeric — usually fine if they are your own experience`
        : rows.length
          ? "every claim has a receipt"
          : "no factual claims found — nothing to back",
  };
}

