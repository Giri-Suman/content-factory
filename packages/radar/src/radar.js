import { loadEnv, ensureDirs } from "../../shared/src/config.js";
import { upsertTrend, getByIds, updateScore, topTrends, hotUnalerted, markAlerted, save } from "./db.js";
import { ingestAll } from "./sources.js";
import { heuristicScore, llmScore } from "./score.js";
import { sendAlert } from "./alert.js";

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
  const { items, failures } = await ingestAll();
  for (const f of failures) console.error(`  ! ${f}`);
  console.log(`  ${items.length} items from ${new Set(items.map((i) => i.source)).size} sources`);

  const ids = [...new Set(items.map(upsertTrend))];
  const fresh = getByIds(ids);

  const useLlm = Boolean(process.env.ANTHROPIC_API_KEY);
  console.log(
    `scoring ${fresh.length} trends (${useLlm ? "claude" : "heuristic — set ANTHROPIC_API_KEY for smarter scoring"})...`
  );
  const llm = useLlm ? await llmScore(fresh) : null;

  for (const t of fresh) {
    const viaLlm = llm?.get(t.id);
    if (viaLlm) updateScore(t.id, viaLlm.score, "claude", viaLlm.reason);
    else updateScore(t.id, heuristicScore(t), "heuristic", null);
  }
  save();

  const top = topTrends(15);
  console.log("\n  ID       SCORE  AGE  SOURCE        TITLE");
  console.log("  " + "-".repeat(96));
  for (const t of top) {
    console.log(
      `  ${t.id.padEnd(8)} ${String(t.score).padStart(3)}   ${age(t.published_at).padEnd(4)} ${t.source.padEnd(13)} ${t.title.slice(0, 62)}`
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
