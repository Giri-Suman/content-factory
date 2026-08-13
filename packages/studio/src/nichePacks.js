import { collection } from "../../shared/src/store.js";

/**
 * Niche packs — the shot structure, hook patterns, and platform conventions
 * that differ by WHAT you're filming, not by who's filming it.
 *
 * The pipeline was built code-first, which left every demonstration niche
 * (makeup, nails, math-on-paper, cooking, fitness) with a generic "beat 1,
 * beat 2" shot list. Those niches have known, proven structures — a makeup
 * tutorial that skips the bare-face open loses the payoff; nail art without
 * a top-down closeup is unwatchable. This encodes them.
 *
 * Packs are DATA, so adding a niche never touches pipeline code.
 */

export const PACKS = {
  coding: {
    label: "Coding / dev",
    lane: "hybrid",
    shots: [
      { name: "the broken thing", sec: 3, note: "open ON the error/red test — never on your face" },
      { name: "the fix typing in", sec: 12, note: "screen record; zoom the changed lines" },
      { name: "it works", sec: 6, note: "green output, full frame" },
      { name: "the takeaway", sec: 5, note: "one sentence, why it matters" },
    ],
    hooks: ["Contrarian Strike", "Mistake Warning", "Results First"],
    captionStyle: "monospace for code words, high contrast",
    hashtags: ["#coding", "#webdev", "#programming"],
    pacing: "cut every 2-3s; never hold a static editor shot",
    gotcha: "font under 16pt is illegible on a phone — zoom, don't shrink",
  },
  "ai-automation": {
    label: "AI / automation",
    lane: "hybrid",
    shots: [
      { name: "the manual pain", sec: 4, note: "show the tedious version first, sped up" },
      { name: "the trigger", sec: 4, note: "one click / one command" },
      { name: "it runs itself", sec: 10, note: "screen capture of the automation working" },
      { name: "the receipt", sec: 6, note: "time or money saved, on screen as a number" },
    ],
    hooks: ["Results First", "Open Loop", "Confession"],
    captionStyle: "bold sans, numbers emphasized",
    hashtags: ["#aiautomation", "#ai", "#productivity"],
    pacing: "speed-ramp the boring middle 4-8x",
    gotcha: "always show the BEFORE cost or the payoff means nothing",
  },
  math: {
    label: "Math / algorithms",
    lane: "synthetic",
    shots: [
      { name: "the claim", sec: 3, note: "state the surprising result up front" },
      { name: "the build", sec: 18, note: "animate one step at a time — never a finished diagram" },
      { name: "the click", sec: 6, note: "the moment it becomes obvious" },
      { name: "the name", sec: 4, note: "name the theorem/person; invites the comment" },
    ],
    hooks: ["Direct Question", "Contrarian Strike", "Open Loop"],
    captionStyle: "large, centered, one clause at a time",
    hashtags: ["#math", "#maths", "#learning"],
    pacing: "hold each visual step 2-3s; silence is fine here",
    gotcha: "verify the maths before rendering — an error here is unrecoverable",
  },
  makeup: {
    label: "Makeup / beauty",
    lane: "capture",
    shots: [
      { name: "bare face + the promise", sec: 3, note: "show the starting point — skipping this kills the payoff" },
      { name: "product lay-down", sec: 3, note: "flat-lay or hand-held; names on screen" },
      { name: "application closeups", sec: 18, note: "tight on the eye/lip; hands out of the way of the light" },
      { name: "the reveal turn", sec: 5, note: "head turn or straight-to-camera, same lighting as the open" },
      { name: "before | after split", sec: 4, note: "hold it — this is the frame people screenshot" },
    ],
    hooks: ["Results First", "POV/Relatable", "Identity Call"],
    captionStyle: "clean sans, product names always spelled correctly",
    hashtags: ["#makeup", "#makeuptutorial", "#beauty", "#grwm"],
    pacing: "one product per cut; never cut mid-blend",
    gotcha: "lock white balance — auto-WB shifting between open and reveal destroys the before/after",
  },
  nails: {
    label: "Nail art",
    lane: "capture",
    shots: [
      { name: "bare nail + inspo", sec: 3, note: "the plan, stated in one line" },
      { name: "top-down base coat", sec: 4, note: "fixed overhead rig; hand flat" },
      { name: "the art, step by step", sec: 20, note: "macro; keep the same angle so steps read as progress" },
      { name: "top coat gloss", sec: 4, note: "the shine is the satisfaction beat" },
      { name: "hand pose reveal", sec: 5, note: "move the hand — motion sells the finish" },
    ],
    hooks: ["Results First", "POV/Relatable", "List Tease"],
    captionStyle: "small-caps step labels, bottom third",
    hashtags: ["#nailart", "#nails", "#naildesign", "#asmr"],
    pacing: "macro shots can hold 3-4s; the eye needs time at that magnification",
    gotcha: "a tripod is non-negotiable — handheld macro is unwatchable",
  },
  cooking: {
    label: "Cooking / food",
    lane: "capture",
    shots: [
      { name: "the finished dish", sec: 3, note: "open on the payoff, then rewind" },
      { name: "ingredients laid out", sec: 3, note: "names on screen; quantities in the caption" },
      { name: "the technique", sec: 16, note: "the one step people get wrong, in closeup" },
      { name: "the plate-up", sec: 5, note: "steam, sizzle, sauce — sensory beats" },
      { name: "the first bite", sec: 4, note: "reaction sells it" },
    ],
    hooks: ["Results First", "Mistake Warning", "POV/Relatable"],
    captionStyle: "warm, large, ingredient quantities visible",
    hashtags: ["#cooking", "#recipe", "#food"],
    pacing: "sound-first: let sizzle/chop carry cuts",
    gotcha: "shoot the finished dish FIRST, while it still looks hot",
  },
  fitness: {
    label: "Fitness / movement",
    lane: "capture",
    shots: [
      { name: "the wrong way", sec: 4, note: "show the common mistake — that's the hook" },
      { name: "the correct form", sec: 10, note: "side angle; full body in frame" },
      { name: "the cue", sec: 6, note: "one verbal cue that fixes it" },
      { name: "reps at speed", sec: 5, note: "prove it works in real time" },
    ],
    hooks: ["Mistake Warning", "Identity Call", "Contrarian Strike"],
    captionStyle: "bold, high contrast, readable while moving",
    hashtags: ["#fitness", "#form", "#training"],
    pacing: "hold form shots — cutting too fast hides the thing you're teaching",
    gotcha: "frame the whole joint you're talking about; cropped limbs teach nothing",
  },
};

export const NICHE_NAMES = Object.keys(PACKS);

export function getPack(niche) {
  return PACKS[niche] || null;
}

/** A shot list for a real brief, using the niche's proven structure. */
export function shotListFor(niche, brief = null) {
  const pack = getPack(niche);
  if (!pack) return null;
  const total = pack.shots.reduce((a, s) => a + s.sec, 0);
  return {
    niche,
    label: pack.label,
    lane: pack.lane,
    totalSec: total,
    shots: pack.shots.map((s, i) => ({ n: i + 1, ...s })),
    hooks: pack.hooks,
    pacing: pack.pacing,
    gotcha: pack.gotcha,
    hashtags: pack.hashtags,
    topic: brief?.topic || null,
  };
}

/** Remember which niche a creator actually works in (Settings/CLI sets it). */
export function activeNiches() {
  const cfg = collection("nicheconfig").all()[0];
  return cfg?.niches?.length ? cfg.niches : ["coding", "ai-automation"];
}

export function setActiveNiches(niches) {
  const valid = niches.filter((n) => PACKS[n]);
  if (!valid.length) throw new Error(`no valid niches in [${niches.join(", ")}] — pick from: ${NICHE_NAMES.join(", ")}`);
  collection("nicheconfig").save([{ id: "current", niches: valid, updatedAt: new Date().toISOString() }]);
  return valid;
}
