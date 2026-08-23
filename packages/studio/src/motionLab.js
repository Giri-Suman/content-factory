import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot } from "../../shared/src/config.js";
import { collection, newId } from "../../shared/src/store.js";

/**
 * MOTION LAB — measuring and rendering the effects in the catalog.
 *
 * The catalog itself now lives in ./motionEffects.js, which has no node
 * imports so the Cloudflare portal can load it. Everything below needs ffmpeg
 * and the filesystem and is therefore laptop-only. The catalog is re-exported
 * so every existing importer of motionLab.js keeps working unchanged.
 */

export { FAMILY_ROLE, roleFor, EFFECTS, FAMILIES, getEffect } from "./motionEffects.js";
import { EFFECTS, getEffect, roleFor, suggestEffects as suggestPure } from "./motionEffects.js";

/** The catalog ranking, with this machine's measurements folded in. */
export const suggestEffects = (opts = {}) =>
  suggestPure({ ...opts, performance: effectPerformance(), benched: benchResults() });


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
  const posts = collection("myposts").find((m) => !m.seed && (m.statsSnapshots || []).length && (m.effects || []).length);
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

