import { collection, newId } from "../../shared/src/store.js";

/**
 * P24 FormatRegistry — the Part-4.1 catalog as data. Lane routing, Idea
 * Bank rotation, and Brief Studio read from here instead of hardcoded
 * lists. autoPct is HONEST: machine share of effort after brief approval.
 */

// [id, name, lane, autoPct, compositionIds, platforms, cadenceWeight]
const CATALOG = [
  [1, "AI tool demo", "hybrid", 85, ["screenshot", "kinetic"], ["yt_short", "ig_reel"], 1.2],
  [2, "One-problem micro-tutorial", "synthetic", 95, ["code"], ["yt_short", "ig_reel"], 1.3],
  [3, "Before/after with numbers", "synthetic", 95, ["beforeafter"], ["yt_short", "ig_reel"], 1.1],
  [4, "Edutainment listicle", "synthetic", 100, ["stat", "kinetic"], ["yt_short", "ig_reel"], 0.9],
  [5, "Build-in-public episode", "capture", 60, [], ["yt_short", "ig_reel"], 1.0],
  [6, "Results-first reveal", "hybrid", 75, ["kinetic"], ["yt_short"], 1.0],
  [7, "VS battle / comparison", "synthetic", 90, ["splitcompare"], ["yt_short", "ig_reel"], 1.1],
  [8, "Contrarian myth-bust", "synthetic", 95, ["kinetic", "screenshot"], ["yt_short"], 1.0],
  [9, "Faceless b-roll + text", "synthetic", 100, ["kinetic"], ["yt_short", "ig_reel"], 0.6],
  [10, "Specific storytime", "synthetic", 85, ["kinetic"], ["yt_short"], 0.8],
  [11, "Speedrun / timelapse build", "capture", 60, [], ["yt_short"], 0.8],
  [12, "Reply-to-comment video", "synthetic", 85, ["code"], ["yt_short"], 0.9],
  [13, "Challenge with stakes", "capture", 50, [], ["yt_short"], 0.7],
  [14, "Question-hook explainer", "synthetic", 95, ["kinetic", "code"], ["yt_short", "ig_reel"], 1.2],
  [15, "Green-screen news commentary", "synthetic", 90, ["screenshot"], ["yt_short"], 0.8],
  [16, "Terminal ASMR loop", "synthetic", 100, ["terminal"], ["yt_short"], 0.3],
  [17, "Trend-twist", "hybrid", 70, ["kinetic"], ["yt_short"], 1.1],
  [18, "Weekly Builder's Brief", "synthetic", 95, ["screenshot", "stat"], ["yt_short"], 1.0],
  [19, "Math/algorithm visual", "synthetic", 90, [], ["yt_short"], 0.5],
  [20, "IG carousel", "synthetic", 100, ["carousel"], ["ig_carousel"], 1.0],
  [21, "Architecture/cheat-sheet diagram", "synthetic", 95, ["diagramcard"], ["ig_carousel", "pinterest"], 0.8],
  [22, "Stat/quote card", "synthetic", 100, ["stat"], ["ig_carousel"], 0.3],
  [23, "Deep tutorial 5-8min", "capture", 55, [], ["youtube_long"], 1.0],
  [24, "Tool verdict long-form", "hybrid", 70, ["splitcompare"], ["youtube_long"], 0.9],
  [25, "30-days-of-X documentary", "hybrid", 65, ["stat"], ["youtube_long"], 0.7],
  [26, "System build walkthrough", "capture", 55, [], ["youtube_long"], 0.9],
  [27, "Experiment post w/ data", "synthetic", 80, [], ["blog"], 0.9],
  [28, "Comparison/decision page", "synthetic", 75, [], ["blog"], 0.8],
  [29, "Deep tutorial with code", "hybrid", 70, [], ["blog"], 0.8],
  [30, "Template/resource post", "synthetic", 85, [], ["blog"], 0.7],
  [31, "Weekly newsletter", "synthetic", 90, [], ["newsletter"], 1.0],
  [32, "LinkedIn native post", "synthetic", 95, [], ["linkedin"], 1.0],
  [33, "X thread", "synthetic", 95, [], ["x"], 1.0],
  [34, "dev.to/Hashnode syndication", "synthetic", 100, [], ["blog"], 1.0],
];

export function ensureFormats() {
  const store = collection("formatregistry");
  for (const [num, name, lane, autoPct, compositionIds, platforms, cadenceWeight] of CATALOG) {
    store.upsert(
      { id: `fmt-${num}`, num, name, lane, autoPct, compositionIds, platforms, cadenceWeight, active: true },
      (r) => r.id
    );
  }
  return store.all();
}

export function getFormat(num) {
  ensureFormats();
  return collection("formatregistry").get(`fmt-${num}`) || null;
}

/** Lane for a format number — the orchestrator's registry-driven routing. */
export function laneForFormat(num) {
  const f = getFormat(num);
  return f ? (f.lane === "hybrid" ? "capture" : f.lane) : null; // hybrid needs a human clip -> capture flow
}
