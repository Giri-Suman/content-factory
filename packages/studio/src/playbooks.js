import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot } from "../../shared/src/config.js";
import { collection, newId } from "../../shared/src/store.js";

/**
 * P22 Platform Playbooks. Per-platform rules (length, hooks, captions,
 * slots) that stay current from OBSERVED OUTCOMES — never from pretended
 * knowledge of private algorithms. Three evidence sources: (a) my own
 * results (P15), (b) watchlist outlier patterns (P12), (c) collected
 * chatter about platform changes — the last is QUARANTINED as "unverified
 * signals" for manual review, never auto-applied. Every proposed change
 * cites its evidence; I approve or reject.
 */

export const PLATFORMS = ["yt_short", "ig_reel", "linkedin", "x"];

const DEFAULTS = {
  yt_short: { lengthBandSec: [25, 40], hooks: ["Open Loop", "Results First", "Contrarian Strike"], captionRule: "karaoke, ≤4 words/line, ≥60% scale", hashtagRule: "n/a", slots: ["19:00-21:00 IST"], notes: "Hook must land ≤2s; vertical 1080x1920." },
  ig_reel: { lengthBandSec: [15, 40], hooks: ["Results First", "POV/Relatable"], captionRule: "burned-in, punchy", hashtagRule: "≤8 niche-specific", slots: ["12:30 IST", "20:30 IST"], notes: "Open on the payoff; native trending audio low under VO." },
  linkedin: { lengthBandSec: [30, 90], hooks: ["Confession", "Mistake Warning"], captionRule: "n/a", hashtagRule: "≤3", slots: ["10:00 IST weekday"], notes: "All value native, no external links, inline code." },
  x: { lengthBandSec: [0, 0], hooks: ["List Tease", "Direct Question"], captionRule: "n/a", hashtagRule: "≤2", slots: ["09:30 IST"], notes: "3-post thread; claim → proof → takeaway." },
};

/* ---------------- store ---------------- */

export function ensurePlaybooks() {
  const store = collection("playbooks");
  for (const p of PLATFORMS) {
    if (!store.all().some((x) => x.platform === p)) {
      store.upsert({ id: newId(), platform: p, ...DEFAULTS[p], history: [], updatedAt: new Date().toISOString() }, (r) => r.platform);
    }
  }
  return store.all();
}

export function getPlaybook(platform) {
  ensurePlaybooks();
  return collection("playbooks").find((p) => p.platform === platform)[0] || null;
}

/** Length target a brief should aim for on a platform (mid of the band). */
export function playbookTarget(platform = "yt_short") {
  const pb = getPlaybook(platform);
  const [lo, hi] = pb?.lengthBandSec || [25, 40];
  return Math.round((lo + hi) / 2);
}

/* ---------------- evidence-based refresh ---------------- */

const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
const LEN_BANDS = [[0, 20], [21, 30], [31, 40], [41, 60], [61, 999]];
const bandLabel = ([lo, hi]) => (hi >= 999 ? `${lo}+s` : `${lo}-${hi}s`);

/** (a) My own results: which length band actually wins? */
function lengthProposalFromMyPosts(platform) {
  const plat = platform === "yt_short" ? "youtube" : platform === "ig_reel" ? "instagram" : platform;
  const posts = collection("myposts").find((m) => m.platform === plat && (m.statsSnapshots || []).length && m.lengthSec);
  if (posts.length < 5) return null;
  const views = (m) => m.statsSnapshots.slice(-1)[0].views;
  const overall = median(posts.map(views));
  const banded = LEN_BANDS.map((b) => {
    const inBand = posts.filter((m) => m.lengthSec >= b[0] && m.lengthSec <= b[1]);
    return { band: b, n: inBand.length, median: inBand.length ? median(inBand.map(views)) : 0 };
  }).filter((x) => x.n >= 3);
  if (!banded.length || overall === 0) return null;
  const winner = banded.sort((a, b) => b.median - a.median)[0];
  const ratio = winner.median / overall;
  const pb = getPlaybook(platform);
  const current = pb.lengthBandSec;
  const proposed = winner.band[1] >= 999 ? [current[0], current[1]] : winner.band;
  if (ratio >= 1.25 && (proposed[0] !== current[0] || proposed[1] !== current[1])) {
    return {
      field: "lengthBandSec",
      current,
      proposed,
      evidence: [`My ${bandLabel(winner.band)} posts: ${ratio.toFixed(2)}× my median views (n=${winner.n})`],
      source: "my-results",
    };
  }
  return null;
}

/** (b) Watchlist outliers: what lengths are outperforming in the niche? */
function lengthProposalFromWatchlist(platform) {
  if (platform !== "yt_short" && platform !== "ig_reel") return null;
  const wantShort = true; // both are short-form
  const vids = collection("watchvideos").find((v) => v.isShort === wantShort && v.outlierRatio >= 2 && v.durationSec);
  if (vids.length < 5) return null;
  const banded = LEN_BANDS.slice(0, 3).map((b) => ({ band: b, n: vids.filter((v) => v.durationSec >= b[0] && v.durationSec <= b[1]).length }));
  const winner = banded.sort((a, b) => b.n - a.n)[0];
  if (winner.n < 3) return null;
  return { field: "lengthBandSec", current: getPlaybook(platform).lengthBandSec, proposed: winner.band, evidence: [`${winner.n} niche outlier shorts are ${bandLabel(winner.band)}`], source: "watchlist" };
}

/** (c) Collected chatter about platform changes -> QUARANTINED unverified signals. */
function scanUnverifiedSignals() {
  const CHANGE = /\b(algorithm|shadowban|reach|deboost|policy|monetiz|update|throttl|suppress)\b/i;
  const PLAT = { yt_short: /\b(youtube|yt|shorts?)\b/i, ig_reel: /\b(instagram|ig|reels?|meta)\b/i, linkedin: /\blinkedin\b/i, x: /\b(twitter|x\.com|\bX\b)\b/i };
  const items = (() => {
    const p = path.join(repoRoot, "data", "trends.json");
    if (!existsSync(p)) return [];
    try {
      return Object.values(JSON.parse(readFileSync(p, "utf8")).trends || {});
    } catch {
      return [];
    }
  })();
  const signals = [];
  for (const it of items) {
    if (!CHANGE.test(it.title)) continue;
    for (const [platform, re] of Object.entries(PLAT)) {
      if (re.test(it.title)) signals.push({ platform, text: it.title.slice(0, 120), url: it.url, source: it.source });
    }
  }
  return signals.slice(0, 20);
}

export function refreshPlaybooks() {
  loadEnv();
  ensurePlaybooks();
  const proposals = collection("playbookproposals");
  const existingPending = proposals.find((p) => p.status === "pending");
  let added = 0;

  for (const platform of PLATFORMS) {
    const cands = [lengthProposalFromMyPosts(platform), lengthProposalFromWatchlist(platform)].filter(Boolean);
    for (const c of cands) {
      // don't stack duplicate pending proposals for the same platform+field
      if (existingPending.some((p) => p.platform === platform && p.field === c.field && JSON.stringify(p.proposed) === JSON.stringify(c.proposed))) continue;
      proposals.upsert({ id: newId(), platform, ...c, status: "pending", at: new Date().toISOString() });
      added++;
    }
  }

  // quarantine unverified chatter (never auto-applied)
  const signals = scanUnverifiedSignals();
  collection("playbooksignals").save(signals.map((s) => ({ id: newId(), ...s, reviewed: false, at: new Date().toISOString() })));

  return { proposals: added, unverifiedSignals: signals.length };
}

/* ---------------- approve / reject ---------------- */

export function applyProposal(proposalId) {
  const proposals = collection("playbookproposals");
  const p = proposals.get(proposalId);
  if (!p || p.status !== "pending") return null;
  const store = collection("playbooks");
  const pb = store.find((x) => x.platform === p.platform)[0];
  const before = pb[p.field];
  store.update(pb.id, {
    [p.field]: p.proposed,
    updatedAt: new Date().toISOString(),
    history: [...(pb.history || []), { field: p.field, from: before, to: p.proposed, evidence: p.evidence, source: p.source, at: new Date().toISOString() }].slice(-30),
  });
  return proposals.update(proposalId, { status: "approved", appliedAt: new Date().toISOString() });
}

export function rejectProposal(proposalId) {
  return collection("playbookproposals").update(proposalId, { status: "rejected", at: new Date().toISOString() });
}
