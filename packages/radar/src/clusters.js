import { loadEnv, loadUserConfig, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection } from "../../shared/src/store.js";
import { withJobRun } from "../../shared/src/jobs.js";
import { chat, providerStatus } from "../../llm/src/llm.js";
import { hasKey, saturation } from "./youtube.js";
import { evidenceFloor, poolConfidence } from "./evidence.js";

/**
 * P4 scoring engine: items -> TopicClusters -> transparent opportunityScore.
 *   velocity (0-40) + crossSource (0-25) + nicheFit (0-20) + saturationGap (0-15)
 * Every component is stored in scoreBreakdown with its inputs — no black boxes.
 * Degrades keyless: singleton clusters, heuristic nicheFit, saturation default.
 */

const TOP_ITEMS = 120;
const SATURATION_TOP = 15;
const SATURATION_DEFAULT = 7;

// per-source velocity baselines until 7 days of snapshots exist (pts/hour)
const VELOCITY_BASELINES = { hn: 8, github: 25, reddit: 12, rss: 1, youtube: 2000 };

export const sourceType = (source) => {
  if (source === "hn") return "hn";
  if (source === "github") return "github";
  if (source.startsWith("r/")) return "reddit";
  if (source.startsWith("yt-")) return "youtube";
  return "rss";
};

/* ---------------- item selection ---------------- */

function readTrendsStore() {
  // clusters read the radar's store via its own db module to stay in sync
  return import("./db.js");
}

function topItems(trends) {
  const cutoff = Date.now() - 72 * 36e5;
  return Object.values(trends)
    .filter((t) => !t.used && new Date(t.last_seen).getTime() >= cutoff)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.last_seen.localeCompare(a.last_seen))
    .slice(0, TOP_ITEMS);
}

/* ---------------- clustering (ONE LLM call) ---------------- */

async function clusterWithLlm(items) {
  if (!providerStatus().active) return null;
  const listing = items.map((t) => `${t.id} | ${t.source} | ${t.title.slice(0, 110)}`).join("\n");
  const ask = async () => {
    const res = await chat({
      task: "score",
      maxTokens: 4000,
      system:
        "You cluster tech-news items into topic groups for a content creator. Group items that are about the SAME " +
        "underlying topic/story (not merely the same broad field). 2+ members per cluster; leave unrelated items out. " +
        'Items are "id | source | title". Reply ONLY JSON: ' +
        '{"clusters":[{"label":"<5-8 word topic>","summary":"<one sentence>","memberIds":["id",...]}]}',
      user: listing,
    });
    const s = res.text.indexOf("{");
    const e = res.text.lastIndexOf("}");
    return JSON.parse(res.text.slice(s, e + 1));
  };
  try {
    let parsed;
    try {
      parsed = await ask();
    } catch {
      parsed = await ask(); // one retry on parse failure per spec
    }
    const valid = (parsed.clusters || []).filter(
      (c) => typeof c.label === "string" && Array.isArray(c.memberIds) && c.memberIds.length >= 2
    );
    return valid.length ? valid : null;
  } catch {
    return null;
  }
}

/* ---------------- score components ---------------- */

export function velocityBaselines(trends) {
  const bySource = {};
  for (const t of Object.values(trends)) {
    if (t.velocity === null || t.velocity === undefined) continue;
    const st = sourceType(t.source);
    (bySource[st] ??= []).push(Math.abs(t.velocity));
  }
  const baselines = {};
  for (const [st, arr] of Object.entries(bySource)) {
    if (arr.length >= 10) {
      const s = arr.sort((a, b) => a - b);
      const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
      baselines[st] = Math.max(med, 0.5);
    }
  }
  return { ...VELOCITY_BASELINES, ...baselines };
}

function velocityScore(members, baselines) {
  let best = 0;
  let bestDetail = "no velocity data yet";
  for (const m of members) {
    if (m.velocity === null || m.velocity === undefined || m.velocity <= 0) continue;
    const base = baselines[sourceType(m.source)] || 5;
    const norm = m.velocity / base;
    if (norm > best) {
      best = norm;
      bestDetail = `${m.velocity}/h on ${m.source} (baseline ${base}/h)`;
    }
  }
  // sqrt curve: 1x baseline = 13, 4x = 26, 9x+ = 39 — keeps headroom at the top
  return { value: Math.min(40, Math.round(Math.sqrt(best) * 13)), detail: bestDetail };
}

function crossSourceScore(members) {
  const types = [...new Set(members.map((m) => sourceType(m.source)))];
  const value = types.length >= 3 ? 25 : types.length === 2 ? 15 : 5;
  return { value, detail: types.join(" + ") };
}

async function nicheFitScores(clusters) {
  if (providerStatus().active) {
    const listing = clusters.map((c, i) => `${i} | ${c.label} — ${c.summary || ""}`).join("\n");
    try {
      const res = await chat({
        task: "score",
        maxTokens: 1500,
        system:
          `You rate topic clusters 0-10 for fit with this creator: ${NICHE_CONTEXT}. ` +
          '10 = perfect fit, 0 = irrelevant. Reply ONLY JSON: {"ratings":[{"i":0,"fit":7},...]} covering every index.',
        user: listing,
      });
      const parsed = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
      const map = new Map((parsed.ratings || []).map((r) => [r.i, Math.max(0, Math.min(10, r.fit))]));
      if (map.size) return clusters.map((_, i) => ({ value: (map.get(i) ?? 5) * 2, detail: "llm-rated" }));
    } catch {
      /* fall through to heuristic */
    }
  }
  const STRONG = /\b(ai|llm|claude|gpt|agent|automation|code|coding|dev|javascript|typescript|react|python|api|open.?source|cli|framework)\b/i;
  const WEAK = /\b(tech|software|tool|app|data|cloud|startup)\b/i;
  return clusters.map((c) => {
    const text = `${c.label} ${c.summary || ""}`;
    const fit = STRONG.test(text) ? 8 : WEAK.test(text) ? 5 : 2;
    return { value: fit * 2, detail: "heuristic (no LLM key)" };
  });
}

async function saturationGapScore(label, rank) {
  if (rank >= SATURATION_TOP || !hasKey()) {
    return { value: SATURATION_DEFAULT, detail: rank >= SATURATION_TOP ? "default (below top-15)" : "default (no YouTube key)" };
  }
  try {
    const s = await saturation(label, "yt-saturation");
    // transparent mapping: few recent videos + weak views = open gap
    let value = s.videoCount > 200 ? 2 : s.videoCount > 80 ? 5 : s.videoCount > 30 ? 8 : s.videoCount > 10 ? 11 : 14;
    if (s.medianViews > 100_000) value = Math.max(0, value - 3); // flooded AND strong supply
    return { value: Math.min(15, value), detail: `${s.videoCount} videos/48h, median ${s.medianViews} views` };
  } catch (e) {
    return { value: SATURATION_DEFAULT, detail: `default (${e.message.startsWith("QUOTA_CAP") ? "quota cap" : "lookup failed"})` };
  }
}

/* ---------------- status transitions ---------------- */

function nextStatus(history) {
  if (history.length < 2) return "new";
  const d1 = history[history.length - 1] - history[history.length - 2];
  if (d1 > 0) return "rising";
  if (history.length >= 3 && d1 < 0 && history[history.length - 2] - history[history.length - 3] < 0) return "fading";
  return "rising";
}

/* ---------------- main ---------------- */

export const runScore = () => withJobRun("score", runScoreInner);

async function runScoreInner() {
  loadEnv();
  const { getAllTrends, setClusterId, save } = await readTrendsStore();
  const trends = getAllTrends();
  const items = topItems(trends);
  if (items.length === 0) {
    console.log("no recent items to score — run collect first");
    return { clusters: 0 };
  }
  console.log(`\nclustering ${items.length} items...`);

  const byId = new Map(items.map((t) => [t.id, t]));
  const llmClusters = await clusterWithLlm(items);
  const groups = [];
  const grouped = new Set();
  if (llmClusters) {
    for (const c of llmClusters) {
      const members = c.memberIds.map((id) => byId.get(id)).filter(Boolean);
      if (members.length >= 2) {
        groups.push({ label: c.label, summary: c.summary || "", members });
        members.forEach((m) => grouped.add(m.id));
      }
    }
    console.log(`  ${groups.length} multi-item clusters via LLM`);
  } else {
    console.log(`  singleton clustering (${providerStatus().active ? "LLM grouping failed" : "no LLM key"})`);
  }
  for (const t of items) {
    if (!grouped.has(t.id)) groups.push({ label: t.title.slice(0, 80), summary: "", members: [t] });
  }
  // same-label groups collapse into one (e.g. identical titles from two URLs)
  const byLabel = new Map();
  for (const g of groups) {
    const key = g.label.toLowerCase();
    const prev = byLabel.get(key);
    if (prev) prev.members.push(...g.members.filter((m) => !prev.members.some((p) => p.id === m.id)));
    else byLabel.set(key, g);
  }
  groups.length = 0;
  groups.push(...byLabel.values());

  const baselines = velocityBaselines(trends);
  const fits = await nicheFitScores(groups);

  // provisional rank (without saturation) decides who earns a saturation lookup
  const provisional = groups
    .map((g, i) => ({ g, i, p: velocityScore(g.members, baselines).value + crossSourceScore(g.members).value + fits[i].value }))
    .sort((a, b) => b.p - a.p);
  const rankOf = new Map(provisional.map((e, rank) => [e.i, rank]));

  const clustersCol = collection("clusters");
  const prior = new Map(clustersCol.all().map((c) => [c.label.toLowerCase(), c]));
  const now = new Date().toISOString();
  const out = [];

  // user-tunable component weights from Settings (0.5-1.5, default 1)
  const weights = { velocity: 1, crossSource: 1, nicheFit: 1, saturationGap: 1, ...(loadUserConfig().scoreWeights || {}) };
  const w = (component, name) => {
    const mult = Math.max(0.5, Math.min(1.5, Number(weights[name]) || 1));
    const value = Math.round(component.value * mult);
    return { ...component, value, detail: mult !== 1 ? `${component.detail} ×${mult} weight` : component.detail };
  };

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const vel = w(velocityScore(g.members, baselines), "velocity");
    const cross = w(crossSourceScore(g.members), "crossSource");
    const fit = w(fits[i], "nicheFit");
    const gap = w(await saturationGapScore(g.label, rankOf.get(i)), "saturationGap");
    const opportunityScore = vel.value + cross.value + fit.value + gap.value;

    // Absolute evidence gate (adapted from last30days). Independent of the
    // 0-100 score: relative ranking always crowns a winner, so a cluster can
    // top the board on defaults alone. This answers a different question —
    // may it be recommended at all — and is allowed to say no to everything.
    const evidence = evidenceFloor(g, g.members, { baselines });

    const existing = prior.get(g.label.toLowerCase());
    const history = [...(existing?.scoreHistory || []), opportunityScore].slice(-4);
    out.push({
      id: existing?.id || undefined,
      label: g.label,
      summary: g.summary,
      opportunityScore,
      evidence,
      scoreBreakdown: {
        velocity: { ...vel, max: 40 },
        crossSource: { ...cross, max: 25 },
        nicheFit: { ...fit, max: 20 },
        saturationGap: { ...gap, max: 15 },
      },
      status: nextStatus(history),
      scoreHistory: history,
      memberIds: g.members.map((m) => m.id),
      memberCount: g.members.length,
      updatedAt: now,
    });
  }

  const rows = out
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .map((c) => clustersCol.upsert(c, (r) => r.label.toLowerCase()));
  // drop clusters that vanished from the current run (stale topics)
  clustersCol.save(clustersCol.all().filter((c) => c.updatedAt === now));

  for (const c of rows) for (const id of c.memberIds) setClusterId(id, c.id);
  save();

  const pool = poolConfidence(rows.map((c) => ({ evidence: c.evidence })));

  console.log(`\n  SCORE  V/40 X/25 N/20 G/15  EVIDENCE      STATUS  CLUSTER`);
  console.log("  " + "-".repeat(100));
  for (const c of rows.slice(0, 12)) {
    const b = c.scoreBreakdown;
    const ev = c.evidence?.promotable ? c.evidence.level : `${c.evidence?.level || "?"}*`;
    console.log(
      `  ${String(c.opportunityScore).padStart(5)}  ${String(b.velocity.value).padStart(4)} ${String(b.crossSource.value).padStart(4)} ${String(b.nicheFit.value).padStart(4)} ${String(b.saturationGap.value).padStart(4)}  ${ev.padEnd(13)} ${c.status.padEnd(6)}  ${c.label.slice(0, 42)}${c.memberCount > 1 ? ` (${c.memberCount})` : ""}`
    );
  }

  // The verdict matters more than the ranking. A pool where nothing clears
  // the floor still produces a tidy sorted table, which reads like a set of
  // leads — say plainly that it isn't one.
  console.log(`\n  evidence: ${pool.corroborated} corroborated · ${pool.spike} spiking · ${pool.unproven} unproven   (* = below the floor, not promotable)`);
  console.log(`  ${pool.verdict}`);
  if (pool.promotable === 0 && rows.length) {
    const why = rows[0]?.evidence?.why || "";
    console.log(`  top row's actual basis: ${why}`);
    console.log(`  this is a collection problem, not a ranking problem — more sources or more`);
    console.log(`  snapshot passes (velocity needs 2+ observations of the same item) will fix it.`);
  }
  return { clusters: rows.length, promotable: pool.promotable, summary: `${rows.length} clusters, ${pool.promotable} with evidence` };
}
