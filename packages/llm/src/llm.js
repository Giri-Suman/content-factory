/**
 * One chat() for every AI feature in the factory. Three providers:
 *
 *  anthropic   best quality (Claude). Scoring: haiku. Scripts: opus, adaptive thinking.
 *  openrouter  hundreds of models, one key (openrouter.ai). Cheap paid models and
 *              genuinely free ones (model ids ending in ":free").
 *  ollama      100% free, fully local (ollama.com). Zero API cost, needs a pulled model.
 *
 * Selection: LLM_PROVIDER in .env forces one; otherwise the first configured
 * provider wins in the order above. No provider at all -> callers fall back
 * to heuristics/templates, the factory never hard-fails.
 */

export function resolveProvider() {
  const forced = (process.env.LLM_PROVIDER || "").toLowerCase();
  if (["anthropic", "openrouter", "ollama"].includes(forced)) return forced;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.OLLAMA_MODEL) return "ollama";
  return null;
}

export function modelFor(task, provider = resolveProvider()) {
  switch (provider) {
    case "anthropic":
      return task === "script"
        ? process.env.ANTHROPIC_SCRIPT_MODEL || "claude-opus-4-8"
        : process.env.ANTHROPIC_SCORING_MODEL || "claude-haiku-4-5";
    case "openrouter":
      return (
        (task === "script" ? process.env.OPENROUTER_SCRIPT_MODEL : process.env.OPENROUTER_SCORING_MODEL) ||
        process.env.OPENROUTER_MODEL ||
        "openrouter/auto"
      );
    case "ollama":
      return process.env.OLLAMA_MODEL || "llama3.2";
    default:
      return null;
  }
}

export function providerStatus() {
  return {
    active: resolveProvider(),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    ollama: Boolean(process.env.OLLAMA_MODEL),
    scoringModel: modelFor("score"),
    scriptModel: modelFor("script"),
  };
}

/** Claude models where adaptive thinking is valid (4.6+ family). */
const ADAPTIVE_OK = /opus-4-[678]|sonnet-5|fable/;

async function anthropicChat({ system, user, maxTokens, task, model }) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const request = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  };
  if (task === "script" && ADAPTIVE_OK.test(model)) {
    request.thinking = { type: "adaptive" };
  }
  const response = await client.messages.create(request);
  if (response.stop_reason === "refusal") throw new Error("model declined this topic");
  return response.content.find((b) => b.type === "text")?.text || "";
}

async function openrouterChat({ system, user, maxTokens, model }) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      "HTTP-Referer": "https://coderfact.com",
      "X-Title": "content-factory",
    },
    signal: AbortSignal.timeout(300000),
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`openrouter: empty response (${JSON.stringify(data).slice(0, 200)})`);
  return text;
}

async function ollamaChat({ system, user, model }) {
  const base = process.env.OLLAMA_URL || "http://localhost:11434";
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(600000),
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status} — is ollama running? (ollama serve, then ollama pull ${model})`);
  const data = await res.json();
  if (!data.message?.content) throw new Error("ollama: empty response");
  return data.message.content;
}

/**
 * chat({ system, user, task: "score"|"script", maxTokens }) -> { text, provider, model }
 * Returns null when no provider is configured (caller falls back gracefully).
 */
export async function chat({ system, user, task = "score", maxTokens = 4000 }) {
  const provider = resolveProvider();
  if (!provider) return null;
  const model = modelFor(task, provider);
  const args = { system, user, maxTokens, task, model };
  const text =
    provider === "anthropic"
      ? await anthropicChat(args)
      : provider === "openrouter"
        ? await openrouterChat(args)
        : await ollamaChat(args);
  // P23 cost estimate (ollama = local = $0; skip logging then)
  if (provider !== "ollama") {
    try {
      const { logCost, COST } = await import("../../shared/src/cost.js");
      logCost(provider === "anthropic" || provider === "openrouter" ? "llm" : "llm", task === "script" ? COST.llmScript : COST.llmScore, { task, provider, videoId: globalThis.__factoryVideoId || null });
    } catch {
      /* cost logging is best-effort */
    }
  }
  return { text, provider, model };
}
