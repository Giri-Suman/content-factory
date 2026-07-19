import { withJobRun } from "../../shared/src/jobs.js";
import {
  hasKey, trending, nicheHeat, addChannel, refreshWatchlist, outliers,
  saturation, quotaUsedToday, estimateCycleUnits,
} from "./youtube.js";
import { collection } from "../../shared/src/store.js";

const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

export async function ytCommand(argv) {
  const [sub, ...args] = argv.filter((a) => !a.startsWith("--"));

  if (sub === "quota" || !sub) {
    const est = estimateCycleUnits();
    console.log(`\nquota used today: ${quotaUsedToday()} units (cap ${process.env.YT_DAILY_UNIT_CAP || 8000})`);
    console.log(`full-cycle estimate: trending ${est.trending} + niche heat ${est.nicheHeat} + watchlist ${est.watchlist} = ${est.total} units${est.total < 1500 ? " (< 1500 ✓)" : " (OVER 1500!)"}`);
    if (!hasKey()) console.log("\nno YOUTUBE_API_KEY in .env — all live features idle until you add one (free, Google Cloud Console)");
    if (!sub) console.log("\nusage: factory yt trending|heat|watch <handle>|refresh|outliers|saturation \"<topic>\"|quota");
    return true;
  }

  if (!hasKey() && sub !== "map" && sub !== "outliers") {
    // map + outliers read stored data only — they degrade on their own terms
    console.error("YOUTUBE_API_KEY missing in .env — get one free in Google Cloud Console (YouTube Data API v3)");
    return false;
  }

  try {
    switch (sub) {
      case "trending": {
        const r = await withJobRun("yt-trending", () => trending());
        console.log(`trending: ${r.videos} videos fetched, ${r.ingested} ingested into the trend store`);
        return true;
      }
      case "heat": {
        const r = await withJobRun("yt-heat", () => nicheHeat());
        console.log(`niche heat: ${r.keywords} keywords -> ${r.videos} videos, ${r.ingested} ingested`);
        return true;
      }
      case "watch": {
        if (!args[0]) {
          console.error("usage: factory yt watch <@handle | channel url | UC...id>");
          return false;
        }
        const ch = await withJobRun("yt-watchlist", () => addChannel(args[0]));
        console.log(`\nwatching ${ch.title} (${fmt(ch.subscriberCount)} subs)`);
        console.log(`  median views: ${fmt(ch.medianViews)} overall · ${fmt(ch.shortsMedianViews)} shorts · ${fmt(ch.longMedianViews)} long`);
        const top = collection("watchvideos")
          .find((v) => v.channelId === ch.id)
          .sort((a, b) => (b.outlierRatio || 0) - (a.outlierRatio || 0))
          .slice(0, 5);
        for (const v of top) console.log(`  ${String(v.outlierRatio ?? "?").padStart(5)}x  ${fmt(v.views).padStart(7)}  ${v.title.slice(0, 60)}`);
        return true;
      }
      case "refresh": {
        const results = await withJobRun("yt-watchlist", () => refreshWatchlist());
        for (const r of results) console.log(r.error ? `  ! ${r.channelId}: ${r.error}` : `  ok ${r.channelId} (${r.videos} videos, median ${fmt(r.medianViews)})`);
        return true;
      }
      case "outliers": {
        const rows = outliers();
        if (!rows.length) {
          console.log("no outliers ≥3x in the last 14 days (watchlist empty or quiet)");
          return true;
        }
        for (const v of rows.slice(0, 15)) console.log(`  ${String(v.outlierRatio).padStart(5)}x  ${fmt(v.views).padStart(7)}  [${v.channelTitle.slice(0, 18)}] ${v.title.slice(0, 52)}${v.isShort ? " (short)" : ""}`);
        return true;
      }
      case "discover": {
        if (!args[0]) {
          console.error('usage: factory yt discover "<seed keyword or channel>"');
          return false;
        }
        const { discoverChannels } = await import("./explorer.js");
        const r = await withJobRun("yt-discover", () => discoverChannels(args.join(" ")));
        console.log(`\n${r.candidates.length} candidates from ${r.searches} search calls (${r.searches * 100} units):`);
        for (const c of r.candidates.slice(0, 15)) {
          console.log(`  ${String(c.score).padEnd(5)} ${fmt(c.subscriberCount).padStart(7)}  ${c.title.slice(0, 40)}${c.watched ? "  (watched)" : ""}`);
        }
        return true;
      }
      case "map": {
        const { buildNicheMap } = await import("./explorer.js");
        const m = await withJobRun("niche-map", () => buildNicheMap());
        if (m.skipped) console.log(`skipped: ${m.skipped}`);
        else {
          console.log(`\nrising: ${m.rising.join(" · ")}\nfading: ${m.fading.join(" · ")}\ngaps:   ${m.gaps.join(" · ")}`);
        }
        return true;
      }
      case "saturation": {
        if (!args[0]) {
          console.error('usage: factory yt saturation "<topic phrase>"');
          return false;
        }
        const s = await saturation(args.join(" "));
        console.log(`"${s.topic}": ~${s.videoCount} videos in 48h, median views ${fmt(s.medianViews)} (sampled ${s.sampled})`);
        return true;
      }
      default:
        console.error(`unknown: factory yt ${sub}`);
        return false;
    }
  } catch (e) {
    console.error(e.message.startsWith("QUOTA_CAP") ? `⚠ ${e.message}` : `youtube error: ${e.message}`);
    return false;
  }
}
