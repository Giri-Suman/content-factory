import { collection, newId } from "../../shared/src/store.js";

/**
 * HUMANIZE — strip the tells that make generated copy read as generated.
 *
 * Adapted from the `humanizer` skill by blader (MIT), which encodes
 * Wikipedia's "Signs of AI writing" as 33 patterns:
 *   https://github.com/blader/humanizer
 *
 * It is an ADAPTATION, not a port, because a flat banlist would actively
 * damage this project's output. The original targets encyclopedic prose.
 * This system emits spoken voiceover and platform copy, where three of its
 * rules invert:
 *
 *   - Rule-of-three and conversational openers ("Here's the thing") are
 *     RETENTION DEVICES in a short-form hook, not slop. Penalising them
 *     costs views.
 *   - Emoji are a violation in an article and native in an IG caption.
 *   - Em dashes in voiceover aren't a style crime, they're a TTS HAZARD:
 *     ElevenLabs renders them as an unpredictable pause, which desyncs the
 *     word timings the caption/render pipeline depends on.
 *
 * So every pattern carries a PER-SURFACE weight, and some are marked
 * `native` — meaning "expected here, do not flag."
 *
 * The no-fabrication rule is carried over intact and matters more here than
 * in the original, because this system publishes: a rewrite may never
 * invent a fact, name, number, or citation that wasn't in the input.
 */

/* ------------------------------------------------------------------ */
/* surfaces                                                            */
/* ------------------------------------------------------------------ */

export const SURFACES = {
  voiceover: "spoken aloud by TTS — typography is irrelevant, prosody is everything",
  title: "60-100 chars, scanned in a feed, keyword-bearing",
  description: "written prose the viewer may actually read; also SEO",
  caption: "IG/TikTok caption — emoji and line breaks are native",
  reply: "a comment reply in your voice; chatbot artifacts are fatal",
  post: "LinkedIn/X — has its own slop dialect to avoid",
};
export const SURFACE_IDS = Object.keys(SURFACES);

// weight: how many points a hit costs. `native` = expected here, never flag.
const FATAL = 18, HIGH = 12, MED = 7, LOW = 3, NATIVE = 0;

/* ------------------------------------------------------------------ */
/* the pattern table                                                   */
/* ------------------------------------------------------------------ */

const rx = (body, flags = "gi") => new RegExp(body, flags);

/**
 * Each pattern: { id, name, cat, why, test, surfaces, fix? }
 * `surfaces` omits a key => that surface ignores the pattern entirely.
 */
export const PATTERNS = [
  /* ---- language: the tells that survive being read aloud ---- */
  {
    id: "ai-vocabulary",
    name: "AI vocabulary",
    cat: "language",
    why: "these words are statistically over-represented in LLM output; a person picking words for a 30-second script almost never reaches for them",
    test: rx("\\b(delve|delves|delving|intricate|intricacies|interplay|tapestry|testament|pivotal|underscore[sd]?|showcase[sd]?|garner(?:ed|s)?|foster(?:ing|ed|s)?|enhance[sd]?|enhancing|multifaceted|realm|myriad|plethora|paradigm|holistic|robust|seamless(?:ly)?|leverage[sd]?|utilize[sd]?|facilitate[sd]?|endeavor|nuanced|vibrant|landscape of|evolving landscape)\\b"),
    surfaces: { voiceover: FATAL, title: FATAL, description: HIGH, caption: HIGH, reply: HIGH, post: HIGH },
  },
  {
    id: "significance-inflation",
    name: "Significance inflation",
    cat: "content",
    why: "inflating importance instead of stating the thing; reads as padding in speech",
    // contractions matter: "it's a testament" is the common LLM form, and an
    // `is a testament` literal misses every one of them
    test: rx("\\b(stands as|serves as|(?:is|'s|s a|was) a testament|(?:is|'s) a reminder|plays a (?:key|vital|crucial) role|underscores the (?:importance|significance)|highlights the (?:importance|significance)|reflects a broader|marks a (?:shift|turning point)|represents a shift|setting the stage for|indelible mark|deeply rooted|focal point)\\b"),
    surfaces: { voiceover: FATAL, title: HIGH, description: HIGH, caption: MED, reply: MED, post: HIGH },
  },
  {
    id: "copula-avoidance",
    name: "Copula avoidance",
    cat: "language",
    why: "'serves as' where a person says 'is'; the elaborate verb is the tell",
    test: rx("\\b(serves as|stands as|functions as|acts as|represents|constitutes|embodies)\\s+(?:a|an|the)\\b"),
    surfaces: { voiceover: HIGH, title: MED, description: MED, caption: LOW, reply: MED, post: MED },
  },
  {
    id: "negative-parallelism",
    name: "Negative parallelism",
    cat: "language",
    why: "'not just X, but Y' is the single most recognisable LLM cadence",
    // the pivot is often a dash or comma, not "but" — and the negation is
    // usually contracted ("isn't just X, it's Y"), which a `not just` literal misses
    test: rx("\\b(?:(?:is|are|was|were|do|does|did|it'?s|that'?s)n'?t (?:just|only|merely|simply|about)\\b[^.!?]{2,70}?(?:\\bbut\\b|[—–,]\\s*(?:it'?s|they'?re|that'?s|this is)\\b)|\\bnot (?:just|only|merely|simply)\\b[^.!?]{2,70}?\\bbut\\b)"),
    surfaces: { voiceover: FATAL, title: HIGH, description: HIGH, caption: HIGH, reply: HIGH, post: FATAL },
  },
  {
    id: "promotional",
    name: "Promotional language",
    cat: "content",
    why: "advertising register applied to a neutral claim",
    test: rx("\\b(boasts a|nestled|in the heart of|groundbreaking|breathtaking|must-visit|must-have|stunning|renowned|game[- ]?chang(?:er|ing)|revolutionar(?:y|ise|ize)|cutting[- ]edge|state[- ]of[- ]the[- ]art|unlock(?:ing)? the (?:power|potential|secrets)|take .{1,20} to the next level|elevate your)\\b"),
    surfaces: { voiceover: FATAL, title: FATAL, description: HIGH, caption: MED, reply: HIGH, post: HIGH },
  },
  {
    id: "vague-attribution",
    name: "Vague attribution",
    cat: "content",
    why: "credits an undefined authority — and in this system that's also a factuality risk",
    test: rx("\\b(industry reports|observers have (?:cited|noted)|experts (?:argue|say|agree)|some critics argue|several (?:sources|publications)|studies show|research suggests|it is widely (?:believed|regarded))\\b"),
    surfaces: { voiceover: FATAL, title: HIGH, description: FATAL, caption: HIGH, reply: HIGH, post: FATAL },
  },
  {
    id: "filler",
    name: "Filler phrases",
    cat: "filler",
    why: "burns runtime; in a 30s Short every wasted second is measurable",
    test: rx("\\b(in order to|due to the fact that|at this point in time|in the event that|has the ability to|it is important to note that|it'?s worth noting that|needless to say|when it comes to|the fact of the matter)\\b"),
    surfaces: { voiceover: FATAL, title: HIGH, description: MED, caption: MED, reply: MED, post: MED },
    fix: (t) => t
      .replace(rx("\\bin order to\\b"), "to")
      .replace(rx("\\bdue to the fact that\\b"), "because")
      .replace(rx("\\bat this point in time\\b"), "now")
      .replace(rx("\\bin the event that\\b"), "if")
      .replace(rx("\\bhas the ability to\\b"), "can")
      .replace(rx("\\b(?:it is|it's) important to note that\\b"), "")
      .replace(rx("\\b(?:it is|it's) worth noting that\\b"), ""),
  },
  {
    id: "hedging",
    name: "Excessive hedging",
    cat: "filler",
    why: "stacked qualifiers make a confident claim sound unsure; kills hook authority",
    test: rx("\\b(?:it (?:may|might|could) be (?:that|argued)|arguably|generally speaking|in many ways|to some extent|relatively speaking|somewhat of a|perhaps one of the)\\b"),
    surfaces: { voiceover: HIGH, title: FATAL, description: MED, caption: MED, reply: LOW, post: MED },
  },
  {
    id: "signposting",
    name: "Signposting",
    cat: "communication",
    why: "announcing what comes next instead of saying it — pure runtime tax in video",
    test: rx("\\b(let'?s (?:dive in(?:to)?|explore|break (?:this|it) down|take a look)|here'?s what you need to know|now let'?s look at|without further ado|in this (?:video|post|article)(?:,| I'?ll| we'?ll))"),
    surfaces: { voiceover: FATAL, title: HIGH, description: MED, caption: MED, reply: MED, post: HIGH },
  },
  {
    id: "chatbot-artifact",
    name: "Chatbot artifacts",
    cat: "communication",
    why: "assistant register leaking into your voice; in a reply this is instantly recognisable",
    test: rx("\\b(i hope this helps|hope that helps|great question|excellent question|you'?re absolutely right|certainly!|of course!|would you like me to|want me to|should i continue|let me know if|feel free to (?:ask|reach out)|as an ai|language model)\\b"),
    surfaces: { voiceover: FATAL, title: FATAL, description: FATAL, caption: FATAL, reply: FATAL, post: FATAL },
  },
  {
    id: "sycophancy",
    name: "Sycophantic tone",
    cat: "communication",
    why: "servile register; readers correctly read it as machine-generated deference",
    test: rx("\\b(that'?s a (?:great|fantastic|wonderful) (?:point|question)|thanks so much for (?:asking|sharing)|i really appreciate you|what a (?:great|wonderful))\\b"),
    surfaces: { voiceover: HIGH, description: MED, caption: MED, reply: FATAL, post: HIGH },
  },
  {
    id: "cutoff-disclaimer",
    name: "Knowledge-cutoff / speculation",
    cat: "communication",
    why: "a disclaimer in published copy is a credibility hole, and speculative gap-filling is how false facts enter",
    test: rx("\\b(as of my (?:last|knowledge)|up to my last training|while specific details are (?:limited|scarce)|based on available information|it is believed that|reportedly|is said to be)\\b"),
    surfaces: { voiceover: FATAL, title: FATAL, description: FATAL, caption: FATAL, reply: FATAL, post: FATAL },
  },
  {
    id: "authority-trope",
    name: "Persuasive authority trope",
    cat: "language",
    why: "pseudo-profound framing wrapped around an ordinary claim",
    test: rx("\\b(the real question is|at its core|in reality,|what really matters|the deeper issue|the heart of the matter|fundamentally,)\\b"),
    surfaces: { voiceover: MED, title: HIGH, description: MED, caption: LOW, reply: LOW, post: HIGH },
  },
  {
    id: "aphorism",
    name: "Aphorism formula",
    cat: "style",
    why: "converts a concrete claim into a fortune-cookie line that says nothing",
    test: rx("\\b(?:isn'?t (?:about|just) \\w+[^.!?]{0,40}?\\bit'?s about\\b|the best \\w+ (?:is|are) the one[s]? (?:that|who)\\b|\\w+ is (?:a feature|the feature), not a bug\\b)"),
    surfaces: { voiceover: HIGH, title: HIGH, description: MED, caption: MED, reply: MED, post: HIGH },
  },
  {
    id: "generic-conclusion",
    name: "Generic positive conclusion",
    cat: "content",
    why: "an upbeat ending with no content; wastes the outro where the CTA belongs",
    test: rx("\\b(?:the (?:future|possibilities) (?:is|are) (?:bright|endless)|only time will tell|one thing is (?:for )?certain|at the end of the day,|ultimately,? it'?s about)\\b"),
    surfaces: { voiceover: HIGH, description: MED, caption: MED, reply: LOW, post: HIGH },
  },
  {
    id: "false-range",
    name: "False range",
    cat: "language",
    why: "'from X to Y' where X and Y aren't ends of any real scale",
    test: rx("\\bfrom \\w+(?: \\w+)? to \\w+(?: \\w+)?,? (?:and|the|this|these|there)\\b"),
    surfaces: { voiceover: MED, description: LOW, caption: LOW, post: MED },
  },
  {
    id: "ing-analysis",
    name: "Superficial -ing analysis",
    cat: "content",
    why: "a trailing participle clause that adds commentary instead of information",
    test: rx(",\\s+(?:highlighting|underscoring|showcasing|reflecting|emphasizing|demonstrating|illustrating|cementing|solidifying)\\s+(?:its|their|the|a|an)\\b"),
    surfaces: { voiceover: FATAL, title: MED, description: HIGH, caption: MED, reply: MED, post: HIGH },
  },

  /* ---- typography: matters off-mic, and is a TTS hazard on-mic ---- */
  {
    id: "em-dash",
    name: "Em/en dash",
    cat: "style",
    why: "in written copy it's the classic LLM crutch; in VOICEOVER it's worse than a style problem — ElevenLabs renders it as an unpredictable pause, which shifts every word timestamp the captions and render depend on",
    test: /[—–]/g,
    surfaces: { voiceover: FATAL, title: HIGH, description: MED, caption: MED, reply: MED, post: MED },
    /**
     * The fix must produce prosody, not just delete the glyph — and a PAIR of
     * dashes is a parenthetical, not two sentence breaks. Turning both into
     * periods yields "This tool. which I use daily. can transform", which is
     * broken grammar that TTS then reads as three fragments.
     */
    fix: (t, surface) => {
      // paired dashes wrapping a short aside -> commas, on every surface
      let out = t.replace(/\s*[—–]\s*([^—–.!?]{1,60}?)\s*[—–]\s*/g, ", $1, ");
      if (!/[—–]/.test(out)) return out;
      // a lone remaining dash is a break: sentence stop when spoken, comma when read
      return surface === "voiceover"
        ? out
            .replace(/\s*[—–]\s*/g, ". ")
            .replace(/\.\s*\./g, ".")
            // a new sentence needs its capital, or the text reads as a typo
            .replace(/\.\s+([a-z])/g, (_, c) => `. ${c.toUpperCase()}`)
        : out.replace(/\s*[—–]\s*/g, ", ");
    },
  },
  {
    id: "emoji-in-speech",
    name: "Emoji in spoken text",
    cat: "style",
    why: "a real bug, not a style note: an emoji left in a voiceover field gets sent to TTS, which either speaks its name aloud or drops it and shifts the timing",
    test: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,
    surfaces: { voiceover: FATAL, title: MED, description: LOW, caption: NATIVE, reply: NATIVE, post: LOW },
    fix: (t) => t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/\s{2,}/g, " ").trim(),
  },
  {
    id: "markdown-in-speech",
    name: "Markdown in spoken text",
    cat: "style",
    why: "asterisks and backticks reach TTS as literal characters or bogus emphasis; they never belong in a voiceover field",
    test: /(\*\*?|`|^#{1,6}\s)/gm,
    surfaces: { voiceover: FATAL, title: HIGH, caption: LOW, reply: LOW },
    fix: (t) => t.replace(/\*\*?|`/g, "").replace(/^#{1,6}\s*/gm, ""),
  },
  {
    id: "curly-quotes",
    name: "Curly quotes",
    cat: "style",
    why: "smart quotes betray a generated origin in plain-text fields, and break some caption parsers",
    test: /[‘’“”]/g,
    surfaces: { title: LOW, description: LOW, caption: LOW, post: LOW },
    fix: (t) => t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"'),
  },
  {
    id: "title-case",
    name: "Title Case heading",
    cat: "style",
    why: "capitalising every word reads as generated in body copy",
    test: (t) => {
      const m = t.match(/^[A-Z][a-z]+(?: [A-Z][a-z]+){3,}$/gm);
      return m && m.length ? m : null;
    },
    surfaces: { description: LOW, post: LOW }, // titles are ALLOWED to be title case
  },

  /* ---- patterns the original flags that are NATIVE here ---- */
  {
    id: "rule-of-three",
    name: "Rule of three",
    cat: "language",
    why: "flagged by the source skill, but a triplet is a proven spoken-hook device; only penalised in long written copy where it stacks",
    test: rx("\\b\\w+, \\w+,? and \\w+\\b.{0,80}\\b\\w+, \\w+,? and \\w+\\b"), // only DOUBLED triplets
    surfaces: { voiceover: NATIVE, title: NATIVE, caption: NATIVE, description: LOW, post: LOW },
  },
  {
    id: "conversational-opener",
    name: "Conversational opener",
    cat: "style",
    why: "the source skill bans 'Here's the thing' / 'Honestly'. In short-form these are retention devices — a hook that opens mid-thought outperforms one that introduces itself. Only flagged when STACKED (two or more in one piece)",
    test: (t) => {
      const m = t.match(/\b(honestly|look,|here'?s the thing|the thing is|let'?s be honest|real talk)\b/gi);
      return m && m.length >= 2 ? m : null;
    },
    surfaces: { voiceover: LOW, caption: NATIVE, reply: NATIVE, description: LOW, post: MED },
  },
];

/* ------------------------------------------------------------------ */
/* scan                                                                */
/* ------------------------------------------------------------------ */

const weightOf = (p, surface) => p.surfaces[surface];

function runTest(p, text) {
  if (typeof p.test === "function") return p.test(text);
  const m = text.match(p.test);
  return m && m.length ? m : null;
}

/**
 * Score text for AI tells on a given surface.
 * 100 = reads human. Hits are capped per pattern so one repeated word
 * can't sink an otherwise clean script.
 */
export function scan(text, { surface = "description" } = {}) {
  if (!SURFACE_IDS.includes(surface)) throw new Error(`unknown surface: ${surface} (${SURFACE_IDS.join(", ")})`);
  const src = String(text || "");
  const hits = [];
  let score = 100;

  for (const p of PATTERNS) {
    const w = weightOf(p, surface);
    if (w === undefined || w === NATIVE) continue;
    const matches = runTest(p, src);
    if (!matches) continue;
    const n = matches.length;
    // diminishing: 1 hit = w, each extra = half, capped at 2x
    const cost = Math.min(w * 2, w + (n - 1) * (w / 2));
    score -= cost;
    hits.push({
      id: p.id, name: p.name, cat: p.cat, why: p.why,
      count: n,
      samples: [...new Set(matches.map((m) => String(m).trim()))].slice(0, 4),
      cost: Math.round(cost),
      fixable: Boolean(p.fix),
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    surface,
    score,
    hits: hits.sort((a, b) => b.cost - a.cost),
    reading:
      score >= 85 ? "reads human"
        : score >= 70 ? "mostly clean — a couple of tells"
          : score >= 50 ? "recognisably generated"
            : "reads as AI output",
    words: src.split(/\s+/).filter(Boolean).length,
  };
}

/* ------------------------------------------------------------------ */
/* deterministic auto-fix                                              */
/* ------------------------------------------------------------------ */

/**
 * Applies only the mechanical fixes (typography, filler substitution).
 * Never rephrases — that needs an LLM and a human read. Deliberately
 * conservative: a wrong auto-edit in a published script costs more than a
 * surviving tell.
 */
export function autoFix(text, { surface = "description" } = {}) {
  let out = String(text || "");
  const applied = [];
  for (const p of PATTERNS) {
    const w = weightOf(p, surface);
    if (w === undefined || w === NATIVE || !p.fix) continue;
    if (!runTest(p, out)) continue;
    const before = out;
    out = p.fix(out, surface);
    if (out !== before) applied.push(p.id);
  }
  out = out.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
  return { text: out, applied };
}

/* ------------------------------------------------------------------ */
/* voice profile — match the creator, not a generic "human"            */
/* ------------------------------------------------------------------ */

/**
 * The source skill lets a user paste a writing sample. Here the samples are
 * already in the repo: the posts that actually shipped. Learn from those.
 */
export function learnVoice(samples, { label = "default" } = {}) {
  const texts = (Array.isArray(samples) ? samples : [samples]).map(String).filter(Boolean);
  if (!texts.length) throw new Error("no samples");
  const all = texts.join("\n");
  const sentences = all.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const words = all.split(/\s+/).filter(Boolean);
  const lens = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const avg = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);

  const profile = {
    id: newId(),
    label,
    samples: texts.length,
    avgSentenceWords: Math.round(avg * 10) / 10,
    // variance matters more than the mean: uniform sentence length is itself an AI tell
    lengthVariance: Math.round(Math.sqrt(lens.reduce((a, b) => a + (b - avg) ** 2, 0) / (lens.length || 1)) * 10) / 10,
    contractionRate: Math.round(((all.match(/\b\w+'(?:s|t|re|ve|ll|d|m)\b/gi) || []).length / (words.length || 1)) * 1000) / 10,
    usesEmDash: (all.match(/[—–]/g) || []).length > texts.length, // >1 per sample = genuinely theirs
    questionRate: Math.round(((all.match(/\?/g) || []).length / (sentences.length || 1)) * 100),
    createdAt: new Date().toISOString(),
  };
  collection("voiceprofiles").upsert(profile);
  return profile;
}

export const voiceProfile = (label = "default") =>
  collection("voiceprofiles").find((v) => v.label === label).slice(-1)[0] || null;

/**
 * Learn from the creator's own shipped posts. Best-effort: returns null if
 * there isn't enough real material yet, rather than inventing a profile.
 */
export function learnFromMyPosts({ min = 3 } = {}) {
  const posts = collection("myposts").all();
  const texts = posts.map((p) => [p.title, p.description, p.caption].filter(Boolean).join("\n")).filter((t) => t.length > 40);
  if (texts.length < min) return null;
  return learnVoice(texts, { label: "mine" });
}

/* ------------------------------------------------------------------ */
/* LLM rewrite — uses the existing 3-tier router (free tier = $0)      */
/* ------------------------------------------------------------------ */

const NO_FABRICATION =
  "Absolute rule: never invent a fact, name, number, date, tool, statistic or citation that is not already in the input. " +
  "If the input is vague, keep it vague. Removing a tell is never worth adding a falsehood. " +
  "Preserve every factual claim and the original meaning exactly.";

/**
 * Rewrite text to remove tells while preserving facts. Falls back to the
 * deterministic autoFix when no AI is reachable, so this never hard-fails
 * the pipeline.
 */
export async function rewrite(text, { surface = "description", voice = null, tier } = {}) {
  const src = String(text || "");
  const before = scan(src, { surface });
  if (!before.hits.length) return { text: src, before, after: before, method: "none-needed" };

  const { chat } = await import("../../llm/src/llm.js");
  const vp = voice || voiceProfile("mine");
  const voiceBlock = vp
    ? `\nMatch this writer's measured habits: average sentence ${vp.avgSentenceWords} words (variance ${vp.lengthVariance} — vary length, uniform sentences read as generated), contractions in ${vp.contractionRate}% of words, ${vp.usesEmDash ? "they DO use em dashes, so keep them" : "they do not use em dashes"}.`
    : "";

  const res = await chat({
    task: "script",
    tier,
    maxTokens: 1200,
    system:
      `You edit copy so it stops sounding machine-generated. Surface: ${surface} — ${SURFACES[surface]}.` +
      voiceBlock +
      `\nRemove these specific tells: ${before.hits.map((h) => h.name).join(", ")}.` +
      (surface === "voiceover"
        ? " This is read aloud by TTS: no em dashes, no emoji, no markdown, no typography of any kind. Short spoken sentences. Contractions."
        : "") +
      `\n${NO_FABRICATION}\nReply with ONLY the rewritten text, no preamble, no quotes around it.`,
    user: src,
  });

  if (!res?.text) {
    const fixed = autoFix(src, { surface });
    return { text: fixed.text, before, after: scan(fixed.text, { surface }), method: "autofix-fallback", applied: fixed.applied };
  }

  const out = res.text.trim().replace(/^["'`]|["'`]$/g, "");
  return { text: out, before, after: scan(out, { surface }), method: `llm:${res.tier}`, provider: res.provider };
}

/* ------------------------------------------------------------------ */
/* script-level scan — every voiceover field in a compiled script      */
/* ------------------------------------------------------------------ */

export function scanScript(script) {
  const scenes = script?.scenes || [];
  const perScene = scenes.map((s, i) => ({
    i,
    type: s.type,
    ...scan(s.voiceover || "", { surface: "voiceover" }),
  }));
  const worst = perScene.slice().sort((a, b) => a.score - b.score)[0] || null;
  const avg = perScene.length ? Math.round(perScene.reduce((a, s) => a + s.score, 0) / perScene.length) : 100;
  // the hook carries disproportionate weight — it's the retention decision
  const hookPenalty = perScene[0] && perScene[0].score < 70 ? 10 : 0;
  return {
    score: Math.max(0, avg - hookPenalty),
    perScene,
    worst,
    totalHits: perScene.reduce((a, s) => a + s.hits.length, 0),
  };
}
