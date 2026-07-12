import Anthropic from "@anthropic-ai/sdk";

/**
 * Scores 0–100 = "how likely does a video on this go viral with a coding/AI
 * audience". Claude Haiku when ANTHROPIC_API_KEY is set (per the master plan:
 * Haiku for volume scoring); keyword+engagement heuristic otherwise, so the
 * radar works before any key exists.
 */

const SCORING_MODEL = process.env.ANTHROPIC_SCORING_MODEL || "claude-haiku-4-5";

const KEYWORDS = [
  [/\b(gpt|claude|gemini|llama|mistral|deepseek|openai|anthropic)\b/i, 14],
  [/\b(ai|llm|agent|agentic|copilot)\b/i, 10],
  [/\b(released?|launch|announc|unveil|introduc|ships?)\b/i, 10],
  [/\b(open.?source|free|leak|breach|hack|vulnerabilit)\b/i, 9],
  [/\b(react|next\.?js|typescript|javascript|rust|python|node)\b/i, 7],
  [/\b(benchmark|vs\.?|versus|comparison|faster|beats)\b/i, 7],
  [/\b(deprecat|kill|shut(ting)? down|dead|end of)\b/i, 8],
  [/\b(framework|library|compiler|database|api)\b/i, 5],
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

function extractJson(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("no JSON array in response");
  return JSON.parse(text.slice(start, end + 1));
}

export async function llmScore(items) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic();
  const scored = new Map();

  for (let i = 0; i < items.length; i += 40) {
    const batch = items.slice(i, i + 40);
    const listing = batch
      .map((t) => `${t.id} | ${t.source} | ${t.points}pts/${t.comments}c | ${t.title}`)
      .join("\n");
    try {
      const response = await client.messages.create({
        model: SCORING_MODEL,
        max_tokens: 4000,
        system:
          "You score trending tech stories for a YouTube channel about coding, AI, and dev tools " +
          "(fast, witty news-report format for developers). Score each story 0-100 for viral video " +
          "potential: novelty, emotional charge (hype/drama/fear), meme potential, audience match, " +
          "and whether it supports a strong visual story. Household-name AI/dev news scores high; " +
          "niche academic or enterprise-only stories score low. " +
          'Reply ONLY with a JSON array: [{"id":"...","score":0,"reason":"<8 words max>"}]',
        messages: [{ role: "user", content: listing }],
      });
      const text = response.content.find((b) => b.type === "text")?.text || "";
      for (const row of extractJson(text)) {
        if (row.id && typeof row.score === "number") {
          scored.set(row.id, {
            score: Math.max(0, Math.min(100, Math.round(row.score))),
            reason: String(row.reason || "").slice(0, 120),
          });
        }
      }
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw err;
      console.error(`  llm scoring batch failed (${err.message}) — falling back to heuristic`);
    }
  }
  return scored;
}
