import { loadEnv } from "../../shared/src/config.js";
import { withJobRun } from "../../shared/src/jobs.js";

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

  const youtubeTick = async () => {
    console.log(`[${stamp()}] tick: youtube + wishlist tracking`);
    const { hasKey, trending, nicheHeat } = await import("../../radar/src/youtube.js");
    const { pollTracked } = await import("../../studio/src/wishlist.js");
    if (hasKey()) {
      await guard("yt-trending", () => withJobRun("yt-trending", () => trending()));
      await guard("yt-heat", () => withJobRun("yt-heat", () => nicheHeat()));
    } else {
      console.log("  (no YOUTUBE_API_KEY — youtube ticks idle)");
    }
    const r = await pollTracked();
    if (r.polled) console.log(`  wishlist tracking: ${r.polled} updated`);
  };

  const deepTick = async () => {
    console.log(`[${stamp()}] tick: deep refresh (github + watchlist)`);
    const { runRadar } = await import("../../radar/src/radar.js");
    await runRadar({ github: true });
    const { hasKey, refreshWatchlist } = await import("../../radar/src/youtube.js");
    if (hasKey()) await guard("yt-watchlist", () => withJobRun("yt-watchlist", () => refreshWatchlist()));
  };

  const digestTick = async () => {
    const { buildDigest } = await import("../../studio/src/digest.js");
    await withJobRun("digest", async () => {
      const d = buildDigest();
      console.log(`[${stamp()}] morning digest for ${d.date}: top ${d.top10.length}, risers ${d.overnightRisers.length}, unposted ${d.unposted.length}`);
      return d;
    });
  };

  // fire the fast lanes immediately so the system is warm from minute one
  await guard("collect", collectTick);
  await guard("youtube", youtubeTick);
  if (argv.includes("--digest-now")) await guard("digest", digestTick);

  setInterval(() => guard("collect", collectTick), collectMs);
  setInterval(() => guard("youtube", youtubeTick), youtubeMs);
  setInterval(() => guard("deep", deepTick), deepMs);

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
