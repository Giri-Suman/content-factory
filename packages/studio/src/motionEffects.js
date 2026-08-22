/**
 * The motion-effect catalog — pure data and pure functions, no node APIs.
 *
 * Split out of motionLab.js so the Cloudflare portal can import it. motionLab
 * spawns ffmpeg and reads the filesystem at module scope, which a Worker cannot
 * load at all; the catalog itself is just a list and a ranking function, and the
 * /motion page needs exactly that much.
 *
 * motionLab.js re-exports everything here, so existing importers are unchanged.
 */


/**
 * MOTION LAB — the visual-effect catalog.
 *
 * Three deliberate design decisions, because two thirds of the obvious
 * version of this feature would be dishonest:
 *
 * 1. Effects are CODE WE OWN, never scraped designs. A crawler that lifts
 *    Dribbble/Awwwards/TikTok looks and re-renders them is plagiarism with
 *    extra steps, and it's the same reupload pattern the compliance layer
 *    exists to prevent. Every effect here is a parameterised generator.
 *
 * 2. "Is it generatable by code?" is therefore not a prediction — it's
 *    intrinsic. If it's in this catalog, it renders. What varies is COST,
 *    which we score honestly (render seconds, complexity, failure modes).
 *
 * 3. "Will it go viral?" cannot be predicted, by us or anyone. What CAN be
 *    measured is the thing virality actually depends on: whether the frame
 *    holds attention. So we render each effect and MEASURE it —
 *    motion energy, contrast, edge density, first-2-second change rate,
 *    loop seam. Those are computed from real pixels, not guessed. Then the
 *    calibration loop attaches YOUR retention to the effects you shipped,
 *    and after ~20 posts the ranking becomes yours instead of generic.
 */

/* ------------------------------------------------------------------ */
/* the catalog                                                         */
/* ------------------------------------------------------------------ */

/**
 * What an effect is FOR decides how it's graded. Benching the whole catalog
 * showed why this matters: tilt-parallax and macro-vignette scored 0.24/0.08
 * as "hooks" — but they're containers you put content inside, never openers.
 * Grading a frame you'd sit behind narration on a scroll-stopper scale just
 * measures the wrong thing loudly.
 */
export const FAMILY_ROLE = {
  ambient: "ambient",      // banded: alive, but must not fight the foreground
  dimensional: "ambient",
  type: "hook",            // the first 2s is the entire job
  transition: "hook",
  compare: "hook",         // before/after genuinely is a scroll-stopper format
  overlay: "overlay",      // UI furniture — meaningless measured on a blank frame
};
export const roleFor = (id) => FAMILY_ROLE[getEffect(id)?.family] || "hook";

// impl: "live" = a working renderer exists · "spec" = defined, not yet coded
// cost: approximate render seconds per second of output, on this machine
export const EFFECTS = [
  // ---- ambient backgrounds: carry a talking track or a quote ----
  { id: "aurora-mesh", name: "Aurora mesh", family: "ambient", impl: "live", cost: 1.4, loops: true,
    fits: ["kinetic", "quote", "hook"], niches: ["coding", "ai-automation", "math", "makeup", "nails"],
    note: "slow chromatic gradient drift; reads premium, never fights foreground text" },
  { id: "particle-field", name: "Particle constellation", family: "ambient", impl: "live", cost: 1.8, loops: true,
    fits: ["kinetic", "hook", "outro"], niches: ["coding", "ai-automation", "math"],
    note: "linked nodes; the 'AI/network' visual shorthand without being a cliché render" },
  { id: "code-rain", name: "Code rain", family: "ambient", impl: "live", cost: 1.6, loops: true,
    fits: ["kinetic", "terminal"], niches: ["coding", "ai-automation"],
    note: "use sparingly — high recognition, high cliché risk" },
  { id: "grain-noise", name: "Film grain wash", family: "ambient", impl: "live", cost: 0.9, loops: true,
    fits: ["quote", "kinetic", "screenshot"], niches: ["makeup", "nails", "cooking", "fitness"],
    note: "warm analog texture; flatters skin and product shots" },
  { id: "gradient-blob", name: "Morphing blob", family: "ambient", impl: "live", cost: 1.5, loops: true,
    fits: ["kinetic", "hook"], niches: ["makeup", "nails", "cooking"],
    note: "organic motion; pairs with beauty/lifestyle palettes" },
  { id: "cyber-grid", name: "Perspective grid", family: "ambient", impl: "spec", cost: 1.3, loops: true,
    fits: ["kinetic", "stat"], niches: ["coding", "ai-automation"],
    note: "retro-future floor grid receding to horizon" },

  // ---- kinetic type: the highest-retention family in short form ----
  { id: "word-punch", name: "Word punch", family: "type", impl: "live", cost: 0.7, loops: false,
    fits: ["kinetic", "hook"], niches: ["coding", "ai-automation", "math", "makeup", "nails", "cooking", "fitness"],
    note: "one word at a time, scale+weight punch on the beat — the workhorse" },
  { id: "text-mask", name: "Video-through-text", family: "type", impl: "live", cost: 1.1, loops: false,
    fits: ["hook", "outro"], niches: ["coding", "ai-automation", "makeup", "cooking"],
    note: "footage plays inside the letterforms; strong opener" },
  { id: "glitch-text", name: "Glitch type", family: "type", impl: "live", cost: 1.0, loops: false,
    fits: ["hook", "kinetic"], niches: ["coding", "ai-automation"],
    note: "RGB split + slice displacement; signals 'broken/hacked'" },
  { id: "odometer", name: "Odometer count", family: "type", impl: "live", cost: 0.8, loops: false,
    fits: ["stat", "hook"], niches: ["coding", "ai-automation", "math", "fitness"],
    note: "digits roll to the payoff number — built for Results-First hooks" },
  { id: "typewriter", name: "Typewriter", family: "type", impl: "spec", cost: 0.6, loops: false,
    fits: ["code", "terminal"], niches: ["coding", "ai-automation"],
    note: "character-by-character with a blinking caret" },

  // ---- transitions: cut energy between beats ----
  { id: "zoom-punch", name: "Zoom punch", family: "transition", impl: "live", wraps: true, cost: 0.5, loops: false,
    fits: ["any"], niches: ["all"],
    note: "fast scale-in on the cut; cheapest way to raise perceived pace" },
  { id: "whip-pan", name: "Whip pan", family: "transition", impl: "live", wraps: true, cost: 0.6, loops: false,
    fits: ["any"], niches: ["all"],
    note: "directional motion blur wipe; hides a hard cut" },
  { id: "light-sweep", name: "Light sweep", family: "transition", impl: "live", wraps: true, cost: 0.7, loops: false,
    fits: ["screenshot", "quote", "stat"], niches: ["all"],
    note: "specular band travels across; makes flat cards feel dimensional" },
  { id: "glitch-cut", name: "Glitch cut", family: "transition", impl: "spec", cost: 0.8, loops: false,
    fits: ["any"], niches: ["coding", "ai-automation"],
    note: "2-4 frame datamosh between beats" },

  // ---- dimensional ----
  { id: "tilt-parallax", name: "3D tilt parallax", family: "dimensional", impl: "live", wraps: true, cost: 1.2, loops: true,
    fits: ["screenshot", "quote", "stat"], niches: ["coding", "ai-automation", "makeup", "nails"],
    note: "layers separate on a slow orbit; makes a static asset feel shot" },
  { id: "depth-layers", name: "Depth layers", family: "dimensional", impl: "spec", cost: 1.4, loops: true,
    fits: ["screenshot", "hook"], niches: ["all"],
    note: "foreground/midground/background at different rates" },

  // ---- data ----
  { id: "bar-race", name: "Bar race", family: "data", impl: "spec", cost: 1.1, loops: false,
    fits: ["stat"], niches: ["coding", "ai-automation", "math", "fitness"],
    note: "ranked bars overtake over time; only honest with real series data" },
  { id: "line-draw", name: "Line draw-on", family: "data", impl: "spec", cost: 0.9, loops: false,
    fits: ["stat"], niches: ["math", "coding", "fitness"],
    note: "path animates in; good for a single trend line" },

  // ---- demonstration-niche specific (the gap the code-first build left) ----
  { id: "split-before-after", name: "Before | after wipe", family: "compare", impl: "live", cost: 0.8, loops: false,
    fits: ["screenshot", "hook"], niches: ["makeup", "nails", "fitness", "cooking"],
    note: "the single most screenshotted frame in beauty content" },
  // framing device, not a comparison — it holds a close shot, it doesn't open
  // one. Filed under `compare` originally; the bench graded it as a hook and
  // scored it 0.08, which said more about the label than the effect.
  { id: "macro-vignette", name: "Macro focus vignette", family: "dimensional", impl: "live", wraps: true, cost: 0.7, loops: true,
    fits: ["screenshot"], niches: ["nails", "makeup", "cooking"],
    note: "darkens edges, pulls the eye to the work — for close hand shots" },
  { id: "step-chip", name: "Step chip", family: "overlay", impl: "live", cost: 0.4, loops: false,
    fits: ["any"], niches: ["makeup", "nails", "cooking", "fitness", "coding"],
    note: "STEP 2/5 pill; the tutorial-retention device" },
];

export const FAMILIES = [...new Set(EFFECTS.map((e) => e.family))];
export const getEffect = (id) => EFFECTS.find((e) => e.id === id) || null;

/* ------------------------------------------------------------------ */
/* fit scoring — which effect suits THIS scene, in THIS niche           */
/* ------------------------------------------------------------------ */

/**
 * `performance` and `benched` are INJECTED rather than read here: both come from
 * the laptop's own measurements, which a Worker has no way to reach. Passing
 * empty ones degrades to the generic ranking instead of failing, which is the
 * honest answer when nothing has been measured yet. motionLab.js wraps this and
 * supplies the real values.
 */
export function suggestEffects({ sceneType = "kinetic", niche = "coding", limit = 5, includeSpecs = false, includeOverlays = false, performance = {}, benched = [] } = {}) {
  const perf = performance;
  // measured scores live in the motionbench collection, NOT on the catalog
  // entry. Reading `e.attention` (which never existed) silently made the
  // measurement term a no-op — the whole point of benching, dead in one typo.
  const measuredById = Object.fromEntries(benched.map((b) => [b.effectId, b.attention]));

  return EFFECTS.filter((e) => includeSpecs || e.impl === "live")
    // overlays compose ON TOP of a scene; they're never its motion treatment
    .filter((e) => includeOverlays || e.family !== "overlay")
    .map((e) => {
      const sceneFit = e.fits.includes("any") ? 0.75 : e.fits.includes(sceneType) ? 1 : 0.2;
      const nicheFit = e.niches.includes("all") ? 0.85 : e.niches.includes(niche) ? 1 : 0.2;
      // cost is a TIE-BREAKER, not a driver. At full weight it ranked a 0.4×
      // overlay above the effect that actually fitted the scene.
      const costFit = 0.9 + 0.1 * Math.max(0, 1 - (e.cost - 0.4) / 2.5);
      const measured = measuredById[e.id] ?? null;
      const mine = perf[e.id];
      // your own results outrank every heuristic once they exist
      const yours = mine && mine.n >= 3 ? mine.ratio : null;
      const score = yours
        ? Math.round(yours * 100) / 100
        : Math.round(sceneFit * nicheFit * costFit * (measured != null ? 0.75 + measured / 4 : 1) * 100) / 100;
      return {
        ...e,
        score,
        measured,
        basis: yours
          ? `your results (${mine.n} posts, ${yours}× median)`
          : measured != null
            ? `fit + measured attention ${measured} — not your data yet`
            : "fit heuristic — not benched, no results yet",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

