/**
 * MEASURE THE FOOTAGE, THEN CORRECT WHAT IS ACTUALLY WRONG.
 *
 * The pipeline used to apply one fixed grade to everything:
 *   eq=contrast=1.05:saturation=1.08:brightness=0.01
 *
 * That is a guess, and for makeup and nails it is a harmful one. autoedit.js
 * argues that beauty viewers are "evaluating the visible result of a product on
 * real skin" and blocks skin smoothing on those grounds — then pushed saturation
 * 8% on every frame. A lipstick or polish shade on screen was then not the shade
 * in the pan. Smoothing is at least visible if you look for it; a saturation
 * shift is not, which makes it the worse of the two.
 *
 * So: sample the video with ffmpeg's signalstats and derive corrections from
 * what is measured.
 *
 *   YAVG          mean luma 0-255       -> exposure
 *   UAVG / VAVG   chroma, 128 = neutral -> colour cast (U blue/yellow, V red/green)
 *   SATAVG        mean saturation       -> already vivid, or flat?
 *   YMIN / YMAX   range used            -> clipping and contrast headroom
 *
 * CONSERVATIVE ON PURPOSE. Over-correction is worse than none: a math short on a
 * black background measures YAVG 17 and is not underexposed — it is meant to be
 * dark. Every correction is bounded, and only fires past a threshold a person
 * would also call wrong.
 *
 * The beauty rule is absolute: correct TOWARDS accurate (white balance, exposure)
 * and never away from it (no saturation push). assertTrueColor enforces it so a
 * later edit cannot quietly reintroduce one — the same guarantee
 * assertNoSkinSmoothing gives for the other half of the same promise.
 */

import { spawnSync } from "node:child_process";

/** Verticals where colour fidelity IS the product, not a preference. */
const TRUE_COLOR = new Set(["beauty", "makeup", "nails"]);

/**
 * Sample the file and average the stats.
 *
 * One frame every few seconds is plenty — we want the overall character, and
 * decoding every frame of a 60-minute capture to compute an average would cost
 * more than the edit it is meant to inform.
 */
/**
 * signalstats reports in the source's NATIVE bit depth, not 0-255.
 *
 * A 10-bit file (yuv420p10le — what DJI, iPhone and most modern cameras shoot)
 * reports luma on 0-1023. Read as 8-bit that looks wildly overexposed: a real
 * DJI clip measured YAVG 559 and was reported as "559/255 overexposed", so the
 * grade darkened correctly-exposed footage by 6%. Everything downstream reasons
 * in 8-bit, so normalise here, once.
 */
function bitDepth(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=pix_fmt", "-of", "csv=p=0", file], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
  });
  const fmt = (r.stdout || "").trim();
  const m = fmt.match(/p(\d{1,2})(?:le|be)?$/);
  return m ? Number(m[1]) : 8;
}

export function analyzeFootage(file, { everySec = 3, maxSamples = 40 } = {}) {
  const depth = bitDepth(file);
  const scale = 255 / (2 ** depth - 1); // 8-bit -> 1.0, 10-bit -> 0.2492
  const res = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-vf", `fps=1/${everySec},signalstats,metadata=print:file=-`, "-f", "null", "-"],
    { encoding: "utf8", windowsHide: true, timeout: 1000 * 60 * 10, maxBuffer: 32 * 1024 * 1024 }
  );
  const text = `${res.stdout || ""}${res.stderr || ""}`;
  const grab = (key) =>
    [...text.matchAll(new RegExp(`lavfi\\.signalstats\\.${key}=([0-9.]+)`, "g"))]
      .map((m) => Number(m[1]))
      .filter(Number.isFinite)
      .slice(0, maxSamples);

  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const y = grab("YAVG");
  if (!y.length) return null; // analysis failed — the caller applies no grade

  const norm = (a) => {
    const v = avg(a);
    return v == null ? null : v * scale;
  };
  return {
    frames: y.length,
    depth,
    yavg: norm(y),
    ymin: norm(grab("YMIN")),
    ymax: norm(grab("YMAX")),
    uavg: norm(grab("UAVG")),
    vavg: norm(grab("VAVG")),
    satavg: norm(grab("SATAVG")),
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Turn measurements into an ffmpeg filter string plus human-readable notes.
 *
 * Returns { filter, notes, trueColor }. `filter` may be empty when the footage
 * needs nothing — a valid and common outcome, and better than inventing work.
 */
export function deriveGrade(stats, { vertical = "all" } = {}) {
  const trueColor = TRUE_COLOR.has(String(vertical).toLowerCase());
  const notes = [];
  const eqParts = [];
  const extraFilters = [];

  if (!stats) {
    return { filter: "", notes: ["could not analyse the footage — applying no grade"], trueColor };
  }

  /* ---- exposure ---------------------------------------------------------
     Nudge only when clearly off, and only part of the way there. A deliberately
     dark or bright scene must survive. eq's brightness is additive over -1..1,
     so small numbers go a long way. Below luma 25 we assume intent, not error. */
  const TARGET_Y = 112;
  /* 85, not 70: a clip measuring luma 70 is plainly dark, and the first
     threshold let it through as "fine". The 25 floor still protects footage
     that is dark on purpose (a Manim short on black measures ~17). */
  if (stats.yavg < 85 && stats.yavg > 25) {
    const lift = clamp(((TARGET_Y - stats.yavg) / 255) * 0.5, 0, 0.08);
    if (lift > 0.01) {
      eqParts.push(`brightness=${lift.toFixed(3)}`);
      notes.push(`underexposed (mean luma ${stats.yavg.toFixed(0)}/255) - lifted ${(lift * 100).toFixed(1)}%`);
    }
  } else if (stats.yavg > 170) {
    const cut = clamp(((stats.yavg - TARGET_Y) / 255) * 0.4, 0, 0.06);
    eqParts.push(`brightness=${(-cut).toFixed(3)}`);
    notes.push(`overexposed (mean luma ${stats.yavg.toFixed(0)}/255) - pulled down ${(cut * 100).toFixed(1)}%`);
  } else {
    notes.push(`exposure fine (mean luma ${stats.yavg.toFixed(0)}/255) - left alone`);
  }

  /* ---- contrast ---------------------------------------------------------
     Only when the footage genuinely fails to use its range. Material that
     already clips (YMAX at 255) must not be pushed further. */
  if (stats.ymax != null && stats.ymax < 225 && stats.ymin != null && stats.ymin > 20) {
    eqParts.push("contrast=1.06");
    notes.push(`flat range (${stats.ymin.toFixed(0)}-${stats.ymax.toFixed(0)}) - mild contrast added`);
  }

  /* ---- white balance: DELIBERATELY NOT DONE -----------------------------
     Automatic white balance was built here, measured, and removed. Two
     independent reasons, both found by testing rather than reasoning:

     1. ffmpeg's `colorbalance` was a NO-OP on this footage. Measured U/V were
        identical to one decimal across bm=0.06, 0.15 and 0.30 — a 5x strength
        range. The correction was being computed, printed in the notes, and
        changing nothing. A grade that reports work it did not do is worse than
        no grade.

     2. More importantly, the whole approach is wrong for this vertical.
        Auto-WB from frame averages is the grey-world assumption: that an
        average scene is neutral. A beauty close-up is not an average scene. A
        correctly lit, correctly balanced skin plate measures U 110 / V 150 —
        skin is genuinely warm, and 128/128 is grey. Pushing those to neutral
        drains the warmth out of accurate skin. Measured: the old code read
        correct skin as a "cast towards yellow" and prescribed
        rm=-0.175:bm=0.138, which would have greyed it.

     Correcting colour without a reference (a grey card, or knowing which pixels
     are skin) is guessing, and on the one vertical where colour IS the product,
     guessing is the thing to avoid. Exposure is still corrected below: luma has
     no such ambiguity. */
  notes.push(`white balance not auto-corrected (needs a reference; grey-world would grey out skin)`);

  /* ---- saturation -------------------------------------------------------
     THE ONE THAT MATTERS. Beauty never gets a boost at any measured value.
     Other verticals get one only when the footage is genuinely flat. */
  if (trueColor) {
    notes.push(`saturation NOT touched - ${vertical} footage, the shade on screen must match the product`);
  } else if (stats.satavg != null && stats.satavg < 40) {
    eqParts.push("saturation=1.08");
    notes.push(`low saturation (${stats.satavg.toFixed(1)}) - boosted 8%`);
  } else {
    notes.push(`saturation fine (${stats.satavg?.toFixed(1)}) - left alone`);
  }

  const chain = [eqParts.length ? `eq=${eqParts.join(":")}` : null, ...extraFilters].filter(Boolean).join(",");
  return { filter: chain, notes, trueColor };
}

/**
 * Hard gate for colour-critical verticals.
 *
 * Mirrors assertNoSkinSmoothing: a promise only holds if a later edit cannot
 * quietly break it. Throws rather than warns — a warning in a log is not a
 * guarantee, and this one has a buyer on the other end of it.
 */
export function assertTrueColor(filterChain, vertical) {
  if (!TRUE_COLOR.has(String(vertical).toLowerCase())) return true;
  const m = String(filterChain).match(/saturation\s*=\s*([0-9.]+)/);
  if (m && Number(m[1]) > 1.0) {
    throw new Error(
      `saturation=${m[1]} is not allowed on ${vertical} footage.\n` +
        `  The shade on screen has to match the shade in the pan - someone buys a product\n` +
        `  from this video. Correct white balance and exposure instead; do not push colour.`
    );
  }
  return true;
}
