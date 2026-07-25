import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { loadEnv, loadUserConfig, repoRoot } from "../../shared/src/config.js";
import { collection } from "../../shared/src/store.js";

/**
 * factory health — one command that answers "is this thing actually
 * working?" across all 25 milestones.
 *
 * `doctor` checks the TOOLCHAIN (is ffmpeg installed). This checks the
 * SYSTEM'S OWN OUTPUT for the failure mode that hurt most: features that
 * run without error while producing degraded results. It would have caught
 * "118 of 119 clusters are singletons" on day one.
 */

const ok = (m) => ({ level: "ok", m });
const warn = (m, fix) => ({ level: "warn", m, fix });
const bad = (m, fix) => ({ level: "bad", m, fix });

export async function health() {
  loadEnv();
  const cfg = loadUserConfig();
  const groups = [];
  const rows = (name) => collection(name).all();

  /* ---- 1. AI reality: is the intelligence actually intelligent? ---- */
  const ai = [];
  const { providerStatus } = await import("../../llm/src/llm.js");
  const st = providerStatus();
  if (!st.active) {
    ai.push(bad("no AI configured — every AI feature is on heuristic fallback", "free tier costs $0: ollama pull llama3.2, then OLLAMA_MODEL=llama3.2 in .env"));
  } else {
    ai.push(ok(`AI active via ${st.active}`));
  }
  const clusters = rows("clusters");
  if (clusters.length) {
    const singles = clusters.filter((c) => (c.memberCount || 1) === 1).length;
    const pct = Math.round((singles / clusters.length) * 100);
    if (pct > 80) {
      ai.push(bad(`${singles}/${clusters.length} clusters (${pct}%) are single-item — clustering isn't grouping, so crossSource is stuck near 5/25`, "needs an AI tier; clustering is one LLM call"));
    } else ai.push(ok(`clustering healthy — ${100 - pct}% of clusters are multi-item`));
  }
  const briefs = rows("briefs");
  const tmpl = briefs.filter((b) => b.payload?.template).length;
  if (briefs.length && tmpl === briefs.length) {
    ai.push(bad(`all ${briefs.length} briefs are [fill:] templates — no brief has been AI-written`, "same fix: configure any AI tier"));
  } else if (tmpl) ai.push(warn(`${tmpl}/${briefs.length} briefs are unfilled templates`, "regenerate them once an AI tier is live"));
  groups.push({ name: "AI & intelligence", checks: ai });

  /* ---- 2. pipeline flow: is work moving or stuck? ---- */
  const flow = [];
  const stuck = briefs.filter((b) => {
    if (!b.pipeline || ["ready", "published"].includes(b.pipeline.state)) return false;
    const h = (Date.now() - new Date(b.pipeline.updatedAt).getTime()) / 36e5;
    return h > (b.kind === "trend" ? 6 : 24);
  });
  flow.push(stuck.length ? warn(`${stuck.length} brief(s) stuck in the pipeline`, "factory produce board — or resolve them on /production") : ok("no stuck briefs"));
  const esc = rows("escalations").filter((e) => !e.resolved);
  flow.push(esc.length ? warn(`${esc.length} item(s) in Human Review`, "review them on /qc — escalated work never auto-publishes") : ok("no escalations pending"));
  const readyItems = rows("publishitems").filter((i) => i.status === "ready" || i.status === "preparing");
  flow.push(readyItems.length ? ok(`${readyItems.length} publish item(s) waiting for your tap`) : warn("nothing queued to publish", "approve a brief, then Send to Publish Center"));
  groups.push({ name: "Pipeline flow", checks: flow });

  /* ---- 3. data hygiene: growth and staleness ---- */
  const data = [];
  const sizeOf = (p) => (existsSync(p) ? statSync(p).size : 0);
  const trendsPath = path.join(repoRoot, "data", "trends.json");
  const trendsKB = Math.round(sizeOf(trendsPath) / 1024);
  const trendCount = existsSync(trendsPath) ? Object.keys(JSON.parse(readFileSync(trendsPath, "utf8")).trends || {}).length : 0;
  if (trendsKB > 2000) data.push(bad(`trends.json is ${trendsKB}KB (${trendCount} rows) — every write re-serializes it`, "factory prune"));
  else if (trendsKB > 500) data.push(warn(`trends.json is ${trendsKB}KB (${trendCount} rows) and grows unbounded`, "factory prune"));
  else data.push(ok(`trend store healthy (${trendsKB}KB, ${trendCount} rows)`));

  const snaps = rows("snapshots").length;
  data.push(snaps > 20000 ? warn(`${snaps} snapshots`, "factory prune") : ok(`${snaps} velocity snapshots`));

  const lastCollect = rows("jobruns").filter((j) => j.job === "collect").sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!lastCollect) data.push(warn("radar has never run", "factory radar"));
  else {
    const hrs = Math.round((Date.now() - new Date(lastCollect.startedAt).getTime()) / 36e5);
    data.push(hrs > 48 ? warn(`last collect was ${hrs}h ago — trend data is stale`, "factory worker (keeps it fresh automatically)") : ok(`trends fresh (collected ${hrs}h ago)`));
  }
  groups.push({ name: "Data hygiene", checks: data });

  /* ---- 4. spend safety ---- */
  const money = [];
  const today = new Date().toISOString().slice(0, 10);
  const quota = rows("quota").filter((r) => r.date === today).reduce((a, r) => a + r.units, 0);
  const cap = Number(process.env.YT_DAILY_UNIT_CAP || 8000);
  money.push(quota > cap * 0.9 ? warn(`YouTube quota at ${quota}/${cap} today`, "jobs will skip when exhausted — this is by design") : ok(`YouTube quota ${quota}/${cap} today`));
  const spend = rows("costledger").filter((r) => (r.at || "").slice(0, 10) === today).reduce((a, r) => a + r.amount, 0);
  money.push(ok(`AI spend today $${spend.toFixed(2)}`));
  const autoPublish = process.env.PUBLISH_MODE === "auto" && process.env.YOUTUBE_APP_VERIFIED === "true";
  money.push(autoPublish ? warn("AUTO-PUBLISH is ON — uploads go public without a tap", "unset PUBLISH_MODE to return to staged") : ok("publishing is staged (private-first) — the safe default"));
  groups.push({ name: "Spend & safety", checks: money });

  /* ---- 5. self-improvement loop ---- */
  const loop = [];
  const posts = rows("myposts").filter((m) => (m.statsSnapshots || []).length);
  const real = posts.filter((m) => !m.seed && !m.seedSignal);
  loop.push(real.length >= 20 ? ok(`${real.length} real posts — calibration auto-tuning is active`) : warn(`only ${real.length} real published post(s) — auto-tuning needs 20`, "publish; seeded rows don't count"));
  const lessons = rows("lessons").filter((l) => l.active).length;
  loop.push(lessons ? ok(`${lessons} active lessons feeding generation`) : warn("no lessons distilled yet", "factory lessons distill"));
  groups.push({ name: "Self-improvement", checks: loop });

  return { groups, tiers: cfg.aiTiers || {}, serviceTiers: cfg.serviceTiers || {} };
}

export async function printHealth() {
  const { groups } = await health();
  const icon = { ok: "+", warn: "!", bad: "x" };
  let bads = 0;
  let warns = 0;
  console.log("");
  for (const g of groups) {
    console.log(`${g.name}`);
    for (const c of g.checks) {
      if (c.level === "bad") bads++;
      if (c.level === "warn") warns++;
      console.log(`  ${icon[c.level]} ${c.m}`);
      if (c.fix && c.level !== "ok") console.log(`      -> ${c.fix}`);
    }
    console.log("");
  }
  console.log(bads ? `${bads} blocking issue(s), ${warns} warning(s)` : warns ? `healthy, ${warns} warning(s)` : "all green");
  return bads === 0;
}
