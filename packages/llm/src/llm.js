/**
 * One chat() for every AI feature in the factory. Three providers:
 *
 *  anthropic   best quality (Claude). Scoring: haiku. Scripts: opus, adaptive thinking.
 *  openrouter  hundreds of models, one key (openrouter.ai). Cheap paid models and
 *              genuinely free ones (model ids ending in ":free").
 *  google      Gemini via AI Studio. Free tier with its OWN daily quota, separate
 *              from OpenRouter's shared free-models-per-day cap.
 *  ollama      100% free, fully local (ollama.com). Zero API cost, needs a pulled model.
 *
 * Selection: LLM_PROVIDER in .env forces one; otherwise the first configured
 * provider wins in the order above. No provider at all -> callers fall back
 * to heuristics/templates, the factory never hard-fails.
 */

export function resolveProvider() {
  const forced = (process.env.LLM_PROVIDER || "").toLowerCase();
  if (["anthropic", "openrouter", "ollama", "google"].includes(forced)) return forced;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.GEMINI_API_KEY) return "google";
  if (process.env.OLLAMA_MODEL) return "ollama";
  return null;
}

export function modelFor(task, provider = resolveProvider()) {
  switch (provider) {
    case "anthropic":
      // Opus 5 is current; 4.8 was a generation behind. This value is only
      // DISPLAYED (tiers.js does the real selection), but a status line that
      // names the wrong model is how a stale default survives unnoticed.
      return task === "script"
        ? process.env.ANTHROPIC_SCRIPT_MODEL || "claude-opus-5"
        : process.env.ANTHROPIC_SCORING_MODEL || "claude-haiku-4-5-20251001";
    case "openrouter":
      return (
        (task === "script" ? process.env.OPENROUTER_SCRIPT_MODEL : process.env.OPENROUTER_SCORING_MODEL) ||
        process.env.OPENROUTER_MODEL ||
        "openrouter/auto"
      );
    case "google":
      // AI Studio ids differ from OpenRouter's ("gemini-3.6-flash", not
      // "google/gemini-3.6-flash"). `factory ai gemini` lists what a key can use.
      return process.env.GEMINI_MODEL || "gemini-3.6-flash";
    case "ollama":
      return process.env.OLLAMA_MODEL || "llama3.2";
    default:
      return null;
  }
}

/**
 * `active` is the gate ~23 AI code paths check. It's true when ANY tier has
 * a usable option — so a purely local Ollama setup ($0) unlocks the entire
 * system exactly like a paid key would.
 */
export function providerStatus() {
  const anthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const openrouter = Boolean(process.env.OPENROUTER_API_KEY);
  const ollama = Boolean(process.env.OLLAMA_MODEL);
  const xai = Boolean(process.env.XAI_API_KEY);
  const google = Boolean(process.env.GEMINI_API_KEY);
  return {
    active: resolveProvider(),
    anthropic,
    openrouter,
    ollama,
    xai,
    google,
    // Gemini's free tier has its own quota, so it counts as a free path
    freeTierReady: ollama || openrouter || google,
    scoringModel: modelFor("score"),
    scriptModel: modelFor("script"),
  };
}

/**
 * Claude models where adaptive thinking is valid.
 *
 * The old pattern was `opus-4-[678]|sonnet-5|fable`, which matched Opus 4.6–4.8
 * but NOT `claude-opus-5` — so the newest and most capable model was the one
 * silently running without adaptive thinking. An enumerated version list fails
 * exactly this way every time the family increments; match the family and let
 * the version float instead.
 */
const ADAPTIVE_OK = /(opus|sonnet|fable)-(?:4-[678]|[5-9])/;

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

/**
 * xAI (Grok). OpenAI-compatible, so this mirrors openrouterChat almost exactly.
 *
 * WHY IT EARNS A SLOT: OpenRouter's free pool is per-model rate limited and runs
 * out — a real edit fell back to heuristics mid-run with
 * "Rate limit exceeded: free-models-per-day", producing 0 filler cuts and a
 * template brief. A paid key that simply answers is worth more than a free one
 * that answers most days.
 *
 * NOT to be confused with Groq (transcription). Different company, one letter
 * apart: xAI keys start `xai-`, Groq keys start `gsk_`.
 */
async function xaiChat({ system, user, maxTokens, model }) {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "content-type": "application/json",
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
  if (!res.ok) throw new Error(`xai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`xai: empty response (${JSON.stringify(data).slice(0, 200)})`);
  return text;
}

/**
 * Google AI Studio (Gemini), called directly rather than through OpenRouter.
 *
 * WHY DIRECT: OpenRouter's `:free` models share ONE account-wide
 * free-models-per-day budget. Once it trips every free option fails at once -
 * which is exactly what took the factory down - and swapping which `:free`
 * model is configured changes nothing, because the cap is on the account, not
 * the model. AI Studio has its own separate free quota, so this is a second
 * independent pool rather than another straw in the same glass.
 *
 * The wire format is not OpenAI-shaped: the system prompt is `systemInstruction`
 * rather than a message, and the reply is nested under candidates/content/parts.
 */
async function googleChat({ system, user, maxTokens, model }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    signal: AbortSignal.timeout(300000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    /* A retired model id is the failure this provider is most likely to hit,
       and "404" alone sends you hunting for a broken key. Name the fix. */
    const hint = res.status === 404 ? ' - run `factory ai gemini` to list ids this key can actually use' : "";
    throw new Error(`gemini ${res.status}: ${body}${hint}`);
  }

  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text).filter(Boolean).join("");
  if (!text) {
    /* An empty answer with finishReason SAFETY is a refusal, not an outage;
       saying so stops it being retried as a transient error. */
    const why = cand?.finishReason ? ` (finishReason ${cand.finishReason})` : "";
    throw new Error(`gemini: empty response${why} ${JSON.stringify(data).slice(0, 160)}`);
  }
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

const CALLERS = { anthropic: anthropicChat, openrouter: openrouterChat, ollama: ollamaChat, xai: xaiChat, google: googleChat };

/** Per-task tier assignment from data/config.json (Settings UI writes it). */
function configuredTiers() {
  try {
    // eslint-disable-next-line no-undef
    const { loadUserConfig } = globalThis.__factoryConfig || {};
    if (loadUserConfig) return loadUserConfig().aiTiers || {};
  } catch {
    /* fall through */
  }
  return {};
}

/**
 * chat({ system, user, task, maxTokens }) -> { text, provider, model, tier }
 *
 * Tier-driven: the task's tier decides which options to try, in order,
 * falling DOWN to cheaper tiers on failure (never up). Returns null only
 * when nothing at all is configured — callers then use their heuristic
 * fallback, exactly as before.
 */
export async function chat({ system, user, task = "score", maxTokens = 4000, tier: tierOverride }) {
  const { resolveChain } = await import("./tiers.js");
  let tiers = configuredTiers();
  if (!Object.keys(tiers).length) {
    try {
      const { loadUserConfig } = await import("../../shared/src/config.js");
      tiers = loadUserConfig().aiTiers || {};
    } catch {
      tiers = {};
    }
  }
  const taskKey = task === "script" ? "script" : task === "analysis" ? "analysis" : "score";
  const { chain } = resolveChain(taskKey, tierOverride ? { ...tiers, [taskKey]: tierOverride } : tiers);
  if (!chain.length) return null; // nothing configured — caller degrades

  const errors = [];
  for (const opt of chain) {
    try {
      const text = await withThrottleRetry(
        () => CALLERS[opt.provider]({ system, user, maxTokens, task, model: opt.model }),
        opt.label
      );
      if (!text) throw new Error("empty response");
      if (opt.costPerCall > 0) {
        try {
          const { logCost } = await import("../../shared/src/cost.js");
          logCost("llm", opt.costPerCall, { task, provider: opt.provider, tier: opt.tier, model: opt.model, videoId: globalThis.__factoryVideoId || null });
        } catch {
          /* cost logging is best-effort */
        }
      }
      return { text, provider: opt.provider, model: opt.model, tier: opt.tier };
    } catch (err) {
      errors.push(`${opt.label}: ${String(err.message).slice(0, 80)}`);
    }
  }
    /* Every option in and below the chosen tier failed. This used to log
       "using the built-in fallback" and return null - but there is no fallback,
       and 28 of the 30 callers dereference the result immediately. A daily rate
       limit therefore surfaced as `TypeError: Cannot read properties of null
       (reading 'text')` with a stack trace into llm internals, which tells the
       person waiting nothing at all.

       Throwing hands every one of those callers the real reason instead, and the
       two that deliberately degrade (radar/score, pipeline/clips) already wrap
       this in try/catch, so their behaviour is unchanged.

       NOTE the keyless path above still returns null: running with no keys at
       all is a supported $0 mode, not a failure. */
    throw new Error(`no AI option succeeded - ${errors.join(" | ")}`);
}

/**
 * Retry a throttled call before giving up on the option.
 *
 * The free tier is rate-limited hard — a bare `PIPELINE OK` probe needed three
 * attempts. Without this, a 429 threw, the chain found no cheaper option, and
 * the caller silently degraded to heuristics: the free tier looked configured
 * but behaved keyless, which is the exact failure mode it exists to escape.
 * `radar score` alone makes a call per batch of 120 items, so this is the
 * difference between the free tier being usable and being decorative.
 *
 * Only retries throttling/transient server errors. A 401 or 404 is a
 * configuration problem and must surface immediately, not after 90 seconds.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withThrottleRetry(fn, label, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err.message || "");
      const transient = /\b(429|502|503|504)\b/.test(msg) || /rate.?limit|too many requests|overloaded/i.test(msg);
      if (!transient || i === attempts - 1) throw err;
      const waitMs = 4000 * 2 ** i; // 4s, 8s
      console.error(`  ${label} throttled — retrying in ${waitMs / 1000}s (${i + 1}/${attempts - 1})`);
      await sleep(waitMs);
    }
  }
  throw lastErr;
}
