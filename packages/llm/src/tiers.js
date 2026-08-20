import { assertCommercialSafe } from "../../shared/src/licenses.js";
import { loadEnv as loadEnvSync } from "../../shared/src/config.js";

/**
 * Four-tier AI. Every AI feature picks a TIER, not a provider — you choose
 * what each job is worth:
 *
 *   free    $0 forever. The best free model that ACTUALLY WORKS — chosen for
 *           reliability, not size, because OpenRouter's free pool is
 *           congested per-model and the popular models are the busy ones.
 *   cheap   best results per cent. Fractions of a cent per call; the right
 *           default for anything high-volume.
 *   medium  the balanced pick. Strong structured output and instruction
 *           following without frontier pricing.
 *   best    best results available, cost no object. For the few calls that
 *           decide quality: hooks, scripts, final copy.
 *
 * Per-task assignment lives in data/config.json (aiTiers), so free scoring +
 * best scripts is one config away — the economically correct split, since
 * scoring runs hundreds of times and a script runs once per video.
 *
 * Each tier is a CHAIN: first configured reachable option wins, and failures
 * fall through to the next — including DOWN a tier, never up. You are never
 * silently charged more than the tier you picked.
 *
 * Every model id below was verified present in OpenRouter's catalogue, with
 * its real price, at the time of writing. Ids ROT (two hardcoded defaults
 * 404'd within a year), so treat them as starting values and check
 * `factory ai models`.
 */

export const TIER_NAMES = ["free", "cheap", "medium", "best"];

/** Shown in the CLI and Settings so the choice is legible. */
export const TIER_META = {
  free: { label: "Free", cost: "$0", note: "best free model that actually works — reliability over size" },
  cheap: { label: "Cheap", cost: "~$0.0003/call", note: "best quality per cent; fine for high volume" },
  medium: { label: "Medium", cost: "~$0.009/call", note: "balanced — strong structured output, no frontier price" },
  best: { label: "Best", cost: "~$0.03/call", note: "best results available; for the calls that decide quality" },
};

/**
 * Older configs (and older docs) used budget/premium. Map them rather than
 * silently falling back to free, which would look like the setting was
 * ignored.
 */
const TIER_ALIASES = { budget: "cheap", premium: "best" };
export const canonicalTier = (t) => (TIER_NAMES.includes(t) ? t : TIER_ALIASES[t] || null);

/** Tasks that can be tier-assigned independently. */
export const TASKS = {
  score: { label: "Scoring & judging", volume: "high", note: "runs hundreds of times — cheapest tier saves the most" },
  script: { label: "Scripts & briefs", volume: "low", note: "a few calls per video — where premium actually pays" },
  analysis: { label: "Analysis & lessons", volume: "medium", note: "wishlist autopsies, memos, distillation" },
};

export const DEFAULT_TIERS = { score: "free", script: "cheap", analysis: "free" };

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
        // OpenRouter's free roster ROTATES — llama-3.3-70b:free was the default
        // here and now 404s "unavailable for free". Any hardcoded value goes
        // stale, so OPENROUTER_FREE_MODEL is the real setting and this is only
        // a starting guess. List current ones with `factory ai models`.
        //
        // Reliability matters more than raw capability here: the free pool is
        // shared across all OpenRouter users, so the POPULAR models are the
        // congested ones. gemma-4-31b measured 0/4 while gemma-4-26b measured
        // 4/4 — picking the bigger model made the tier look broken.
        model: env.OPENROUTER_FREE_MODEL || "google/gemma-4-26b-a4b-it:free",
        needs: () => Boolean(env.OPENROUTER_API_KEY),
        costPerCall: 0,
        label: "OpenRouter :free",
      },
      {
        // A second, different free model. Congestion is per-model, so one
        // alternate rescues far more runs than retrying the same busy model.
        provider: "openrouter",
        model: env.OPENROUTER_FREE_MODEL_2 || "nvidia/nemotron-3-nano-30b-a3b:free",
        needs: () => Boolean(env.OPENROUTER_API_KEY),
        costPerCall: 0,
        label: "OpenRouter :free (alt)",
      },
    ],
    // CHEAP — most results per cent. DeepSeek V4 Flash is $0.08/M in,
    // $0.18/M out: a capable reasoning model for ~3 hundredths of a cent per
    // call, which makes it the correct default for anything high-volume.
    cheap: [
      {
        /* xAI (Grok). A paid key that simply answers, versus OpenRouter's free
           pool which is per-model rate limited and runs out mid-run - a real
           edit fell back to heuristics with "Rate limit exceeded:
           free-models-per-day" and produced 0 filler cuts. Placed ahead of the
           paid OpenRouter options because it is one hop fewer. */
        provider: "xai",
        model: env.XAI_SCORING_MODEL || "grok-4-fast",
        needs: () => Boolean(env.XAI_API_KEY),
        costPerCall: 0.0004,
        label: "Grok 4 Fast (xAI)",
      },
      {
        provider: "openrouter",
        model: env.OPENROUTER_CHEAP_MODEL || env.OPENROUTER_BUDGET_MODEL || "deepseek/deepseek-v4-flash-0731",
        needs: () => Boolean(env.OPENROUTER_API_KEY),
        costPerCall: 0.0003,
        label: "DeepSeek V4 Flash",
      },
      {
        // even cheaper ($0.03/M in) — the floor before quality really drops
        provider: "openrouter",
        model: env.OPENROUTER_CHEAP_MODEL_2 || "qwen/qwen3.7-flash",
        needs: () => Boolean(env.OPENROUTER_API_KEY),
        costPerCall: 0.00015,
        label: "Qwen3.7 Flash",
      },
      {
        provider: "anthropic",
        model: env.ANTHROPIC_CHEAP_MODEL || "claude-haiku-4-5-20251001",
        needs: () => Boolean(env.ANTHROPIC_API_KEY),
        costPerCall: 0.004,
        label: "Claude Haiku",
      },
    ],
    // MEDIUM — the balanced pick. Gemini Flash is the strongest all-rounder
    // in this band for structured/JSON work, which is most of what the
    // factory asks for. Qwen3.7 Plus sits behind it at a fifth the price.
    medium: [
      {
        provider: "openrouter",
        model: env.OPENROUTER_MEDIUM_MODEL || "google/gemini-3.6-flash",
        needs: () => Boolean(env.OPENROUTER_API_KEY),
        costPerCall: 0.009,
        label: "Gemini 3.6 Flash",
      },
      {
        provider: "openrouter",
        model: env.OPENROUTER_MEDIUM_MODEL_2 || "qwen/qwen3.7-plus",
        needs: () => Boolean(env.OPENROUTER_API_KEY),
        costPerCall: 0.002,
        label: "Qwen3.7 Plus",
      },
    ],
    // BEST — cost no object. Opus 5 leads; Sonnet 5 is the near-frontier
    // fallback at $2/M in, and is genuinely cheaper than Sonnet 4.6 was.
    best: [
      {
        provider: "anthropic",
        model: env.ANTHROPIC_BEST_MODEL || env.ANTHROPIC_PREMIUM_MODEL || "claude-opus-5",
        needs: () => Boolean(env.ANTHROPIC_API_KEY),
        costPerCall: 0.03,
        label: "Claude Opus 5 (direct)",
      },
      {
        provider: "openrouter",
        model: env.OPENROUTER_BEST_MODEL || env.OPENROUTER_PREMIUM_MODEL || "anthropic/claude-opus-5",
        needs: () => Boolean(env.OPENROUTER_API_KEY),
        costPerCall: 0.035,
        label: "Claude Opus 5",
      },
      {
        provider: "openrouter",
        model: env.OPENROUTER_BEST_MODEL_2 || "anthropic/claude-sonnet-5",
        needs: () => Boolean(env.OPENROUTER_API_KEY),
        costPerCall: 0.014,
        label: "Claude Sonnet 5",
      },
    ],
  };
  return chains[canonicalTier(tier) || "free"] || chains.free;
}

/**
 * Full fallback order for a task: its tier first, then DOWN through the
 * cheaper tiers (never silently upgrade to a pricier tier than you chose).
 */
export function resolveChain(task, tiers = DEFAULT_TIERS) {
  const tier = canonicalTier(tiers[task]) || DEFAULT_TIERS[task] || "free";
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
 * The other three paid surfaces. Same four-tier contract as the LLM:
 * free is genuinely $0 and every tier degrades DOWN rather than failing.
 *
 * Not every surface has four real steps, and inventing one would be worse
 * than leaving a gap: voice and image have two paid products each, so
 * `medium` is deliberately absent and falls through to `cheap`. Transcribe
 * genuinely has four whisper sizes, so it uses all four.
 * ================================================================== */

export const SERVICES = {
  voice: {
    label: "Voice",
    note: "free = Windows TTS (robotic but usable) · best = YOUR cloned voice",
    tiers: {
      free: [{ id: "sapi", licenseId: "windows-sapi", label: "Windows SAPI (local)", costPerChar: 0, needs: () => process.platform === "win32" }],
      cheap: [
        { id: "eleven-flash", licenseId: "elevenlabs", label: "ElevenLabs Flash", model: "eleven_flash_v2_5", costPerChar: 0.00005, needs: () => Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) },
      ],
      // no `medium` — ElevenLabs has two products, not three
      best: [
        { id: "eleven-v2", licenseId: "elevenlabs", label: "ElevenLabs multilingual v2 (your clone)", model: "eleven_multilingual_v2", costPerChar: 0.00018, needs: () => Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) },
      ],
    },
  },
  image: {
    label: "Thumbnails & images",
    note: "free = brand-tokened HTML (already excellent) · paid adds generated backgrounds",
    tiers: {
      free: [{ id: "html", label: "HTML + system Chrome", costPerImage: 0, needs: () => true }],
      cheap: [{ id: "flux-schnell", licenseId: "flux.2-klein", label: "Flux schnell (fal.ai)", model: "fal-ai/flux/schnell", costPerImage: 0.003, needs: () => Boolean(process.env.FAL_KEY) }],
      best: [{ id: "flux-pro", licenseId: "flux.2-klein", label: "Flux 1.1 pro (fal.ai)", model: "fal-ai/flux-pro/v1.1", costPerImage: 0.04, needs: () => Boolean(process.env.FAL_KEY) }],
    },
  },
  transcribe: {
    label: "Footage transcription",
    note: "all tiers run LOCALLY at $0 — the tier only trades speed for accuracy",
    tiers: {
      free: [{ id: "whisper-base", licenseId: "faster-whisper", label: "whisper base (local)", model: "base", costPerMin: 0, needs: () => true }],
      cheap: [{ id: "whisper-small", licenseId: "faster-whisper", label: "whisper small (local, better)", model: "small", costPerMin: 0, needs: () => true }],
      medium: [{ id: "whisper-medium", licenseId: "faster-whisper", label: "whisper medium (local)", model: "medium", costPerMin: 0, needs: () => true }],
      best: [
        /* Groq FIRST when a key is present: the same large-v3 weights, seconds
           instead of ~2.9 hours for a 60-minute video on this 2-core CPU. It is
           the only option here that leaves the machine, so it requires an
           explicit key — it can never be reached by accident. */
        { id: "groq-large-v3", licenseId: "faster-whisper", label: "whisper large-v3 (Groq, fast, UPLOADS AUDIO)", model: "large-v3", costPerMin: 0, cloud: true, needs: () => Boolean(process.env.GROQ_API_KEY) },
        { id: "whisper-large", licenseId: "faster-whisper", label: "whisper large-v3 (local, best)", model: "large-v3", costPerMin: 0, needs: () => true },
      ],
    },
  },
};

export const DEFAULT_SERVICE_TIERS = { voice: "free", image: "free", transcribe: "free" };

/** Resolve a service to its usable option, degrading DOWN to free. */
/**
 * This repo does not auto-load `.env`; each entry point calls loadEnv() itself.
 * `needs()` predicates read process.env, so without this a perfectly good key is
 * invisible and the tier silently resolves to a lesser option — the same failure
 * R2 hit ("not configured" with a correct .env). Memoised: the answer cannot
 * change within a run.
 */
let _envLoaded = false;
function ensureEnv() {
  if (_envLoaded) return;
  _envLoaded = true;
  try {
    loadEnvSync();
  } catch {
    /* no .env is a supported state */
  }
}

export function resolveService(service, tiers = {}) {
  ensureEnv();
  const spec = SERVICES[service];
  if (!spec) throw new Error(`unknown service ${service}`);
  const chosen = canonicalTier(tiers[service]) || DEFAULT_SERVICE_TIERS[service];
  const order = TIER_NAMES.slice(0, TIER_NAMES.indexOf(chosen) + 1).reverse();
  for (const tier of order) {
    for (const opt of spec.tiers[tier] || []) {
      if (!opt.needs()) continue;
      // Licence gate. This system publishes monetised content, so a
      // non-commercial model must fail here — before a render is built on it —
      // rather than being discovered after the fact. Throws by design.
      if (opt.licenseId) assertCommercialSafe(opt.licenseId, { context: `${service} tier "${tier}"` });
      return { ...opt, tier, service };
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
