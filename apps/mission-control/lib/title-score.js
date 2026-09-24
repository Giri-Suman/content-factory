/** Instant, keyless title and hook scoring for the edge portal. */
const BANNED = /\b(wait for it|you won'?t believe|gone wrong|mind[- ]?blown|blow your mind|watch till the end|number \d+ will|shocking|insane trick)\b/i;
const TOOLS = /\b(ai|llm|claude|chatgpt|gpt|gemini|python|javascript|typescript|react|next\.?js|node|n8n|zapier|cursor|copilot|docker|linux|excel|api|mcp|ollama)\b/i;
const OUTCOME = /\b(\d+ ?(seconds?|minutes?|hours?|days?|lines?|files?|x)|[₹$€]\d|%|faster|cheaper|free|automat)\b/i;
const clamp = (value) => Math.max(0, Math.min(10, value));

function subScores(text) {
  const t = text.trim();
  let specificity = 3;
  if (/\d/.test(t)) specificity += 2;
  if (TOOLS.test(t)) specificity += 2;
  if (OUTCOME.test(t)) specificity += 2;
  if (t.length >= 28 && t.length <= 65) specificity += 1;
  let curiosityGap = 2;
  if (/\?|^(why|how|what|which)\b/i.test(t)) curiosityGap += 3;
  if (/\b(but|without|until|instead|nobody|wrong|myth|actually|hidden|quietly)\b/i.test(t)) curiosityGap += 2;
  if (/\b(here'?s (what|why|how)|the result|then this|so you don'?t have to)\b/i.test(t)) curiosityGap += 2;
  if (/\.\.\.|—/.test(t)) curiosityGap += 1;
  let identityCall = 2;
  if (/\b(you|your)\b/i.test(t)) identityCall += 3;
  if (/\b(developer|dev|coder|freelancer|beginner|engineer|creator)s?\b/i.test(t)) identityCall += 3;
  if (/^(stop|start|never|always|try|don'?t)\b/i.test(t)) identityCall += 2;
  return { specificity: clamp(specificity), curiosityGap: clamp(curiosityGap), identityCall: clamp(identityCall) };
}

function similarity(a, b) {
  const tokens = (text) => new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter((word) => word.length > 2));
  const left = tokens(a), right = tokens(b);
  if (!left.size || !right.size) return 0;
  return [...left].filter((word) => right.has(word)).length / Math.min(left.size, right.size);
}

export function scoreTitle(title, patterns = []) {
  const banned = BANNED.test(title);
  const scores = subScores(title);
  if (banned) for (const key of Object.keys(scores)) scores[key] = Math.min(scores[key], 2);
  const rewrites = {};
  if (scores.specificity < 6) rewrites.specificity = `Name the exact tool, count, time saved, or outcome in “${title.slice(0, 40)}”.`;
  if (scores.curiosityGap < 6) rewrites.curiosityGap = "State the surprising outcome, then leave the method to the video.";
  if (scores.identityCall < 6) rewrites.identityCall = "Name the viewer this helps, and use you or your.";
  const matches = patterns.map((pattern) => ({ template: pattern.template, avgOutlierRatio: pattern.avgOutlierRatio,
    sampleSize: pattern.sampleSize, sim: Math.max(similarity(title, pattern.template || ""), ...(pattern.exampleTitles || []).map((example) => similarity(title, example))) }))
    .filter((pattern) => pattern.sim > 0.15).sort((a, b) => b.sim - a.sim).slice(0, 3);
  const overall = Math.round((scores.specificity + scores.curiosityGap + scores.identityCall) / 3 * 10) / 10;
  return { title, overall, subScores: scores, rewrites, banned, mode: "heuristic", matches };
}

export function scoreHook(hook) {
  const banned = BANNED.test(hook);
  const text = hook.toLowerCase();
  const pattern = /\?$/.test(hook.trim()) || /^(why|how|what|did you|have you)\b/.test(text) ? "Direct Question"
    : /^\d+ |^(these|the) \d+|top \d+/.test(text) ? "List Tease"
      : /^(stop|never|don'?t)/.test(text) || /\b(mistake|ruin|danger)\b/.test(text) ? "Mistake Warning"
        : /^(i |my |we )/.test(text) ? "Results First"
          : /\b(everyone|nobody|actually|myth|overrated)\b/.test(text) ? "Contrarian Strike"
            : /\b(you|your)\b/.test(text) ? "Identity Call" : "Open Loop";
  const scores = subScores(hook);
  const score = banned ? 1 : Math.round((scores.specificity + scores.curiosityGap + scores.identityCall) / 3);
  const rewrite = score < 7 ? banned ? "Lead with the concrete payoff in the first two seconds." : "State the surprising outcome, then leave the method to the video." : null;
  return { hook, pattern, score, rewrite, banned, mode: "heuristic" };
}
