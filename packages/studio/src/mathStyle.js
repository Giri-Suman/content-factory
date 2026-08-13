import { NO_FABRICATION, noSlop } from "./promptKit.js";

/**
 * Prompt for LLM-written Manim scenes. The constraints are hard requirements
 * of this machine: no LaTeX installed (so no Tex/MathTex), vertical frame,
 * whitelisted mobjects/animations only, nothing that touches disk or network.
 */

export const MATH_GUIDE = `You write short viral math videos: a Manim CE (Community Edition) scene plus a voiceover. The viewer scrolls fast — wonder beats rigor, but never be wrong.

VIDEO FORMAT
- Vertical 1080x1920. The Manim frame is ~4.5 units wide and 8.0 units tall — keep all content inside x in [-2.0, 2.0], leave the top 1.5 units and bottom 1.5 units EMPTY (captions and title overlay there).
- Target 40-55 seconds of animation total (sum of run_times and waits).
- Background must be "#0d1117". Accent color "#ffb224". Text white or accent.
- The first 3 seconds must show the most surprising visual claim (the hook).

STAGE DISCIPLINE — the most common failure is text piling on top of text
Manim NEVER removes anything on its own. A mobject you added in beat 1 is still
on screen in beat 4 unless you explicitly remove it. Overlapping, unreadable
frames are almost always caused by ignoring this.
- Structure the scene as BEATS. At the end of each beat, remove everything that
  beat introduced and that the next beat does not need:
      self.play(FadeOut(label), FadeOut(formula))
  or transform it into the next thing:
      self.play(ReplacementTransform(old_text, new_text))
  ReplacementTransform is strongly preferred for "this becomes that" — it
  cannot leave a duplicate behind, whereas Transform can.
- NEVER have more than 4 mobjects on screen at once. Count them as you write.
- Every Text you create must eventually be faded out, replaced, or be the final
  payoff line. If you cannot say which, do not create it.
- Do not place two Texts at the same position, and do not rely on a default
  position twice: bare Text(...) with no positioning lands at the ORIGIN, so two
  of them overlap exactly. Position every mobject explicitly.
- Lay out anything stacked with a VGroup instead of hand-picked coordinates:
      group = VGroup(line1, line2, line3).arrange(DOWN, buff=0.35)
      group.move_to(ORIGIN)
  .arrange() cannot overlap; manual .shift() chains routinely do.
- Vertical zones (y): use -2.2..2.2 only. Put a persistent label near y=2.0, the
  working visual around y=0, and a payoff line near y=-2.0. If a beat needs the
  full height, clear the others first.

VOICEOVER
- 90-130 words, spoken over the animation. Hook sentence first. Wonder-driven ("wait, that can't be right"), plain words, present tense. End with a payoff line.

HARD TECHNICAL CONSTRAINTS (violations make the render fail)
- Exactly one scene: class MathScene(Scene) with construct(self).
- First line of construct: self.camera.background_color = "#0d1117"
- Imports: ONLY "from manim import *" and optionally "import math" / "import numpy as np".
- NO LaTeX: never use Tex, MathTex, DecimalNumber, Axes with numbers, or get_axis_labels. Write formulas as Text("a² + b² = c²") — unicode superscripts/symbols are fine (² ³ √ π ∞ ≈ ≠ ÷ ×).
- Allowed mobjects: Text, Circle, Square, Rectangle, Polygon, RegularPolygon, Triangle, Line, Arrow, DoubleArrow, Arc, ArcBetweenPoints, Dot, VGroup, Brace, SurroundingRectangle, NumberLine (with include_numbers=False).
- Allowed animations: Write, Create, FadeIn, FadeOut, Transform, ReplacementTransform, TransformFromCopy, Indicate, Circumscribe, Flash, GrowArrow, LaggedStart, AnimationGroup, .animate (shift/scale/rotate/set_color/move_to), self.wait().
- No images, SVGs, file access, updaters with dt, randomness, or external data.
- Keep it simple and robust: 25-60 lines. Prefer a few strong visuals over many fragile ones.

OUTPUT FORMAT — reply with ONLY this JSON (no markdown fences). In "manim", escape newlines as \\n:
{
  "id": "<kebab-case-slug, max 40 chars>",
  "title": "<video title, max 60 chars>",
  "hook": "<on-screen hook line, max 8 words>",
  "voiceover": "<the full 90-130 word voiceover>",
  "manim": "<the complete python source>"
}`;

export function buildMathPrompt(topic) {
  // The voiceover here is spoken by TTS like any other script, so it inherits
  // the shared anti-slop + factuality rules instead of re-stating a subset.
  return (
    `Create a vertical math short about:\n\n${topic}\n\n` +
    `Pick the single most surprising visual angle. Remember: no LaTeX, content inside x in [-2,2], 40-55s. ` +
    `Every mobject a beat finishes with must be faded out or replaced — never leave text stacked.` +
    noSlop("voiceover", { limit: 6 }) +
    NO_FABRICATION
  );
}

const FORBIDDEN = [
  "MathTex",
  "Tex(",
  "SVGMobject",
  "ImageMobject",
  "DecimalNumber",
  "open(",
  "exec(",
  "eval(",
  "__import__",
  "subprocess",
  "socket",
  "urllib",
  "requests",
  "shutil",
  "pathlib",
  "os.",
  "sys.",
  "add_updater",
];

/** Static safety/robustness lint for generated Manim code. Returns [] when clean. */
export function lintManim(code) {
  const problems = [];
  if (!/class\s+MathScene\s*\(\s*Scene\s*\)/.test(code)) problems.push("missing `class MathScene(Scene)`");
  if (!/def\s+construct\s*\(\s*self\s*\)/.test(code)) problems.push("missing construct(self)");
  for (const line of code.split("\n")) {
    const t = line.trim();
    if (t.startsWith("import ") || t.startsWith("from ")) {
      if (!/^from manim import \*$|^import math$|^import numpy( as np)?$/.test(t)) {
        problems.push(`disallowed import: ${t}`);
      }
    }
  }
  for (const bad of FORBIDDEN) {
    if (code.includes(bad)) problems.push(`forbidden token: ${bad}`);
  }
  return problems;
}

/**
 * Overlap smells. Manim never removes a mobject on its own, so a scene that
 * creates a dozen Texts and never fades any of them WILL end up with text piled
 * on text — the single most common defect in these generated scenes, and one no
 * safety check was looking for.
 *
 * These are heuristics on source text, not a render check, so they are reported
 * as warnings the caller can choose to regenerate on rather than hard failures.
 */
export function lintLayout(code) {
  const warn = [];

  // 1. accumulation: lots of mobjects created, almost none removed
  const created = (code.match(/\b(?:Text|Circle|Square|Rectangle|Polygon|RegularPolygon|Triangle|Line|Arrow|DoubleArrow|Arc|Dot|Brace|SurroundingRectangle|NumberLine)\s*\(/g) || []).length;
  const removed =
    (code.match(/\bFadeOut\s*\(/g) || []).length +
    (code.match(/\bReplacementTransform\s*\(/g) || []).length +
    (code.match(/\bTransform\s*\(/g) || []).length +
    (code.match(/self\.remove\s*\(/g) || []).length +
    (code.match(/\bself\.clear\s*\(/g) || []).length;
  if (created >= 6 && removed === 0) {
    warn.push(`layout: ${created} mobjects created and none ever removed — they will pile up on screen`);
  } else if (created >= 8 && removed < 2) {
    warn.push(`layout: ${created} mobjects created but only ${removed} removal(s) — likely overlap`);
  }

  /**
   * 2. Texts that are never positioned all land on the ORIGIN, stacked exactly.
   *
   * This must follow the VARIABLE, not the line: idiomatic Manim assigns first
   * and positions afterwards —
   *     equals = Text("= 5050")
   *     equals.next_to(claim, DOWN)
   *     group  = VGroup(claim, equals).move_to(UP * 1.6)
   * A same-line regex flagged both bundled demos, which are known good. Being
   * positioned via a VGroup counts, so group membership is checked too.
   */
  const POS = String.raw`(?:move_to|next_to|to_edge|to_corner|shift|align_to|arrange|arrange_in_grid)`;
  const unplaced = [];
  for (const m of code.matchAll(/^[ \t]*([A-Za-z_]\w*)\s*=\s*Text\s*\(.*$/gm)) {
    const name = m[1];
    // positioned by chaining on the assignment line: Text(...).move_to(...)
    if (new RegExp(String.raw`\.\s*${POS}\s*\(`).test(m[0])) continue;
    // or later, through the variable
    if (new RegExp(String.raw`\b${name}\s*\.\s*${POS}\s*\(`).test(code)) continue;
    // inside a VGroup(...) that is itself positioned or arranged
    const inPositionedGroup = [...code.matchAll(/VGroup\s*\(([^)]*)\)((?:\s*\.\s*\w+\s*\([^)]*\))*)/g)].some(
      ([, args, chain]) => new RegExp(String.raw`\b${name}\b`).test(args) && new RegExp(String.raw`\.\s*${POS}\s*\(`).test(chain)
    );
    if (!inPositionedGroup) unplaced.push(name);
  }
  if (unplaced.length >= 2) {
    warn.push(`layout: ${unplaced.length} Text objects never positioned (${unplaced.slice(0, 4).join(", ")}) — unpositioned Text sits at the origin, so they overlap exactly`);
  }

  // 3. content outside the safe vertical band the captions rely on
  for (const m of code.matchAll(/(?:shift|move_to)\s*\(\s*(?:UP|DOWN)\s*\*\s*([0-9.]+)/g)) {
    if (Number(m[1]) > 2.6) warn.push(`layout: shifted ${m[1]} units vertically — outside the -2.2..2.2 safe band, will collide with the caption overlay`);
  }

  return warn;
}
