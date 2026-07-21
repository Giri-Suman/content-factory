import { collection, newId } from "../../shared/src/store.js";
import { HOOK_PATTERNS } from "../../studio/src/wishlist.js";
import { PILLARS } from "../../studio/src/ideaBank.js";

/**
 * P15 acceptance seed: 25 synthetic MyPosts with baked-in signal so the
 * calibration memo/tuning/scorecard have real structure to find:
 *   - "Confession" + "Results First" hooks overperform
 *   - 21-40s length overperforms
 *   - evening slot (18:00-21:00 IST) overperforms
 *   - higher predictedTier really does correlate with higher views
 * Snapshots build a 1h/6h/24h/48h velocity curve. Idempotent: clears
 * prior seeded rows (seed:true) first.
 */

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const STRONG_HOOKS = ["Confession", "Results First"];
const STRONG_LENGTHS = [28, 32, 35, 38];
const WEAK_LENGTHS = [12, 18, 75, 90];

const TITLES = [
  "I automated my invoices and saved 6 hours a week",
  "ChatGPT vs Claude: I ran 50 prompts",
  "Webhooks explained in 45 seconds",
  "This n8n workflow finds me freelance leads",
  "Why your AI agent loops forever (the fix)",
  "I deleted 10,000 lines of React for one HTML file",
  "Stop paying for Zapier — the free stack",
  "APIs explained like you're 5",
  "My AI reads my email and drafts replies",
  "Cursor vs Copilot: the honest verdict",
];

export function seedMyPosts(n = 25) {
  const posts = collection("myposts");
  const kept = posts.all().filter((p) => !p.seed);
  const rows = [...kept];
  const now = Date.now();

  for (let i = 0; i < n; i++) {
    const strongHook = Math.random() < 0.4;
    const hookPattern = strongHook ? pick(STRONG_HOOKS) : pick(HOOK_PATTERNS);
    const strongLen = Math.random() < 0.5;
    const lengthSec = Math.round(strongLen ? pick(STRONG_LENGTHS) : pick(WEAK_LENGTHS));
    const eveningSlot = Math.random() < 0.45;
    const ageH = rand(48, 400);
    const postedMs = now - ageH * 36e5;
    const posted = new Date(postedMs);
    // set an IST-evening hour for evening-slot posts (UTC ~13:00-16:00 = IST 18:00-21:00)
    if (eveningSlot) posted.setUTCHours(14, Math.floor(rand(0, 59)), 0, 0);
    else posted.setUTCHours(pick([2, 5, 8, 20, 22]), 0, 0, 0);

    // baked-in performance: base × hook × length × slot lift, plus noise
    const base = 8000;
    const lift = (strongHook ? 2.2 : 1) * (strongLen ? 1.8 : 1) * (eveningSlot ? 1.5 : 1) * rand(0.6, 1.4);
    const mature = Math.round(base * lift);

    // predictedTier that genuinely correlates with the outcome
    const tier = mature > 40000 ? "S" : mature > 22000 ? "A" : mature > 11000 ? "B" : "C";

    // build a velocity curve: views accumulate over the marks
    const marks = [1, 6, 24, 48];
    const statsSnapshots = marks
      .filter((mk) => mk <= ageH)
      .map((mk) => {
        const frac = mk === 1 ? 0.25 : mk === 6 ? 0.5 : mk === 24 ? 0.8 : 1;
        const views = Math.round(mature * frac);
        return { at: new Date(postedMs + mk * 36e5).toISOString(), views, likes: Math.round(views * 0.04), comments: Math.round(views * 0.006) };
      });

    rows.push({
      id: newId(),
      seed: true,
      publishItemId: null,
      platform: "youtube",
      externalId: `seed${i}`,
      postedAt: posted.toISOString(),
      hookPattern,
      hookText: null,
      pillar: pick(PILLARS),
      lengthSec,
      title: pick(TITLES),
      kind: Math.random() < 0.3 ? "trend" : "evergreen",
      predictedTier: tier,
      titleScore: Math.round(rand(3, 9) * 10) / 10,
      statsSnapshots,
    });
  }
  posts.save(rows);
  return { seeded: n, total: rows.length };
}
