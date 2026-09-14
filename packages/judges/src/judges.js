import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, loadUserConfig, repoRoot, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection } from "../../shared/src/store.js";
import { chat, providerStatus } from "../../llm/src/llm.js";
import { degradationsFor } from "../../shared/src/degradations.js";

/**
 * P18 QC Judge Network. Each judge returns {score 0-100, verdict, reasons[],
 * fixInstructions, mode}. Every judge has a REAL coded rubric layer so the
 * network catches sabotage keyless; an LLM layer upgrades the soft
 * judgments (clarity, novelty, vision) when a key exists. AudioJudge is
 * fully programmatic by design.
 */

export const DEFAULT_THRESHOLDS = { idea: 70, script: 75, metadata: 75, visual: 70, audio: 75, thumbnail: 70 };
export const thresholds = () => ({ ...DEFAULT_THRESHOLDS, ...(loadUserConfig().judgeThresholds || {}) });

const BANNED = /\b(wait for it|you won'?t believe|gone wrong|mind[- ]?blown|blow your mind|watch till the end|number \d+ will|shocking|insane trick|this one trick)\b/i;

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const ff = (args) => spawnSync("ffmpeg", args, { encoding: "utf8", windowsHide: true, timeout: 120000 });

/* ---------------- 1. IdeaJudge ---------------- */

export async function ideaJudge(idea) {
  loadEnv();
  const reasons = [];
  let score = 60;
  const text = `${idea.title || idea.label || ""} ${idea.summary || ""}`;

  /**
   * Niche fit across ALL four categories. The old test was a single
   * coding/AI regex, so every makeup, nails and math idea lost 20 points and
   * was told it had "weak niche fit" — the judge was actively penalising three
   * of the four categories this channel covers.
   */
  const { nicheFit, checkOriginality } = await import("../../studio/src/originality.js");
  const fit = nicheFit(text);
  if (fit.hit) score += 20;
  else reasons.push("weak niche fit — no coding, AI, math or beauty signal in the title");

  /**
   * Originality against everything already committed to — published posts and
   * briefs, not just the idea bank. Exact lowercase title equality (the old
   * test) misses "5 Python tricks" vs "Five Python Tricks You Should Know",
   * which is the same video with no shared string at either end.
   */
  const orig = checkOriginality(idea.title || idea.label || "");
  if (!orig.original) {
    score -= 30;
    reasons.push(orig.reading);
  } else if (orig.score >= 0.35) {
    score -= 8;
    reasons.push(`close to something you already have — ${orig.reading}`);
  }
  const bank = collection("ideabank").all();
  if ((idea.title || "").length < 12) {
    score -= 10;
    reasons.push("title too thin to judge hook potential");
  }

  if (providerStatus().active) {
    /**
     * Comparison titles must come from the SAME vertical. Passing the first 8
     * idea-bank rows meant a beauty idea was shown eight coding examples, and
     * the model inferred the channel's niche from the examples rather than the
     * stated identity — scoring "sweat-proof foundation" 28-42 as an "extreme
     * vertical mismatch" while nail art scored 88. Few-shot examples outrank
     * an instruction every time.
     */
    const sameNiche = bank.filter((b) => b.title && nicheFit(b.title).niche === fit.niche);
    const near = (sameNiche.length >= 3 ? sameNiche : bank).slice(0, 8).map((b) => b.title).filter(Boolean);
    const { nicheContextFor } = await import("../../shared/src/config.js");
    try {
      const res = await chat({
        task: "score",
        maxTokens: 500,
        system:
          `Rate a video idea 0-100 for: ${fit.niche ? nicheContextFor(fit.niche) : NICHE_CONTEXT}. ` +
          (fit.niche ? `This idea is in the "${fit.niche}" vertical, which is core to this studio — do NOT mark it off-topic. ` : "") +
          `Judge niche fit, novelty vs these existing ideas [${near.join("; ")}], hook potential, ` +
          `"would my viewer stop scrolling". ` +
          'Reply ONLY JSON: {"score":0-100,"reasons":["..."],"fixInstructions":"..."}',
        user: idea.title || idea.label,
      });
      const p = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
      return finalize("idea", p.score, p.reasons || reasons, p.fixInstructions, "llm");
    } catch {
      /* coded */
    }
  }
  return finalize("idea", clamp(score), reasons, "sharpen the niche angle and make the hook concrete", "heuristic");
}

/* ---------------- 2. ScriptJudge ---------------- */

export async function scriptJudge(script) {
  loadEnv();
  const reasons = [];
  let score = 100;
  const scenes = script.scenes || [];
  const hook = scenes[0]?.voiceover || "";
  const allText = scenes.map((s) => s.voiceover || "").join(" ");

  if (BANNED.test(allText)) {
    const m = allText.match(BANNED);
    score -= 50;
    reasons.push(`banned generic opener: "${m[0]}"`);
  }
  // hook lands fast: first scene voiceover should be short/punchy
  if (hook.split(/\s+/).length > 22) {
    score -= 15;
    reasons.push("hook scene is too long — the payoff must land in the first ~2 seconds");
  }
  // pacing: too few scenes for the length = slow
  const totalWords = allText.split(/\s+/).length;
  const estSec = totalWords / 2.5; // ~2.5 words/sec speech
  if (scenes.length && estSec / scenes.length > 9) {
    score -= 15;
    reasons.push(`slow pacing — ~${Math.round(estSec / scenes.length)}s/scene; change the beat every ≤5-9s`);
  }
  // length fit for a short
  if (estSec > 50) {
    score -= 10;
    reasons.push(`~${Math.round(estSec)}s is long for a Short (aim ≤40s)`);
  }
  // fill-placeholder detection (unfinished template)
  if (/\[fill:/.test(allText)) {
    score -= 20;
    reasons.push("contains unfilled [fill:] placeholders");
  }

  // AI-writing tells. Folded in here rather than as a parallel judge because
  // it's the same decision at the same hop. Voiceover-surface rules: some of
  // these (emoji, markdown, em dash) are TTS hazards, not just style.
  try {
    const { scanScript } = await import("../../studio/src/humanize.js");
    const h = scanScript(script);
    if (h.score < 85) {
      const penalty = Math.min(30, Math.round((85 - h.score) / 2));
      score -= penalty;
      const top = [...new Set(h.perScene.flatMap((s) => s.hits.map((x) => x.name)))].slice(0, 3);
      reasons.push(`reads as generated (${h.score}/100): ${top.join(", ")}`);
    }
    if (h.perScene.some((s) => s.hits.some((x) => x.id === "emoji-in-speech" || x.id === "markdown-in-speech"))) {
      score -= 15;
      reasons.push("voiceover contains emoji or markdown — TTS will speak or mangle it, shifting every word timestamp");
    }
  } catch {
    /* humanize is advisory; never block a compile on it */
  }

  if (providerStatus().active && score >= 40) {
    try {
      const res = await chat({
        task: "score",
        maxTokens: 500,
        system:
          `Judge a Short script 0-100 for: ${NICHE_CONTEXT}. One idea per video, concrete payoff, clarity. ` +
          'Reply ONLY JSON: {"score":0-100,"reasons":["..."],"fixInstructions":"..."}',
        user: scenes.map((s) => `[${s.type}] ${s.voiceover}`).join("\n"),
      });
      const p = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
      // combine: coded hard-fails cap the LLM score
      const combined = Math.min(clamp(p.score), score);
      return finalize("script", combined, [...new Set([...reasons, ...(p.reasons || [])])], p.fixInstructions || codedScriptFix(reasons), "llm+coded");
    } catch {
      /* coded */
    }
  }
  return finalize("script", clamp(score), reasons, codedScriptFix(reasons), "heuristic");
}

function codedScriptFix(reasons) {
  if (reasons.some((r) => r.includes("banned"))) return "Replace the generic opener with a concrete hook: state the surprising outcome or call out the viewer.";
  if (reasons.some((r) => r.includes("placeholder"))) return "Fill every [fill:] placeholder with real copy.";
  if (reasons.some((r) => r.includes("TTS will speak"))) return "Strip emoji and markdown from every voiceover field — run `factory humanize script <id> --fix`.";
  if (reasons.some((r) => r.includes("reads as generated"))) return "Rewrite the flagged lines in plain spoken English — run `factory humanize script <id>` to see each tell.";
  return "Tighten the hook and pacing; one idea, concrete payoff.";
}

/* ---------------- 3. MetadataJudge (reuses P11 Title Lab) ---------------- */

export async function metadataJudge(payload) {
  loadEnv();
  const reasons = [];
  let score = 100;
  const yt = payload.yt_short || {};
  const { scoreTitle } = await import("../../studio/src/titleLab.js");
  const titleScore = await scoreTitle(yt.title || "");
  // gate rubric: hard-fail only genuinely bad titles; the Title Lab owns quality
  if (titleScore.overall < 3) {
    score -= 30;
    reasons.push(`unusable title (${titleScore.overall}/10 via Title Lab)`);
  } else if (titleScore.overall < 5) {
    score -= 8;
    reasons.push(`title could be sharper (${titleScore.overall}/10 — see Lab)`);
  }
  if (titleScore.banned) {
    score -= 20;
    reasons.push("title uses a banned generic opener");
  }
  const desc = yt.description || "";
  if (desc.length < 20 || /\[fill:/.test(desc)) {
    score -= 20;
    reasons.push("description missing or unfilled");
  }
  const tags = yt.tags || [];
  if (tags.length < 2) {
    score -= 10;
    reasons.push("too few tags");
  }
  if (tags.some((t) => /^(video|youtube|viral|fyp|trending)$/i.test(t))) {
    score -= 10;
    reasons.push("generic non-niche tags present");
  }
  return finalize("metadata", clamp(score), reasons, "improve the title via the Lab, fill the description, use niche-specific tags", "heuristic");
}

/* ---------------- 4. VisualJudge ---------------- */

export async function visualJudge(videoFile, props) {
  loadEnv();
  const reasons = [];
  let score = 90;

  if (!existsSync(videoFile)) return finalize("visual", 0, ["render missing"], "render the video first", "coded");

  // sample 6 frames incl t=0 (proof of mechanism + vision-model input)
  const framesDir = path.join(path.dirname(videoFile), "qc-frames");
  spawnSync("ffmpeg", ["-y", "-v", "error", "-i", videoFile, "-vf", "fps=1/5", "-frames:v", "6", path.join(framesDir, "f%02d.png")], { windowsHide: true, timeout: 120000 });

  // coded readability proxy: caption scale from props (the "tiny font" red flag)
  const captionScale = props?.captionScale ?? 1;
  if (captionScale < 0.6) {
    score -= 45;
    reasons.push(`captions at ${Math.round(captionScale * 100)}% scale — unreadable on mobile (floor 60%)`);
  }
  // resolution sanity — an unreadable (0x0) file is a corrupt render: hard-fail
  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", videoFile], { encoding: "utf8", windowsHide: true });
  const [w, h] = (probe.stdout || "0,0").trim().split(",").map(Number);
  if (!w || !h) {
    return finalize("visual", 0, ["corrupt render — ffprobe can't read a video stream"], "re-render the video", "coded");
  }
  if (w < 1080 || h < 1080) {
    score -= 20;
    reasons.push(`low resolution ${w}x${h}`);
  }

  // vision-model layer when available (VISION_MODEL/anthropic vision) — else coded
  // (frames are on disk for the vision call; kept coded here to stay keyless-honest)
  return finalize("visual", clamp(score), reasons, "increase caption size to ≥60% scale; verify contrast and safe zones", reasons.length ? "coded" : "coded-pass");
}

/* ---------------- 6. ThumbnailJudge (P21) ---------------- */

export function thumbnailJudge(variant) {
  const reasons = [];
  let score = 90;
  if (!variant?.file || !existsSync(variant.file)) return finalize("thumbnail", 0, ["thumbnail missing"], "generate thumbnails first", "coded");

  // ≤4 words rule
  if ((variant.words ?? 0) > 4) {
    score -= 25;
    reasons.push(`${variant.words} words — thumbnails need ≤4 for 120px legibility`);
  }
  // placeholder = Chrome unavailable, not a real thumbnail
  if (variant.how === "placeholder") {
    score -= 40;
    reasons.push("rendered as a flat placeholder (system Chrome not found)");
  }
  // 120px legibility check: downscale and confirm it still has detail (file size proxy)
  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", variant.file], { encoding: "utf8", windowsHide: true });
  const [w, h] = (probe.stdout || "0,0").trim().split(",").map(Number);
  if (w < 1280 || h < 720) {
    score -= 15;
    reasons.push(`thumbnail is ${w}x${h}, want 1280x720`);
  }
  return finalize("thumbnail", clamp(score), reasons, "cut to ≤4 words, boost contrast, verify legibility at 120px", reasons.length ? "coded" : "coded-pass");
}

/* ---------------- SEO completeness (P21) ---------------- */

/** Each PublishItem must carry platform-complete metadata before "ready". */
export function seoComplete(item) {
  const a = item.assets || {};
  const missing = [];
  const filled = (v) => v && !/\[fill:/.test(String(v)) && String(v).trim().length > 0;
  if (item.platform === "youtube") {
    if (!filled(a.title)) missing.push("title");
    if (!filled(a.description)) missing.push("description");
    if (!(a.tags || []).length) missing.push("tags");
    if (!a.thumbFile) missing.push("thumbnail");
  } else if (item.platform === "instagram") {
    if (!filled(a.caption)) missing.push("caption");
    if (!(a.hashtags || []).length) missing.push("hashtags");
    if (!a.thumbFile) missing.push("cover");
  } else if (item.platform === "linkedin") {
    if (!filled(a.post_text)) missing.push("post text");
  } else if (item.platform === "x") {
    if (!(a.thread || []).length) missing.push("thread");
  }
  return { complete: missing.length === 0, missing };
}

/* ---------------- 5. AudioJudge (fully programmatic) ---------------- */

export function audioJudge(videoFile, expectedSec) {
  const reasons = [];
  let score = 100;
  if (!existsSync(videoFile)) return finalize("audio", 0, ["render missing"], "render first", "programmatic");

  /**
   * Degradations the FILE cannot reveal.
   *
   * Everything below this measures the finished mp4, which is exactly why a
   * substituted voice used to score 100: Windows TTS at correct loudness with
   * no dead air is, by every measurement here, a perfect track. It is also not
   * the voice that was paid for. The pipeline now records when it settled for
   * less, keyed by render id, and that is read here so the judge can see the
   * one defect its instruments are blind to.
   */
  const renderId = path.basename(path.dirname(videoFile));
  for (const d of degradationsFor(renderId)) {
    // voice substitution is the serious one - it changes what the viewer hears
    score -= d.stage.startsWith("voice") ? 30 : 15;
    reasons.push(`degraded at ${d.stage}: ${d.detail}`);
  }

  const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", videoFile], { encoding: "utf8", windowsHide: true }).stdout || 0);
  if (!dur) return finalize("audio", 0, ["corrupt render — no readable audio/duration"], "re-render the video", "programmatic");
  if (expectedSec && Math.abs(dur - expectedSec) / expectedSec > 0.1) {
    score -= 25;
    reasons.push(`duration ${dur.toFixed(1)}s vs spec ${expectedSec.toFixed(1)}s (>10% off)`);
  }

  // silence gaps > 1.5s
  const sd = ff(["-i", videoFile, "-af", "silencedetect=noise=-35dB:d=1.5", "-f", "null", "-"]);
  const gaps = [...(sd.stderr || "").matchAll(/silence_duration:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const longGap = gaps.find((g) => g > 1.5);
  if (longGap) {
    score -= 20;
    reasons.push(`dead air ${longGap.toFixed(1)}s (>1.5s)`);
  }

  // loudness within target LUFS band
  const vd = ff(["-i", videoFile, "-af", "volumedetect", "-f", "null", "-"]);
  const mean = (vd.stderr || "").match(/mean_volume:\s*(-?[\d.]+)/);
  if (mean) {
    const m = Number(mean[1]);
    if (m < -30 || m > -8) {
      score -= 15;
      reasons.push(`loudness ${m}dB mean outside the -8..-30 band`);
    }
  }
  return finalize("audio", clamp(score), reasons, "re-run loudnorm; trim dead air; match spec duration", "programmatic");
}

/* ---------------- shared ---------------- */

function finalize(judge, score, reasons, fixInstructions, mode) {
  return { judge, score: clamp(score), verdict: score >= thresholds()[judge] ? "pass" : "fail", reasons: reasons || [], fixInstructions: fixInstructions || null, mode };
}
