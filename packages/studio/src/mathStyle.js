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
  return `Create a vertical math short about:\n\n${topic}\n\nPick the single most surprising visual angle. Remember: no LaTeX, content inside x in [-2,2], 40-55s.`;
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
