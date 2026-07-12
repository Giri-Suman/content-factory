import { chat } from "../../llm/src/llm.js";

/**
 * Scores 0–100 = "how likely does a video on this go viral with this
 * category's audience". Uses whatever LLM provider is configured
 * (anthropic/openrouter/ollama); keyword+engagement heuristic otherwise,
 * so the radar works before any key exists.
 */

const KEYWORDS = [
  [/\b(gpt|claude|gemini|llama|mistral|deepseek|openai|anthropic)\b/i, 14],
  [/\b(ai|llm|agent|agentic|copilot)\b/i, 10],
  [/\b(released?|launch|announc|unveil|introduc|ships?)\b/i, 10],
  [/\b(open.?source|free|leak|breach|hack|vulnerabilit)\b/i, 9],
  [/\b(react|next\.?js|typescript|javascript|rust|python|node)\b/i, 7],
  [/\b(benchmark|vs\.?|versus|comparison|faster|beats)\b/i, 7],
  [/\b(deprecat|kill|shut(ting)? down|dead|end of)\b/i, 8],
  [/\b(framework|library|compiler|database|api)\b/i, 5],
  [/\b(proof|theorem|paradox|infinity|prime)\b/i, 7],
  [/\b(dupe|drugstore|viral|holy grail|routine|before.?after)\b/i, 7],
];

export function heuristicScore(item) {
  let score = Math.log10((item.points || 0) + 1) * 16 + Math.log10((item.comments || 0) + 1) * 8;
  for (const [re, boost] of KEYWORDS) if (re.test(item.title)) score += boost;
  if (item.published_at) {
    const ageH = (Date.now() - new Date(item.published_at).getTime()) / 36e5;
    if (ageH < 6) score += 14;
    else if (ageH < 24) score += 8;
    else if (ageH < 48) score += 3;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

const AUDIENCES = {
  coding: "working developers who watch fast, witty tech news",
  ai: "developers and AI enthusiasts following model releases and AI drama",
  math: "math-curious viewers who love visual proofs, paradoxes and 'wait, what?' facts",
  makeup: "beauty viewers who love technique breakdowns, dupes and honest reviews",
};

const SCORING_SYSTEM = `You score trending stories for short/medium YouTube videos. Each line is: id | category | source | engagement | title.

Audience per category:
${Object.entries(AUDIENCES)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

Score each story 0-100 for viral video potential with ITS OWN category's audience:
novelty, emotional charge (hype/drama/fear/wonder), meme potential, audience match,
and whether it supports a strong visual story. Household-name topics score high;
niche academic or enterprise-only stories score low.

Reply ONLY with a JSON array: [{"id":"...","score":0,"reason":"<8 words max>"}]`;

function extractJson(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("no JSON array in response");
  return JSON.parse(text.slice(start, end + 1));
}

export async function llmScore(items) {
  const scored = new Map();
  let provider = null;

  for (let i = 0; i < items.length; i += 40) {
    const batch = items.slice(i, i + 40);
    const listing = batch
      .map((t) => `${t.id} | ${t.category} | ${t.source} | ${t.points}pts/${t.comments}c | ${t.title}`)
      .join("\n");
    try {
      const result = await chat({ system: SCORING_SYSTEM, user: listing, task: "score", maxTokens: 4000 });
      if (!result) return null; // no provider configured at all
      provider = result.provider;
      for (const row of extractJson(result.text)) {
        if (row.id && typeof row.score === "number") {
          scored.set(row.id, {
            score: Math.max(0, Math.min(100, Math.round(row.score))),
            reason: String(row.reason || "").slice(0, 120),
          });
        }
      }
    } catch (err) {
      console.error(`  llm scoring batch failed (${err.message}) — falling back to heuristic`);
    }
  }
  return scored.size ? { scored, provider } : null;
}
