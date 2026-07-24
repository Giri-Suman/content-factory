import { collection, newId } from "../../shared/src/store.js";

/**
 * P24 Seed Idea Bank (catalog 4.3): 50 ideas with pillar, format ref, and
 * hook pattern. Statuses start backlog. Deduped against existing titles.
 * The seed is fuel, not scripture — the Trend Engine + saturation gap
 * decide WHEN each idea fires.
 */

// [title, pillar, formatNum, hookPattern]
const A = "build", B = "tool-verdict", C = "explainer", D = "news-take";
const IDEAS = [
  ["WhatsApp birthday-wish bot — never forget again", A, 2, "Results First"],
  ["Excel report: 2 hours manual vs 11 seconds Python", A, 3, "Results First"],
  ["AI reads my email and drafts replies", A, 1, "Confession"],
  ["YouTube videos → auto Notion notes", A, 2, "Results First"],
  ["n8n workflow that finds freelance leads while I sleep", A, 1, "Open Loop"],
  ["Expense tracking from bank SMS, automated", A, 2, "Identity Call"],
  ["Scrape any price → Telegram alerts", A, 2, "List Tease"],
  ["Bot that applies to jobs for me — 30-day results", A, 25, "Open Loop"],
  ["Invoice generation + send, fully automated", A, 2, "Identity Call"],
  ["Meeting notes: record → transcribe → action items pipeline", A, 2, "Results First"],
  ["I automated my entire Instagram with Python", A, 26, "Confession"],
  ["Watch my AI agent burn $50 in 3 minutes — the 4-line fix", A, 1, "Open Loop"],
  ["Stop blindly installing MCP servers — your AI is leaking your file system", A, 8, "Mistake Warning"],
  ["AI QA agent that finds the bugs AI code created", A, 1, "Contrarian Strike"],
  ["Auto-organize any messy folder with 30 lines", A, 2, "Results First"],
  ["Screenshot → working code tool", A, 1, "Open Loop"],
  ["Git commits that write themselves (honest verdict)", A, 2, "Direct Question"],
  ["Browser bot fills every form for me", A, 1, "Identity Call"],
  ["Portfolio site that updates itself from GitHub", A, 2, "Results First"],
  ["My laptop works while I sleep: the full night-shift stack", A, 5, "Open Loop"],
  ["ChatGPT vs Claude vs Gemini: 50 Python prompts, scored", B, 7, "List Tease"],
  ["Claude Code vs Cursor: copilot vs full automation", B, 7, "Contrarian Strike"],
  ["n8n vs Make vs Zapier: same workflow, three builds", B, 7, "Direct Question"],
  ["Stop paying ₹4,000/mo — the free AI alternative", B, 4, "Contrarian Strike"],
  ["Local LLM vs cloud: my real cost test", B, 7, "Confession"],
  ["ElevenLabs vs the free clones: can you hear it?", B, 7, "Direct Question"],
  ["Rust secures what Python built — the demo", B, 7, "Contrarian Strike"],
  ["Best AI tool for freelancers: I tested the top 5", B, 4, "Identity Call"],
  ["I deleted 10,000 lines of React for one HTML file", B, 3, "Contrarian Strike"],
  ["The ₹0 automation stack: everything free, assembled", B, 4, "List Tease"],
  ["APIs explained like you're 5", C, 2, "Direct Question"],
  ["Webhooks in 45 seconds", C, 2, "Direct Question"],
  ["What MCP actually is (everyone says it wrong)", C, 8, "Contrarian Strike"],
  ["Embeddings: why AI \"understands\" anything", C, 14, "Direct Question"],
  ["Cron: the oldest automation still running the internet", C, 9, "Open Loop"],
  ["5 regex one-liners that replace whole scripts", C, 4, "List Tease"],
  ["Docker in 60 seconds, no jargon", C, 2, "Direct Question"],
  ["Async explained with a chai-stall analogy", C, 14, "POV/Relatable"],
  ["Vector databases: 45-second mental model", C, 2, "Direct Question"],
  ["Technical debt: why AI code costs you later — and the fix", C, 8, "Mistake Warning"],
  ["Spec-driven \"vibe coding\" done right (.cursorrules)", C, 2, "Identity Call"],
  ["Why your AI agent loops forever (and the kill switch)", C, 2, "Mistake Warning"],
  ["Weekly: 3 AI things that actually matter for builders", D, 18, "List Tease"],
  ["Series: Automation Autopsies — I dissect a viral automation claim", D, 8, "Contrarian Strike"],
  ["Series: Day X of automating my entire life", D, 5, "Confession"],
  ["Series: Steal This Script — one paste-ready script weekly", D, 2, "Results First"],
  ["Series: Feels Illegal — one underrated tool weekly", D, 1, "List Tease"],
  ["Content OS build series: the system that runs this channel", D, 26, "Open Loop"],
  ["30 days, N videos, the honest data", D, 25, "Confession"],
  ["My AI publishes while I sleep — full pipeline reveal", D, 5, "Open Loop"],
];

export function seedIdeas() {
  const bank = collection("ideabank");
  const existing = new Set(bank.all().map((i) => (i.title || "").toLowerCase()));
  let added = 0;
  let skipped = 0;
  for (const [title, pillar, formatNum, hookPattern] of IDEAS) {
    if (existing.has(title.toLowerCase())) {
      skipped++;
      continue;
    }
    bank.upsert({
      id: newId(),
      briefId: null,
      title,
      pillar,
      formatNum,
      hookPattern,
      effort: formatNum === 25 || formatNum === 26 ? "L" : [5, 11, 13, 23].includes(formatNum) ? "M" : "S",
      status: "backlog",
      score: 50,
      seeded: true,
      createdAt: new Date().toISOString(),
    });
    added++;
  }
  return { added, skipped, total: bank.count() };
}
