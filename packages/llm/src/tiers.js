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

/* ==================================================================
 * The other three paid surfaces. Same three-tier contract as the LLM:
 * free is genuinely $0, budget is cents, premium is best-result — and
 * every one degrades DOWN to free rather than failing.
 * ================================================================== */

export const SERVICES = {
  voice: {
    label: "Voice",
    note: "free = Windows TTS (robotic but usable) · premium = YOUR cloned voice",
    tiers: {
      free: [{ id: "sapi", label: "Windows SAPI (local)", costPerChar: 0, needs: () => process.platform === "win32" }],
      budget: [
        { id: "eleven-flash", label: "ElevenLabs Flash", model: "eleven_flash_v2_5", costPerChar: 0.00005, needs: () => Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) },
      ],
      premium: [
        { id: "eleven-v2", label: "ElevenLabs multilingual v2 (your clone)", model: "eleven_multilingual_v2", costPerChar: 0.00018, needs: () => Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) },
      ],
    },
  },
  image: {
    label: "Thumbnails & images",
    note: "free = brand-tokened HTML (already excellent) · paid adds generated backgrounds",
    tiers: {
      free: [{ id: "html", label: "HTML + system Chrome", costPerImage: 0, needs: () => true }],
      budget: [{ id: "flux-schnell", label: "Flux schnell (fal.ai)", model: "fal-ai/flux/schnell", costPerImage: 0.003, needs: () => Boolean(process.env.FAL_KEY) }],
      premium: [{ id: "flux-pro", label: "Flux 1.1 pro (fal.ai)", model: "fal-ai/flux-pro/v1.1", costPerImage: 0.04, needs: () => Boolean(process.env.FAL_KEY) }],
    },
  },
  transcribe: {
    label: "Footage transcription",
    note: "all tiers run LOCALLY at $0 — the tier only trades speed for accuracy",
    tiers: {
      free: [{ id: "whisper-base", label: "whisper base (local)", model: "base", costPerMin: 0, needs: () => true }],
      budget: [{ id: "whisper-small", label: "whisper small (local, better)", model: "small", costPerMin: 0, needs: () => true }],
      premium: [{ id: "whisper-medium", label: "whisper medium (local, best)", model: "medium", costPerMin: 0, needs: () => true }],
    },
  },
};

export const DEFAULT_SERVICE_TIERS = { voice: "free", image: "free", transcribe: "free" };

/** Resolve a service to its usable option, degrading DOWN to free. */
export function resolveService(service, tiers = {}) {
  const spec = SERVICES[service];
  if (!spec) throw new Error(`unknown service ${service}`);
  const chosen = TIER_NAMES.includes(tiers[service]) ? tiers[service] : DEFAULT_SERVICE_TIERS[service];
  const order = TIER_NAMES.slice(0, TIER_NAMES.indexOf(chosen) + 1).reverse();
  for (const tier of order) {
    for (const opt of spec.tiers[tier] || []) {
      if (opt.needs()) return { ...opt, tier, service };
    }
  }
  return null;
}

/** Settings view for all non-LLM services. */
export function serviceAvailability() {
  return Object.entries(SERVICES).map(([service, spec]) => ({
    service,
    label: spec.label,
    note: spec.note,
    tiers: TIER_NAMES.map((tier) => ({
      tier,
      options: (spec.tiers[tier] || []).map((o) => ({ label: o.label, ready: o.needs() })),
      available: (spec.tiers[tier] || []).some((o) => o.needs()),
    })),
  }));
}
