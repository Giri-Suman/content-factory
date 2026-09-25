/** Edge-safe read model for the Calibration page. Synthetic demo posts never count. */
const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

const views = (post) => Number(post.statsSnapshots.at(-1)?.views) || 0;
const lengthBand = (seconds) => seconds == null ? "unknown" : seconds <= 20 ? "≤20s" : seconds <= 40 ? "21-40s" : seconds <= 60 ? "41-60s" : ">60s";
const slot = (iso) => {
  if (!iso) return "unknown";
  const hour = (new Date(iso).getUTCHours() + 5) % 24;
  return hour < 6 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
};

export function calibrationView(myposts) {
  const posts = myposts.filter((post) => !post.seed && Array.isArray(post.statsSnapshots) && post.statsSnapshots.length);
  const overallMedian = median(posts.map(views));
  const groupBy = (keyFor) => {
    const groups = new Map();
    for (const post of posts) {
      const key = keyFor(post);
      if (key == null) continue;
      groups.set(key, [...(groups.get(key) || []), views(post)]);
    }
    return [...groups].map(([key, values]) => ({ key, n: values.length, median: median(values),
      vsOverall: overallMedian ? Math.round(median(values) / overallMedian * 100) / 100 : null }))
      .sort((a, b) => b.median - a.median);
  };
  const tierRows = ["S", "A", "B", "C"].map((tier) => {
    const values = posts.filter((post) => post.predictedTier === tier).map(views);
    return { tier, n: values.length, median: values.length ? median(values) : null, reliable: values.length >= 3 };
  });
  const withTier = tierRows.reduce((sum, row) => sum + row.n, 0);
  const reliableTiers = tierRows.filter((row) => row.reliable);
  const medians = reliableTiers.map((row) => row.median);
  const monotonic = medians.every((value, index) => index === 0 || value <= medians[index - 1]);
  return {
    joins: { n: posts.length, overallMedian, byHook: groupBy((post) => post.hookPattern),
      byPillar: groupBy((post) => post.pillar), byLength: groupBy((post) => lengthBand(post.lengthSec)),
      bySlot: groupBy((post) => slot(post.postedAt)), byKind: groupBy((post) => post.kind) },
    scorecard: { n: posts.length, overallMedian, byTier: tierRows,
      tierHonest: withTier < 10 ? "not enough data yet (need 10+ posts with a predicted tier)"
        : reliableTiers.length < 2 ? "not enough tier spread to test the ranking (need 3+ real posts in at least two tiers)"
        : monotonic ? `calibrated — tiers rank correctly (${withTier} posts). Tiers with n<3 are still small samples.`
          : "MISCALIBRATED — higher tiers are not beating lower ones; the rubric needs review",
      titleScoreN: posts.filter((post) => typeof post.titleScore === "number").length },
  };
}
