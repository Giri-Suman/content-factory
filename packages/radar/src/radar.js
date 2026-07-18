import { loadEnv, ensureDirs } from "../../shared/src/config.js";
import { withJobRun } from "../../shared/src/jobs.js";
import { upsertTrend, getByIds, updateScore, topTrends, hotUnalerted, markAlerted, recordSnapshots, save } from "./db.js";
import { ingestAll } from "./sources.js";
import { heuristicScore, llmScore } from "./score.js";
import { sendAlert } from "./alert.js";
import { categoryWeight } from "../../publish/src/analytics.js";

// analytics feedback: multiply a trend's score by its category's performance weight
const weighted = (score, category) => Math.max(0, Math.min(100, Math.round(score * categoryWeight(category))));

const ALERT_THRESHOLD = 80;

const age = (iso) => {
  if (!iso) return "?";
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 36e5);
  return h < 1 ? "now" : h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
};

export const runRadar = (opts = {}) => withJobRun("collect", () => runRadarInner(opts));

async function runRadarInner({ github = true } = {}) {
  loadEnv();
  ensureDirs();

  console.log("\nscanning sources...");
  const { items, failures, enabled } = await ingestAll({ github });
  console.log(`  categories: ${enabled.join(", ") || "none"}`);

  // upsert + per-source run summary (P2 acceptance: source|fetched|new|updated|errors)
  const stats = new Map();
  const statFor = (source) => {
    if (!stats.has(source)) stats.set(source, { fetched: 0, new: 0, updated: 0, errors: 0 });
    return stats.get(source);
  };
  const idSet = new Set();
  for (const item of items) {
    const s = statFor(item.source);
    s.fetched++;
    const { id, isNew } = upsertTrend(item);
    if (!idSet.has(id)) {
      idSet.add(id);
      s[isNew ? "new" : "updated"]++;
    }
  }
  for (const f of failures) statFor(f.split(":")[0]).errors++;

  console.log("\n  SOURCE         FETCHED  NEW  UPDATED  ERRORS");
  console.log("  " + "-".repeat(46));
  for (const [source, s] of [...stats.entries()].sort()) {
    console.log(
      `  ${source.padEnd(14)} ${String(s.fetched).padStart(7)} ${String(s.new).padStart(4)} ${String(s.updated).padStart(8)} ${String(s.errors).padStart(7)}`
    );
  }
  for (const f of failures) console.error(`  ! ${f}`);

  const ids = [...idSet];
  const velocities = recordSnapshots(ids);
  const seenVel = [...velocities.values()].filter((v) => v !== null);
  console.log(
    `\n  snapshots: ${velocities.size} written, velocity known for ${seenVel.length}` +
      (seenVel.length ? ` (max ${Math.max(...seenVel).toFixed(1)} pts/h)` : " (first sighting run)")
  );
  const fresh = getByIds(ids);

  console.log(`scoring ${fresh.length} trends...`);
  const llm = await llmScore(fresh);
  if (llm) console.log(`  scored via ${llm.provider}`);
  else console.log(`  heuristic scoring — set an LLM key in .env (anthropic/openrouter/ollama) for smarter scoring`);

  for (const t of fresh) {
    const viaLlm = llm?.scored.get(t.id);
    const raw = viaLlm ? viaLlm.score : heuristicScore(t);
    updateScore(t.id, weighted(raw, t.category), viaLlm ? llm.provider : "heuristic", viaLlm?.reason || null);
  }
  save();

  const top = topTrends(15);
  console.log("\n  ID       SCORE  VEL/H  AGE  CATEGORY  SOURCE        TITLE");
  console.log("  " + "-".repeat(104));
  for (const t of top) {
    const vel = t.velocity === null || t.velocity === undefined ? "  —" : String(t.velocity).padStart(3);
    console.log(
      `  ${t.id.padEnd(8)} ${String(t.score).padStart(3)}   ${vel}   ${age(t.published_at).padEnd(4)} ${(t.category || "?").padEnd(9)} ${t.source.padEnd(13)} ${t.title.slice(0, 50)}`
    );
  }

  const hot = hotUnalerted(ALERT_THRESHOLD);
  if (hot.length) {
    const sent = await sendAlert(hot).catch((e) => {
      console.error(`  telegram alert failed: ${e.message}`);
      return false;
    });
    if (sent) {
      for (const t of hot) markAlerted(t.id);
      save();
      console.log(`\n  alerted ${hot.length} hot trend(s) via telegram`);
    }
  }

  console.log(`\nnext: factory script <ID>   (drafts a video script from a trend)\n`);

  // P4: opportunity scoring auto-runs after every collect
  try {
    const { runScore } = await import("./clusters.js");
    await runScore();
  } catch (e) {
    console.error(`  cluster scoring failed (collect itself succeeded): ${e.message}`);
  }
  return true;
}
