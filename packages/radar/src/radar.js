import { loadEnv, ensureDirs } from "../../shared/src/config.js";
import { upsertTrend, getByIds, updateScore, topTrends, hotUnalerted, markAlerted, save } from "./db.js";
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

export async function runRadar() {
  loadEnv();
  ensureDirs();

  console.log("\nscanning sources...");
  const { items, failures, enabled } = await ingestAll();
  for (const f of failures) console.error(`  ! ${f}`);
  console.log(
    `  ${items.length} items from ${new Set(items.map((i) => i.source)).size} sources (categories: ${enabled.join(", ") || "none"})`
  );

  const ids = [...new Set(items.map(upsertTrend))];
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
  console.log("\n  ID       SCORE  AGE  CATEGORY  SOURCE        TITLE");
  console.log("  " + "-".repeat(100));
  for (const t of top) {
    console.log(
      `  ${t.id.padEnd(8)} ${String(t.score).padStart(3)}   ${age(t.published_at).padEnd(4)} ${(t.category || "?").padEnd(9)} ${t.source.padEnd(13)} ${t.title.slice(0, 54)}`
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
  return true;
}
