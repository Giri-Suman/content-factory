import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot } from "../../shared/src/config.js";
import { collection, newId } from "../../shared/src/store.js";

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

export function suggestEffects({ sceneType = "kinetic", niche = "coding", limit = 5, includeSpecs = false, includeOverlays = false } = {}) {
  const perf = effectPerformance();
  // measured scores live in the motionbench collection, NOT on the catalog
  // entry. Reading `e.attention` (which never existed) silently made the
  // measurement term a no-op — the whole point of benching, dead in one typo.
  const measuredById = Object.fromEntries(benchResults().map((b) => [b.effectId, b.attention]));

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

/* ------------------------------------------------------------------ */
/* measured attention — computed from real pixels, never guessed        */
/* ------------------------------------------------------------------ */

const ff = (args) => spawnSync("ffmpeg", args, { encoding: "utf8", windowsHide: true, timeout: 1000 * 60 * 5 });

/**
 * Renders-agnostic: give it any video and it reports the properties that
 * actually drive short-form retention. No claim about virality — these are
 * measurements, and each is named for what it is.
 */
export function measureAttention(videoFile, { role = "hook" } = {}) {
  if (!existsSync(videoFile)) throw new Error(`no such file: ${videoFile}`);

  const dur = Number(
    spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", videoFile], { encoding: "utf8", windowsHide: true }).stdout || 0
  );

  // 1. motion energy — frame-to-frame change. Dead frames lose viewers.
  const motion = ff(["-i", videoFile, "-vf", "fps=8,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"]);
  const mVals = [...(motion.stderr || "").matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  const motionEnergy = mVals.length ? mVals.reduce((a, b) => a + b, 0) / mVals.length : 0;

  // 2. first-2s change rate — the scroll-stop window specifically
  const firstVals = mVals.slice(0, 16);
  const openingEnergy = firstVals.length ? firstVals.reduce((a, b) => a + b, 0) / firstVals.length : 0;

  // 3. contrast — flat frames read as low-effort on a phone
  const stats = ff(["-i", videoFile, "-vf", "fps=2,signalstats,metadata=print:key=lavfi.signalstats.YDIF", "-f", "null", "-"]);
  const contrastVals = [...(stats.stderr || "").matchAll(/YDIF=([\d.]+)/g)].map((m) => Number(m[1]));
  const contrast = contrastVals.length ? contrastVals.reduce((a, b) => a + b, 0) / contrastVals.length : 0;

  // 4. loop seam — how close the last frame is to the first. Tight loops
  //    replay, and replays are watch time.
  let loopSeam = null;
  if (dur > 1.5) {
    const tmp = path.join(repoRoot, "data", "build", "_loopcheck");
    mkdirSync(tmp, { recursive: true });
    ff(["-y", "-v", "error", "-i", videoFile, "-vf", "select='eq(n\\,0)'", "-vframes", "1", path.join(tmp, "a.png")]);
    ff(["-y", "-v", "error", "-sseof", "-0.15", "-i", videoFile, "-vframes", "1", path.join(tmp, "b.png")]);
    const a = path.join(tmp, "a.png");
    const b = path.join(tmp, "b.png");
    if (existsSync(a) && existsSync(b)) {
      const diff = ff(["-i", a, "-i", b, "-filter_complex", "blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"]);
      const d = [...(diff.stderr || "").matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]))[0];
      if (d !== undefined) loopSeam = Math.round((1 - Math.min(1, d / 40)) * 100) / 100; // 1 = seamless
    }
  }

  // Ceilings are empirical, from rendering the catalog on this machine —
  // the first pass guessed 12/10/25 and every effect scored ~0.02 because
  // real YAVG deltas land in 0.05–1.4. Never guess a normalisation range.
  const norm = (v, ceiling) => Math.max(0, Math.min(1, v / ceiling));

  /**
   * Scored against the effect's ROLE, not on a single "more motion wins"
   * axis. An ambient background that scores low on motion is doing its job;
   * a hook that scores low is broken. Grading them on one scale was a
   * category error in the first version.
   */
  let attention, reading;
  if (role === "overlay") {
    // A chip on an empty frame tells you nothing. Report the raw numbers and
    // say so rather than inventing a score.
    attention = null;
    reading = "overlay — measured solo this is meaningless; judge it composited over real content";
  } else if (role === "ambient") {
    // wants a band: dead frames lose viewers, busy ones fight the foreground
    const band = motionEnergy < 0.12 ? motionEnergy / 0.12 : motionEnergy > 0.85 ? Math.max(0.3, 1 - (motionEnergy - 0.85) / 1.2) : 1;
    attention = Math.round((band * 0.5 + norm(contrast, 1.1) * 0.25 + (loopSeam ?? 0.8) * 0.25) * 100) / 100;
    reading =
      motionEnergy < 0.12
        ? "too static — reads as a still image behind your text"
        : motionEnergy > 0.85
          ? "busy — will compete with foreground copy"
          : attention >= 0.6
            ? "good ambient bed — alive but not distracting"
            : "usable, but flat contrast on a phone screen";
  } else {
    // hooks/type/transitions: the first 2s is the whole job
    attention = Math.round((norm(openingEnergy, 1.3) * 0.5 + norm(motionEnergy, 1.3) * 0.25 + norm(contrast, 1.1) * 0.25) * 100) / 100;
    reading =
      attention >= 0.6
        ? "high — stops a scroll"
        : attention >= 0.35
          ? "moderate — fine mid-video, weak as an opener"
          : "low — too quiet to hold a cold viewer";
  }

  return {
    file: path.basename(videoFile),
    role,
    durationSec: Math.round(dur * 10) / 10,
    openingEnergy: Math.round(openingEnergy * 100) / 100,
    motionEnergy: Math.round(motionEnergy * 100) / 100,
    contrast: Math.round(contrast * 100) / 100,
    loopSeam,
    attention,
    reading,
    caveat: "measured properties, not a virality prediction — retention correlation comes from YOUR posts",
  };
}

/* ------------------------------------------------------------------ */
/* learning: which effects actually work for YOU                        */
/* ------------------------------------------------------------------ */

/** Record which effects a published video used, so calibration can join it. */
export function tagPostEffects(myPostId, effectIds) {
  const posts = collection("myposts");
  const post = posts.get(myPostId);
  if (!post) throw new Error(`no MyPost ${myPostId}`);
  return posts.update(myPostId, { effects: [...new Set(effectIds)] });
}

/**
 * Effect → outcome, from your own posts. Returns {} until real data exists;
 * it never invents a ranking.
 */
export function effectPerformance() {
  const posts = collection("myposts").find((m) => (m.statsSnapshots || []).length && (m.effects || []).length);
  if (posts.length < 3) return {};
  const views = (m) => m.statsSnapshots.slice(-1)[0].views;
  const all = posts.map(views).sort((a, b) => a - b);
  const median = all[Math.floor(all.length / 2)] || 1;

  const byEffect = {};
  for (const p of posts) {
    for (const id of p.effects) {
      (byEffect[id] ??= []).push(views(p));
    }
  }
  const out = {};
  for (const [id, vals] of Object.entries(byEffect)) {
    const s = [...vals].sort((a, b) => a - b);
    const med = s[Math.floor(s.length / 2)];
    out[id] = { n: vals.length, median: med, ratio: Math.round((med / median) * 100) / 100 };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* preview rendering                                                    */
/* ------------------------------------------------------------------ */

const RENDERER = path.join(repoRoot, "renderers", "code-report");

/** Render a short sample of one effect so you can actually see it. */
export function renderPreview(effectId, { seconds = 4, text = "Motion Lab" } = {}) {
  loadEnv();
  const fx = getEffect(effectId);
  if (!fx) throw new Error(`unknown effect ${effectId} — see: factory motion list`);
  if (fx.impl !== "live") throw new Error(`"${fx.name}" is a spec, not implemented yet (impl: spec)`);

  const outDir = path.join(repoRoot, "renders", "_motion");
  mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${effectId}.mp4`);
  const propsPath = path.join(repoRoot, "data", "build", "_motion-props.json");
  mkdirSync(path.dirname(propsPath), { recursive: true });
  const frames = Math.round(seconds * 30);
  spawnSync("node", ["-e", `require('fs').writeFileSync(${JSON.stringify(propsPath)}, JSON.stringify({effect:${JSON.stringify(effectId)},text:${JSON.stringify(text)},totalFrames:${frames}}))`], { windowsHide: true });

  const res = spawnSync(
    `npx remotion render src/index.jsx EffectLab "${out}" --props="${propsPath}"`,
    { cwd: RENDERER, shell: true, stdio: "pipe", encoding: "utf8", timeout: 1000 * 60 * 10 }
  );
  if (res.status !== 0 || !existsSync(out)) {
    throw new Error(`preview render failed: ${(res.stderr || res.stdout || "").slice(-300)}`);
  }
  return { effectId, file: out, seconds };
}

/** Render + measure in one step, and remember the measurement. */
export function benchEffect(effectId, opts = {}) {
  const { file } = renderPreview(effectId, opts);
  const m = measureAttention(file, { role: roleFor(effectId) });
  const store = collection("effectbench");
  store.upsert({ id: effectId, effectId, ...m, at: new Date().toISOString() }, (r) => r.effectId);
  return { ...m, effectId, file };
}

export function benchResults() {
  return collection("effectbench").all().sort((a, b) => (b.attention || 0) - (a.attention || 0));
}
