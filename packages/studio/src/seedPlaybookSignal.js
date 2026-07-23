import { collection, newId } from "../../shared/src/store.js";

/**
 * P22 acceptance seed: MyPosts where 31-40s videos strongly outperform, so
 * the playbook refresh proposes raising the yt_short length floor. Idempotent
 * (clears prior seedSignal rows).
 */
export function seedPlaybookSignal() {
  const posts = collection("myposts");
  const kept = posts.all().filter((p) => !p.seedSignal);
  const rows = [...kept];
  const now = Date.now();
  const add = (lengthSec, views, i) => {
    const postedMs = now - (48 + i * 10) * 36e5;
    rows.push({
      id: newId(), seedSignal: true, platform: "youtube", externalId: `sig${i}`,
      postedAt: new Date(postedMs).toISOString(), hookPattern: "Results First", pillar: "build",
      lengthSec, title: `signal post ${i}`, kind: "evergreen", predictedTier: "B", titleScore: 6,
      statsSnapshots: [{ at: new Date(postedMs + 48 * 36e5).toISOString(), views, likes: Math.round(views * 0.04), comments: Math.round(views * 0.006) }],
    });
  };
  // 35s band: strong (≈2× the shorter/longer)
  [36000, 42000, 38000, 45000, 40000, 39000].forEach((v, i) => add(33 + (i % 4), v, i));
  // ≤20s + >40s: weak baseline
  [16000, 14000, 18000, 15000].forEach((v, i) => add(i < 2 ? 15 : 55, v, i + 10));
  posts.save(rows);
  return { seeded: 10 };
}
