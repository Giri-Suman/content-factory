import assert from "node:assert/strict";
import { calibrationView } from "../apps/mission-control/lib/calibration-view.js";
import { scoreTitle, scoreHook } from "../apps/mission-control/lib/title-score.js";
import { COMMANDS, CLOUD_RUNNABLE_KEYS, argvFor, keyOf } from "../packages/shared/src/commands.js";

const post = (id, count, extra = {}) => ({ id, statsSnapshots: [{ views: count }], ...extra });
const view = calibrationView([
  post("real1", 100, { predictedTier: "A", hookPattern: "question", pillar: "coding" }),
  post("real2", 200, { predictedTier: "S", hookPattern: "question", pillar: "math" }),
  post("demo", 100000, { predictedTier: "S", seed: true }),
]);
assert.equal(view.joins.n, 2, "demo posts must not enter calibration");
assert.equal(view.joins.overallMedian, 150);
assert.equal(view.scorecard.byTier.find((row) => row.tier === "S").median, 200);
const oneTier = calibrationView(Array.from({ length: 10 }, (_, index) => post(`only${index}`, 100 + index, { predictedTier: "B" })));
assert.match(oneTier.scorecard.tierHonest, /not enough tier spread/);

assert.equal(scoreTitle("You won't believe this").banned, true);
assert.equal(scoreTitle("How to automate Python in 5 minutes").mode, "heuristic");
assert.equal(scoreHook("How do you debug this?").pattern, "Direct Question");

for (const [key, input, expected] of [
  ["ideabank-brief", "idea123", ["ideabank", "brief", "idea123"]],
  ["wishlist-add", "https://youtu.be/abcdefghijk", ["wishlist", "add", "https://youtu.be/abcdefghijk"]],
  ["center-send", "brief123", ["center", "send", "brief123"]],
  ["cal-revert", "tuning123", ["calibrate", "revert", "tuning123"]],
  ["tools-stock-music", "upbeat", ["tools", "stock", "--music", "upbeat"]],
  ["tools-cta-next", "yt_short", ["tools", "cta", "next", "yt_short"]],
  ["catalog-comments", "", ["catalog", "comments"]],
]) {
  const row = COMMANDS.find((item) => keyOf(item) === key);
  assert.ok(row && CLOUD_RUNNABLE_KEYS.has(key), `${key} must be a cloud command`);
  assert.deepEqual(argvFor(row, input), expected);
}

console.log("Portal actions: calibration, scoring, and selected command routing passed");
