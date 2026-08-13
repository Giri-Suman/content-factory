import { PATTERNS, SURFACES } from "./humanize.js";

/**
 * PROMPT KIT — shared preambles for every generation prompt.
 *
 * The humanizer DETECTS AI-writing tells after the fact. Preventing them at
 * generation time is strictly better and free: the model reads the constraint
 * once instead of us scoring, flagging and regenerating.
 *
 * The anti-slop text is DERIVED from the humanize pattern table rather than
 * written twice, so the detector and the preventer cannot drift apart. Add a
 * pattern with an `avoid` hint and every prompt inherits it.
 */

/** The tells that matter on a given surface, as instructions. */
export function noSlop(surface = "voiceover", { limit = 9 } = {}) {
  const weighted = PATTERNS.filter((p) => p.avoid && (p.surfaces[surface] ?? 0) > 0)
    .sort((a, b) => (b.surfaces[surface] || 0) - (a.surfaces[surface] || 0))
    .slice(0, limit);
  if (!weighted.length) return "";
  return (
    `\n\nWRITE LIKE A PERSON (${surface}: ${SURFACES[surface]}).\n` +
    weighted.map((p) => `- ${p.avoid}`).join("\n") +
    `\n- Vary sentence length. Uniform sentence rhythm is itself a tell.` +
    `\n- Use contractions. Prefer the concrete noun over the abstract one.`
  );
}

/**
 * Never invent. This system PUBLISHES, so a plausible-sounding fabrication is
 * the most expensive failure available — worse than a bland line, worse than
 * a refusal.
 */
export const NO_FABRICATION =
  "\n\nFACTUALITY: never invent a fact, name, number, date, tool, benchmark, " +
  "statistic, quote or citation that is not in the input. If the input is " +
  "vague, stay vague. Removing dullness is never worth adding a falsehood. " +
  "If you do not know, say the thing you do know instead.";

/** Reply-shape discipline. Every JSON caller in this repo slices on braces. */
export const JSON_ONLY =
  "\n\nOUTPUT: reply with ONLY the JSON object — no markdown fences, no prose " +
  "before or after, no trailing commentary.";

/**
 * Spoken text goes to TTS, where typography is not style but a hazard: an em
 * dash becomes an unpredictable pause and shifts every word timestamp the
 * captions and Remotion timeline depend on.
 */
export const TTS_SAFE =
  "\n\nTHIS IS SPOKEN ALOUD by text-to-speech. No em dashes, no emoji, no " +
  "markdown, no asterisks, no parentheses-as-asides, no typography of any " +
  "kind. Short spoken sentences. Write what a person would actually say.";

/** One call for the common case. */
export function preamble({ surface = "voiceover", tts = false, json = true } = {}) {
  return noSlop(surface) + (tts ? TTS_SAFE : "") + NO_FABRICATION + (json ? JSON_ONLY : "");
}
