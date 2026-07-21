import { collection, newId } from "../../shared/src/store.js";

/**
 * P19 acceptance seed: 30 fake Critiques with realistic recurring reasons
 * so distillation has patterns to find (banned openers, tiny captions,
 * dead air, weak titles). Idempotent: clears prior seeded rows.
 */

const PATTERNS = [
  { judge: "script", reasons: ['banned generic opener: "you won\'t believe"'], weight: 7 },
  { judge: "script", reasons: ["hook scene is too long — the payoff must land in the first ~2 seconds"], weight: 4 },
  { judge: "script", reasons: ["slow pacing — ~11s/scene; change the beat every ≤5-9s"], weight: 3 },
  { judge: "visual", reasons: ["captions at 30% scale — unreadable on mobile (floor 60%)"], weight: 5 },
  { judge: "visual", reasons: ["low resolution 720x1280"], weight: 2 },
  { judge: "metadata", reasons: ["weak title (3/10 via Title Lab)", "description missing or unfilled"], weight: 6 },
  { judge: "audio", reasons: ["dead air 2.7s (>1.5s)"], weight: 3 },
];

export function seedCritiques() {
  const store = collection("critiques");
  const kept = store.all().filter((c) => !c.seed);
  const rows = [...kept];
  let n = 0;
  const now = Date.now();
  for (const p of PATTERNS) {
    for (let i = 0; i < p.weight && n < 30; i++, n++) {
      rows.push({
        id: newId(),
        seed: true,
        artifactType: p.judge === "visual" || p.judge === "audio" ? "render" : p.judge,
        artifactId: `seed-brief-${n % 6}`,
        judge: p.judge,
        score: 40 + (i % 4) * 5,
        verdict: "fail",
        reasons: p.reasons,
        fixInstructions: null,
        mode: "heuristic",
        attempt: 1,
        createdAt: new Date(now - (n * 6 + Math.random() * 5) * 36e5).toISOString(),
      });
    }
  }
  store.save(rows);
  return { seeded: n, total: rows.length };
}
