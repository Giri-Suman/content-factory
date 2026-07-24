/**
 * Three-tier AI. Every AI feature in the factory picks a TIER, not a
 * provider — you choose how much each job is worth:
 *
 *   free     $0 forever. Ollama running locally, or OpenRouter ":free"
 *            models. Slower / smaller, but unlocks every AI feature.
 *   budget   cents per video. Haiku-class or cheap OpenRouter models.
 *            The right default for high-volume jobs (scoring, judging).
 *   premium  best results. Opus/Sonnet-class. Worth it for the few calls
 *            that decide quality: scripts, briefs, hooks.
 *
 * Per-task assignment lives in data/config.json (aiTiers), so you can run
 * free scoring + premium scripts — the economically correct split, since
 * scoring runs hundreds of times and scripts run once per video.
 *
 * Each tier is a CHAIN: the first configured, reachable option wins, and
 * a failure falls through to the next (including down a tier) so a dead
 * provider degrades instead of breaking the run.
 */

export const TIER_NAMES = ["free", "budget", "premium"];

/** Tasks that can be tier-assigned independently. */
export const TASKS = {
  score: { label: "Scoring & judging", volume: "high", note: "runs hundreds of times — cheapest tier saves the most" },
  script: { label: "Scripts & briefs", volume: "low", note: "a few calls per video — where premium actually pays" },
  analysis: { label: "Analysis & lessons", volume: "medium", note: "wishlist autopsies, memos, distillation" },
};

export const DEFAULT_TIERS = { score: "free", script: "budget", analysis: "free" };

/**
 * Ordered options per tier. `model` may be a function of env so users can
 * override any of them without touching code.
 */
export function tierChain(tier) {
  const env = process.env;
  const chains = {
    free: [
      { provider: "ollama", model: env.OLLAMA_MODEL || "llama3.2", needs: () => Boolean(env.OLLAMA_MODEL), costPerCall: 0, label: "Ollama (local)" },
      {
        provider: "openrouter",
        model: env.OPENROUTER_FREE_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
        needs: () => Boolean(env.OPENROUTER_API_KEY),
        costPerCall: 0,
        label: "OpenRouter :free",
      },
    ],
    budget: [
      {
        provider: "openrouter",
        model: env.OPENROUTER_BUDGET_MODEL || "google/gemini-2.0-flash-001",
        needs: () => Boolean(env.OPENROUTER_API_KEY),
        costPerCall: 0.0015,
        label: "OpenRouter budget",
      },
      {
        provider: "anthropic",
        model: env.ANTHROPIC_BUDGET_MODEL || "claude-haiku-4-5-20251001",
        needs: () => Boolean(env.ANTHROPIC_API_KEY),
        costPerCall: 0.004,
        label: "Claude Haiku",
      },
    ],
    premium: [
      {
        provider: "anthropic",
        model: env.ANTHROPIC_PREMIUM_MODEL || "claude-sonnet-5",
        needs: () => Boolean(env.ANTHROPIC_API_KEY),
        costPerCall: 0.03,
        label: "Claude Sonnet 5",
      },
      {
        provider: "openrouter",
        model: env.OPENROUTER_PREMIUM_MODEL || "anthropic/claude-sonnet-5",
        needs: () => Boolean(env.OPENROUTER_API_KEY),
        costPerCall: 0.035,
        label: "Sonnet via OpenRouter",
      },
    ],
  };
  return chains[tier] || chains.free;
}

/**
 * Full fallback order for a task: its tier first, then DOWN through the
 * cheaper tiers (never silently upgrade to a pricier tier than you chose).
 */
export function resolveChain(task, tiers = DEFAULT_TIERS) {
  const tier = TIER_NAMES.includes(tiers[task]) ? tiers[task] : DEFAULT_TIERS[task] || "free";
  const order = TIER_NAMES.slice(0, TIER_NAMES.indexOf(tier) + 1).reverse(); // chosen, then cheaper
  const chain = [];
  for (const t of order) {
    for (const opt of tierChain(t)) {
      if (opt.needs()) chain.push({ ...opt, tier: t });
    }
  }
  return { tier, chain };
}

/** What's actually usable right now, per tier — drives the Settings UI. */
export function tierAvailability() {
  return TIER_NAMES.map((tier) => {
    const options = tierChain(tier).map((o) => ({ label: o.label, provider: o.provider, model: o.model, ready: o.needs() }));
    return { tier, options, available: options.some((o) => o.ready) };
  });
}
