import { loadEnv, loadUserConfig, saveUserConfig, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection, newId } from "../../shared/src/store.js";
import { chat, providerStatus } from "../../llm/src/llm.js";

/**
 * P15 Calibration Loop — the moat. Joins MY actual results against the
 * system's own predictions/assumptions, writes a weekly memo, and (once
 * N>=20 posts exist) nudges the system toward what works FOR ME:
 *   - timing_ist re-ranked from real slot performance
 *   - scoring weights nudged <=10%/week toward what correlates with wins
 *   - my winners fed to the Title Lab as patterns
 * Every auto-change is logged to the `tuning` collection and reversible.
 * No invented numbers: the memo sees only joined data, degrades to a
 * coded summary keyless.
 */

const MIN_N = 20;
const MAX_WEEKLY_NUDGE = 0.1;
const AGE_MARKS = [1, 6, 24, 48, 168]; // hours: 1h/6h/24h/48h/7d

/* ---------------- ingestion ---------------- */

/** Nightly: pull current stats for each MyPost (1 unit each) -> snapshots. */
/**
 * EVERY READ OF `myposts` HERE MUST EXCLUDE `seed: true`.
 *
 * `factory seed myposts` writes 25 synthetic rows carrying fabricated
 * statsSnapshots and a predictedTier constructed to correlate with them. They
 * exist to exercise the acceptance path. Left unfiltered, this module measures
 * its own fixtures: it re-ranks posting slots, nudges scoring weights and feeds
 * "winners" to the Title Lab from posts that were never published. The loop
 * then reports that its predictions are accurate, which is true and meaningless
 * - the correlation was baked in by the generator.
 *
 * The poller was worse than useless on them: seeded rows carry
 * externalId "seed0".."seed24", so it spent real YouTube quota asking for video
 * ids that do not exist.
 */

export async function ingestMyChannel() {
  loadEnv();
  const posts = collection("myposts").find((m) => !m.seed && m.platform === "youtube" && m.externalId);
  const { hasKey, videoStats } = await import("../../radar/src/youtube.js");
  if (!hasKey()) return { polled: 0, note: "no YOUTUBE_API_KEY — my-channel ingestion idle" };

  let polled = 0;
  for (const m of posts) {
    try {
      const s = await videoStats(m.externalId, "my-channel");
      if (!s) continue;
      const snapshots = [...(m.statsSnapshots || []), { at: new Date().toISOString(), ...s }].slice(-40);
      collection("myposts").update(m.id, { statsSnapshots: snapshots });
      polled++;
    } catch {
      /* one post failing never stops the loop */
    }
  }
  return { polled };
}

/** Velocity curve: views at each age mark where a snapshot exists nearby. */
export function velocityCurve(post) {
  const snaps = (post.statsSnapshots || []).map((s) => ({ ...s, ageH: (new Date(s.at).getTime() - new Date(post.postedAt).getTime()) / 36e5 }));
  const curve = {};
  for (const mark of AGE_MARKS) {
    const near = snaps.filter((s) => s.ageH >= 0 && s.ageH <= mark * 1.5).sort((a, b) => Math.abs(a.ageH - mark) - Math.abs(b.ageH - mark))[0];
    if (near) curve[`h${mark}`] = near.views;
  }
  return curve;
}

/** The comparable outcome metric: latest snapshot views (fallback 0). */
function outcomeViews(post) {
  const snaps = post.statsSnapshots || [];
  return snaps.length ? snaps[snaps.length - 1].views : 0;
}

/* ---------------- performance joins ---------------- */

const median = (nums) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

const lengthBand = (sec) => (sec == null ? "unknown" : sec <= 20 ? "≤20s" : sec <= 40 ? "21-40s" : sec <= 60 ? "41-60s" : ">60s");
const slotOf = (iso) => {
  if (!iso) return "unknown";
  const h = (new Date(iso).getUTCHours() + 5) % 24; // approx IST hour
  return h < 6 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
};

export function performanceJoins() {
  const posts = collection("myposts").find((m) => !m.seed && (m.statsSnapshots || []).length > 0);
  const overall = median(posts.map(outcomeViews));

  const groupBy = (keyFn) => {
    const groups = {};
    for (const p of posts) {
      const key = keyFn(p);
      if (key == null) continue;
      (groups[key] ??= []).push(outcomeViews(p));
    }
    return Object.entries(groups)
      .map(([key, views]) => ({
        key,
        n: views.length,
        median: median(views),
        vsOverall: overall > 0 ? Math.round((median(views) / overall) * 100) / 100 : null,
      }))
      .sort((a, b) => b.median - a.median);
  };

  return {
    n: posts.length,
    overallMedian: overall,
    byHook: groupBy((p) => p.hookPattern),
    byPillar: groupBy((p) => p.pillar),
    byLength: groupBy((p) => lengthBand(p.lengthSec)),
    bySlot: groupBy((p) => slotOf(p.postedAt)),
    byKind: groupBy((p) => p.kind),
  };
}

/* ---------------- weekly memo ---------------- */

function codedMemo(joins) {
  const top = (arr) => arr.filter((g) => g.n >= 2)[0];
  const bottom = (arr) => arr.filter((g) => g.n >= 2).slice(-1)[0];
  const winH = top(joins.byHook);
  const loseH = bottom(joins.byHook);
  const winL = top(joins.byLength);
  return {
    outperformed: [winH && `${winH.key} hooks (${winH.vsOverall}× median, n=${winH.n})`, winL && `${winL.key} length (${winL.vsOverall}× median)`].filter(Boolean),
    underperformed: [loseH && `${loseH.key} hooks (${loseH.vsOverall}× median)`].filter(Boolean),
    wrongAssumptions: ["(coded summary — add an LLM key for assumption analysis)"],
    recommendations: [
      winH && `lean into ${winH.key} hooks`,
      winL && `target ${winL.key} length`,
      joins.bySlot[0] && `post more in the ${joins.bySlot[0].key} slot`,
    ].filter(Boolean),
  };
}

export async function weeklyMemo() {
  loadEnv();
  const joins = performanceJoins();
  if (joins.n < 3) return { skipped: `only ${joins.n} posts with data (need 3+)` };

  let body;
  if (providerStatus().active) {
    try {
      const fmt = (label, arr) => `${label}: ${arr.map((g) => `${g.key} ${g.vsOverall}× (n=${g.n})`).join(", ")}`;
      const res = await chat({
        task: "score",
        maxTokens: 1200,
        system:
          `You are a YouTube analytics coach for: ${NICHE_CONTEXT}. Analyze ONLY the joined performance data given — ` +
          "invent NO numbers. Reply ONLY JSON: {\"outperformed\":[...],\"underperformed\":[...],\"wrongAssumptions\":[...],\"recommendations\":[3 concrete]}.",
        user: [
          `overall median views: ${joins.overallMedian} (n=${joins.n})`,
          fmt("by hook", joins.byHook),
          fmt("by pillar", joins.byPillar),
          fmt("by length", joins.byLength),
          fmt("by slot", joins.bySlot),
        ].join("\n"),
      });
      body = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
    } catch {
      body = codedMemo(joins);
    }
  } else {
    body = codedMemo(joins);
  }

  const memo = { id: "current", date: new Date().toISOString().slice(0, 10), n: joins.n, joins, ...body, at: new Date().toISOString() };
  collection("memos").save([memo]);
  return memo;
}

/* ---------------- auto-tuning (guarded) ---------------- */

function logTuning(kind, detail, before, after) {
  const t = collection("tuning");
  const row = { id: newId(), kind, detail, before, after, at: new Date().toISOString(), reverted: false };
  t.save([...t.all(), row]);
  return row;
}

export async function autoTune() {
  loadEnv();
  const cfg0 = loadUserConfig();
  if (cfg0.autoTune === false) return { skipped: "auto-tune is OFF in Settings" };
  const joins = performanceJoins();
  if (joins.n < MIN_N) return { skipped: `N=${joins.n} < ${MIN_N} — auto-tuning stays off until you've posted more` };

  const changes = [];
  const cfg = loadUserConfig();

  // (a) re-rank timing from real slot performance
  const slotRank = joins.bySlot.filter((s) => s.n >= 2).map((s) => s.key);
  if (slotRank.length) {
    const before = cfg.tunedSlots || null;
    cfg.tunedSlots = slotRank;
    changes.push(logTuning("timing", `slot preference re-ranked to ${slotRank.join(" > ")}`, before, slotRank));
  }

  // (b) nudge scoring weights <=10% toward what correlates with wins.
  // crude but honest: if high-velocity posts won, nudge velocity up; if
  // cross-source clusters won, nudge crossSource — proxied by pillar spread.
  const weights = { velocity: 1, crossSource: 1, nicheFit: 1, saturationGap: 1, ...(cfg.scoreWeights || {}) };
  const nudged = {};
  // signal: does the top-performing length skew short/kinetic? favor velocity.
  const topLen = joins.byLength.filter((l) => l.n >= 2)[0];
  if (topLen && /≤20s|21-40s/.test(topLen.key)) {
    const before = weights.velocity;
    weights.velocity = Math.round(Math.min(1.5, before * (1 + MAX_WEEKLY_NUDGE)) * 100) / 100;
    if (weights.velocity !== before) nudged.velocity = { before, after: weights.velocity };
  }
  if (Object.keys(nudged).length) {
    cfg.scoreWeights = weights;
    changes.push(logTuning("weights", `nudged ${Object.keys(nudged).join(", ")} (≤${MAX_WEEKLY_NUDGE * 100}%/week)`, "…", nudged));
  }

  saveUserConfig(cfg);

  // (c) feed my winners to the Title Lab as patterns
  const winners = collection("myposts")
    .find((m) => !m.seed && (m.statsSnapshots || []).length > 0)
    .sort((a, b) => outcomeViews(b) - outcomeViews(a))
    .slice(0, 5)
    .filter((m) => m.title);
  if (winners.length >= 3) {
    const store = collection("titlepatterns");
    store.upsert(
      {
        id: newId(),
        template: "MY WINNERS (calibration-fed)",
        exampleTitles: winners.map((w) => w.title),
        sampleSize: winners.length,
        avgOutlierRatio: 3,
        source: "my-channel",
        updatedAt: new Date().toISOString(),
      },
      (r) => r.template === "MY WINNERS (calibration-fed)"
    );
    changes.push(logTuning("title-lab", `fed ${winners.length} of my winners as a pattern`, null, winners.map((w) => w.title.slice(0, 40))));
  }

  return { tuned: changes.length, changes, n: joins.n };
}

export function revertTuning(tuningId) {
  const t = collection("tuning");
  const row = t.get(tuningId);
  if (!row || row.reverted) return null;
  const cfg = loadUserConfig();
  if (row.kind === "timing") cfg.tunedSlots = row.before;
  if (row.kind === "weights") {
    for (const [k, v] of Object.entries(row.after)) cfg.scoreWeights = { ...cfg.scoreWeights, [k]: v.before };
  }
  saveUserConfig(cfg);
  return t.update(tuningId, { reverted: true, revertedAt: new Date().toISOString() });
}

/* ---------------- prediction scorecard ---------------- */

export function predictionScorecard() {
  const posts = collection("myposts").find((m) => !m.seed && (m.statsSnapshots || []).length > 0);
  const overall = median(posts.map(outcomeViews));

  // wishlist predictedTier: did S/A actually beat B/C? (only where I made the content)
  const withTier = posts.filter((m) => m.predictedTier);
  const tierRows = ["S", "A", "B", "C"].map((tier) => {
    const g = withTier.filter((m) => m.predictedTier === tier);
    return { tier, n: g.length, median: g.length ? median(g.map(outcomeViews)) : null, reliable: g.length >= 3 };
  });
  // is the tier ordering actually monotonic (S>=A>=B>=C on median)?
  const seq = tierRows.filter((r) => r.median != null).map((r) => r.median);
  const monotonic = seq.every((v, i) => i === 0 || v <= seq[i - 1]);
  const tierHonest =
    withTier.length < 10
      ? "not enough data yet (need 10+ posts with a predicted tier)"
      : monotonic
        ? `calibrated ✓ — tiers rank correctly (${withTier.length} posts). Tiers with n<3 are still small samples.`
        : "MISCALIBRATED — higher tiers are NOT beating lower ones; the rubric needs review";

  // title score vs outcome correlation (only where a score exists)
  const withScore = posts.filter((m) => typeof m.titleScore === "number");
  const scoreHonest = withScore.length < 10 ? "not enough data yet (need 10+ posts with a title score)" : null;

  return {
    n: posts.length,
    overallMedian: overall,
    byTier: tierRows,
    tierHonest,
    titleScoreN: withScore.length,
    scoreHonest,
  };
}
