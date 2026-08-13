/**
 * EVIDENCE — does a cluster actually deserve to be recommended?
 *
 * Adapted from the `last30days` skill by mvanhorn (MIT):
 *   https://github.com/mvanhorn/last30days-skill
 *
 * Two of its ideas fix defects this radar demonstrably has. Neither is a
 * ranking tweak — both are refusals, which is why they matter.
 *
 * 1. THE CONFIDENCE FLOOR IS ABSOLUTE, NOT RELATIVE.
 *    The radar ranks 120 clusters and presents a confident top-3. But every
 *    one of those 120 is a singleton, and their scores decompose to
 *    `0 velocity + 5 crossSource floor + 16 heuristic nicheFit + 7 default
 *    saturation = 28` — pure defaults. Relative ranking always produces a
 *    winner, even when nothing in the pool has earned it. An absolute floor
 *    lets the answer be "nothing qualified today", which is frequently the
 *    honest answer and one this system could never previously give.
 *
 * 2. ENTITY GROUNDING WITH DECISIVE DEMOTION.
 *    Engagement must not be able to rescue off-entity content. This repo has
 *    already been bitten by the inverse: `overlap()` matched clusters on a
 *    single shared word. Grounding on the head token with a demotion that
 *    engagement cannot outweigh is the principled version of that fix.
 *
 * Deliberately NOT adapted: the source sweep itself. This project already
 * has collectors, clustering and cross-source scoring. Porting last30days'
 * engine would be rebuilding the radar next to the radar.
 */

const STOP = new Set([
  "the", "a", "an", "of", "for", "and", "or", "to", "in", "on", "at", "is", "are",
  "was", "were", "with", "from", "by", "as", "it", "its", "this", "that", "new",
  "how", "why", "what", "when", "your", "you", "i", "we", "my", "best", "top",
  "vs", "versus", "using", "use", "make", "made", "get", "got",
]);

/** Content tokens, order preserved. The FIRST one is the head token. */
export function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s.+#-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export const headToken = (text) => tokens(text)[0] || null;

/**
 * Is this item actually about the cluster's topic?
 *
 * Grounds on the HEAD token rather than the full phrase: requiring the whole
 * label to appear demotes legitimate coverage that phrases the story
 * differently, which is a worse failure than letting a near-miss through.
 *
 * Returns a multiplier. `grounded: false` carries a decisive penalty — the
 * point is that a 5,000-upvote post about something else still loses to a
 * 40-upvote post that is genuinely on topic.
 */
export function entityGrounding(label, item) {
  const head = headToken(label);
  if (!head) return { grounded: true, multiplier: 1, detail: "no head token to ground on" };

  const hay = `${item.title || ""} ${item.excerpt || ""}`.toLowerCase();
  if (hay.includes(head)) return { grounded: true, multiplier: 1, detail: `head "${head}" present` };

  // second chance: any two other content tokens co-occurring is real coverage
  const rest = tokens(label).slice(1);
  const hits = rest.filter((t) => hay.includes(t));
  if (hits.length >= 2) return { grounded: true, multiplier: 0.9, detail: `head missing, but ${hits.slice(0, 2).join("+")} present` };

  return {
    grounded: false,
    multiplier: 0.25, // decisive: engagement cannot rescue off-entity content
    detail: `off-entity — no "${head}"${hits.length ? ` (only ${hits[0]})` : ""}`,
  };
}

/* ------------------------------------------------------------------ */
/* the absolute confidence floor                                       */
/* ------------------------------------------------------------------ */

export const CONFIDENCE = {
  corroborated: "independent cross-source corroboration",
  spike: "single-source, but genuinely spiking against that source's own baseline",
  unproven: "one source, no spike — not evidence of demand",
};

// A spike must beat the source's OWN baseline by this much. Absolute: it does
// not adapt to how weak the current pool is.
const SPIKE_MULTIPLE = 3;
const MIN_ENGAGEMENT = 40; // below this, ratios are noise

const sourceType = (s) => (String(s || "").startsWith("r/") ? "reddit" : String(s || "").split(":")[0]);

/**
 * Classify a cluster's evidence. This is a GATE, not a score contribution —
 * it answers "may this be recommended at all", and the answer is allowed to
 * be no for every cluster in the pool.
 */
export function evidenceFloor(cluster, members, { baselines = {} } = {}) {
  const mem = members.filter(Boolean);
  const types = [...new Set(mem.map((m) => sourceType(m.source)))];

  /**
   * Grounding guards against ACCIDENTAL keyword grouping. When an LLM read the
   * titles and grouped them, a literal token test is the wrong instrument and
   * demonstrably produces false negatives: the cluster "AI security and safety
   * concerns" had six real members — mass vulnerability scans, device
   * hijacking, cracked encryption — and every one was demoted for not
   * containing the word "security". Thematic labels never share tokens with
   * the specific stories underneath them.
   *
   * So: trust an LLM grouping, keep grounding for heuristic/singleton ones.
   */
  const groundedMem = cluster.llm ? mem : mem.filter((m) => entityGrounding(cluster.label, m).grounded);
  const groundedTypes = [...new Set(groundedMem.map((m) => sourceType(m.source)))];

  if (groundedTypes.length >= 2) {
    return {
      level: "corroborated",
      why: `${groundedTypes.length} independent sources: ${groundedTypes.join(" + ")}`,
      promotable: true,
      groundedMembers: groundedMem.length,
    };
  }

  // single source: does it spike hard enough to stand alone?
  let best = null;
  for (const m of groundedMem) {
    const engagement = (m.points || 0) + (m.comments || 0) * 2;
    if (engagement < MIN_ENGAGEMENT) continue;
    const base = baselines[sourceType(m.source)] || 0;
    const vel = m.velocity || 0;
    const ratio = base > 0 && vel > 0 ? vel / base : 0;
    if (ratio >= SPIKE_MULTIPLE && (!best || ratio > best.ratio)) {
      best = { ratio: Math.round(ratio * 10) / 10, source: m.source, engagement, base };
    }
  }
  if (best) {
    return {
      level: "spike",
      why: `${best.ratio}× ${best.source} baseline (${best.engagement} engagement)`,
      promotable: true,
      groundedMembers: groundedMem.length,
    };
  }

  const topEng = Math.max(0, ...groundedMem.map((m) => (m.points || 0) + (m.comments || 0) * 2));
  return {
    level: "unproven",
    why: groundedMem.length === 0
      ? "no member survives entity grounding (keyword-formed cluster)"
      : types.length === 1 && !mem.some((m) => m.velocity > 0)
        ? `single source (${types[0]}), no velocity data — cannot distinguish demand from noise`
        : `single source (${types[0]}), peak engagement ${topEng} below a ${SPIKE_MULTIPLE}× spike`,
    promotable: false,
    groundedMembers: groundedMem.length,
  };
}

/**
 * Pool-level read. Exists so the radar can say "nothing cleared the bar"
 * out loud instead of ranking defaults and implying the top row is a lead.
 */
export function poolConfidence(classified) {
  const n = classified.length;
  const by = { corroborated: 0, spike: 0, unproven: 0 };
  for (const c of classified) by[c.evidence.level]++;
  const promotable = by.corroborated + by.spike;
  return {
    total: n,
    ...by,
    promotable,
    verdict:
      promotable === 0
        ? "nothing in the pool clears the evidence floor — the top-ranked rows are defaults, not leads"
        : promotable < 3
          ? `only ${promotable} of ${n} clusters have real evidence behind them`
          : `${promotable} of ${n} clusters are backed by evidence`,
  };
}
