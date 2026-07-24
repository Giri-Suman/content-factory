import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadEnv } from "../../shared/src/config.js";
import { withJobRun } from "../../shared/src/jobs.js";

const CLI = fileURLToPath(new URL("../bin/factory.js", import.meta.url));

/**
 * P8 worker — the long-running heartbeat (plain setInterval; the repo's
 * node-cron equivalent per the stack resolutions). Cadences:
 *   30 min  collect (reddit/hn/rss) -> score        [github excluded]
 *   60 min  YouTube trending + niche heat; wishlist tracking re-polls
 *   6 h     full collect incl. GitHub; watchlist refresh (recomputes outliers)
 *   08:00 IST daily  Morning Digest -> banner on Today
 * Every tick is try/caught and JobRun-logged; one failure never stops the loop.
 * `--fast` compresses cadences (90s / 2.5min / 5min) for live verification.
 */

const IST_OFFSET_MIN = 330;

const istNow = () => new Date(Date.now() + IST_OFFSET_MIN * 60 * 1000);
const stamp = () => new Date().toISOString().slice(11, 19);

async function guard(name, fn) {
  try {
    await fn();
  } catch (e) {
    console.error(`  [${stamp()}] ${name} FAILED: ${String(e.message || e).slice(0, 200)}`);
  }
}

export async function runWorker(argv = []) {
  loadEnv();
  const fast = argv.includes("--fast");
  const collectMs = fast ? 90e3 : 30 * 60e3;
  const youtubeMs = fast ? 150e3 : 60 * 60e3;
  const deepMs = fast ? 300e3 : 6 * 3600e3;

  console.log(`\nfactory worker up${fast ? " (FAST mode: 90s/2.5m/5m)" : ""} — ctrl-c to stop`);
  console.log(`  collect+score every ${collectMs / 60e3}m · youtube+tracking every ${youtubeMs / 60e3}m · deep refresh every ${deepMs / 60e3}m · digest 08:00 IST\n`);

  const collectTick = async () => {
    console.log(`[${stamp()}] tick: collect+score`);
    const { runRadar } = await import("../../radar/src/radar.js");
    await runRadar({ github: false });
  };

  const ranToday = async (jobName) => {
    const { collection } = await import("../../shared/src/store.js");
    const today = new Date().toISOString().slice(0, 10);
    return collection("jobruns").all().some((j) => j.job === jobName && j.ok && j.startedAt.slice(0, 10) === today);
  };

  const youtubeTick = async () => {
    console.log(`[${stamp()}] tick: youtube + wishlist tracking`);
    const { hasKey, trending, nicheHeat } = await import("../../radar/src/youtube.js");
    const { pollTracked } = await import("../../studio/src/wishlist.js");
    if (hasKey()) {
      await guard("yt-trending", () => withJobRun("yt-trending", () => trending()));
      // P12 budget pacing: niche heat costs ~600 units/pass — ONCE daily,
      // not hourly (hourly would burn 14k/day against the 8k cap). P16's
      // allocator formalizes this.
      if (await ranToday("yt-heat")) console.log("  (niche heat already ran today — budget pacing)");
      else await guard("yt-heat", () => withJobRun("yt-heat", () => nicheHeat()));
    } else {
      console.log("  (no YOUTUBE_API_KEY — youtube ticks idle)");
    }
    const r = await pollTracked();
    if (r.polled) console.log(`  wishlist tracking: ${r.polled} updated`);
  };

  const deepTick = async () => {
    console.log(`[${stamp()}] tick: deep refresh (github + watchlist cohort)`);
    const { runRadar } = await import("../../radar/src/radar.js");
    await runRadar({ github: true });
    const { hasKey, refreshWatchlist } = await import("../../radar/src/youtube.js");
    if (hasKey()) {
      await guard("yt-watchlist", () =>
        withJobRun("yt-watchlist", async () => {
          const r = await refreshWatchlist("yt-watchlist", { cohort: true });
          console.log(`  watchlist cohort: ${r.length} channel(s) refreshed`);
          return { refreshed: r.length };
        })
      );
    }
    // P22: monthly playbook refresh (proposals await manual approval)
    const { collection } = await import("../../shared/src/store.js");
    const pbStore = collection("playbookrefresh").all()[0];
    if (!pbStore || Date.now() - new Date(pbStore.at).getTime() > 30 * 864e5) {
      const { refreshPlaybooks } = await import("../../studio/src/playbooks.js");
      await withJobRun("playbook-refresh", async () => {
        const r = refreshPlaybooks();
        collection("playbookrefresh").save([{ id: "last", at: new Date().toISOString() }]);
        console.log(`[${stamp()}] playbook refresh: ${r.proposals} proposals, ${r.unverifiedSignals} signals`);
        return r;
      });
    }

    // weekly niche map (runs when the current one is 6+ days old)
    const current = collection("nichemap").all()[0];
    if (!current || Date.now() - new Date(current.at).getTime() > 6 * 864e5) {
      const { buildNicheMap } = await import("../../radar/src/explorer.js");
      await guard("niche-map", () =>
        withJobRun("niche-map", async () => {
          const m = await buildNicheMap();
          console.log(`  niche map: ${m.skipped || `${m.rising?.length} rising / ${m.gaps?.length} gaps`}`);
          return m;
        })
      );
    }
  };

  // P20: pace the synthetic lane to the configured cadence + warn on stale capture items
  const pacingTick = async () => {
    const { pacingPlan, board } = await import("../../pipeline/src/orchestrator.js");
    const plan = pacingPlan();
    if (plan.remaining > 0 && plan.queue.length) {
      const toProduce = plan.queue.slice(0, plan.remaining);
      for (const id of toProduce) {
        console.log(`[${stamp()}] pacing: auto-producing synthetic brief ${id} (${plan.producedToday + 1}/${plan.cadence} today)`);
        spawn("node", [CLI, "produce", id], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      }
    }
    const { alerts } = board();
    for (const a of alerts) console.log(`[${stamp()}] ⚠ stuck: ${a.topic.slice(0, 40)} — ${a.reason}`);
  };

  const digestTick = async () => {
    const { buildDigest } = await import("../../studio/src/digest.js");
    await withJobRun("digest", async () => {
      const d = buildDigest();
      console.log(`[${stamp()}] morning digest for ${d.date}: top ${d.top10.length}, risers ${d.overnightRisers.length}, unposted ${d.unposted.length}`);
      return d;
    });
    // P11: nightly title-pattern extraction rides the daily tick
    const { extractPatterns } = await import("../../studio/src/titleLab.js");
    await withJobRun("lab-extract", async () => {
      const r = await extractPatterns();
      console.log(`[${stamp()}] title patterns: ${r.skipped || `+${r.added} new, ${r.merged} merged`}`);
      return r;
    });
    // P13: keyword gap pass (autocomplete free; supply scoring self-budgets to 2200u/day)
    const { keywordGapPass } = await import("../../radar/src/keywords.js");
    await withJobRun("yt-kwgap", async () => {
      const r = await keywordGapPass();
      console.log(`[${stamp()}] keyword gap: ${r.scored} scored, ${r.unitsUsed}u used`);
      return r;
    });
    // P15: nightly my-channel stats ingestion (1 unit/post)
    const { ingestMyChannel } = await import("../../publish/src/calibration.js");
    await withJobRun("my-channel", async () => {
      const r = await ingestMyChannel();
      console.log(`[${stamp()}] my-channel: ${r.polled} polled${r.note ? ` (${r.note})` : ""}`);
      return r;
    });
    // P15: weekly memo + auto-tune, MONDAY only
    if (istNow().getUTCDay() === 1) {
      const cal = await import("../../publish/src/calibration.js");
      await withJobRun("memo", async () => {
        const m = await cal.weeklyMemo();
        console.log(`[${stamp()}] weekly memo: ${m.skipped || `n=${m.n}`}`);
        return m;
      });
      await withJobRun("auto-tune", async () => {
        const r = await cal.autoTune();
        console.log(`[${stamp()}] auto-tune: ${r.skipped || `${r.tuned} change(s)`}`);
        return r;
      });
      // P19: weekly lesson distillation (critiques + calibration -> lessons)
      const { distillLessons } = await import("../../studio/src/lessons.js");
      await withJobRun("distill", async () => {
        const r = await distillLessons();
        console.log(`[${stamp()}] lessons: +${r.added} new, ${r.merged} merged (${r.total} total)`);
        return r;
      });
      // P22: monthly playbook refresh (evidence-based)
      const { refreshPlaybooks } = await import("../../studio/src/playbooks.js");
      await withJobRun("playbook-refresh", async () => {
        const r = refreshPlaybooks();
        console.log(`[${stamp()}] playbooks: ${r.proposals} proposals, ${r.unverifiedSignals} signals quarantined`);
        return r;
      });
      // P24: weekly newsletter draft + comment mining
      const { composeNewsletter, mineComments } = await import("../../studio/src/composers.js");
      await withJobRun("newsletter", async () => composeNewsletter());
      await withJobRun("comment-miner", async () => mineComments());
    }
  };

  // fire the fast lanes immediately so the system is warm from minute one
  await guard("collect", collectTick);
  await guard("youtube", youtubeTick);
  if (argv.includes("--digest-now")) await guard("digest", digestTick);

  setInterval(() => guard("collect", collectTick), collectMs);
  setInterval(() => guard("youtube", youtubeTick), youtubeMs);
  setInterval(() => guard("deep", deepTick), deepMs);
  setInterval(() => guard("pacing", pacingTick), youtubeMs);

  // daily digest: check each minute for 08:00 IST, once per date
  let lastDigestDate = null;
  setInterval(() => {
    const ist = istNow();
    const date = ist.toISOString().slice(0, 10);
    if (ist.getUTCHours() === 8 && ist.getUTCMinutes() === 0 && lastDigestDate !== date) {
      lastDigestDate = date;
      guard("digest", digestTick);
    }
  }, 60e3);

  // keep the process alive forever
  await new Promise(() => {});
}
