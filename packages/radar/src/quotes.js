import { getByIds } from "./db.js";
import { entityGrounding } from "./evidence.js";

/**
 * QUOTES — real community language, attributed.
 *
 * Adapted from last30days' LAW 9 ("weave 2+ verbatim community comments,
 * attributed, into the synthesis"). That rule exists for research briefs;
 * here it solves a content problem.
 *
 * Briefs in this repo were written from headlines alone, because the
 * collectors captured only `title/url/points/comments` — no body text at
 * all. A headline tells you the topic; the body tells you how people
 * actually phrase the frustration, which is what a hook is made of.
 * "Nobody tells you the migration eats your custom hooks" is a script.
 * "New framework released" is not.
 *
 * Hard rule inherited from the source skill and reinforced here: a quote is
 * VERBATIM or it is not a quote. Nothing in this file paraphrases, and every
 * quote carries its attribution and score so the brief can cite it. Inventing
 * a plausible community sentiment would be fabricating evidence.
 */

// Lines that read as a person reacting, not a changelog.
const OPINION = /\b(i |we |my |honestly|actually|turns out|the problem|the trick|nobody|everyone|finally|still|why does|why is|can'?t|won'?t|doesn'?t|didn'?t|worst|best|hate|love|broke|broken|fixed|wish)\b/i;
// Feed furniture that looks like text but carries no voice. Reddit's RSS
// wraps every LINK post in "submitted by /u/x [link] [comments]" and nothing
// else — mistaking that for a community quote is worse than having none.
const NOISE = /^(edit|update|tl;?dr|deleted|removed|\[|http)/i;
const BOILERPLATE = /submitted by\s*\/?u\/|^\s*\[?(link|comments)\]?\s*$|\[link\]\s*\[comments\]|^\s*$/i;
// A line starting with ">" is the commenter quoting SOMEONE ELSE. Attributing
// it to them would put words in a real person's mouth — the exact failure the
// no-fabrication rule exists to prevent.
const NESTED_QUOTE = /^\s*(?:&gt;|>)/;

/**
 * Community voice vs press release. This distinction IS the source skill's
 * thesis — rank what real people engage with, not editorial authority — and
 * the first version of this file violated it: the top "quotes" came back as
 * Vercel and OpenAI blog prose, which is marketing copy wearing a quote's
 * clothes. A corporate feed and a subreddit both arrive as RSS with zero
 * points, so nothing separated them until this did.
 */
const PRESS = /^(openai|vercel|techcrunch|arstechnica|theverge|githubblog|allure|wired|engadget|venturebeat|anthropic|google|microsoft)/i;
export const voiceOf = (source) => {
  const s = String(source || "");
  if (s.startsWith("r/") || s === "hn" || s === "lobsters") return "community";
  if (PRESS.test(s)) return "press";
  return "other";
};

/** Split an excerpt into candidate quotable sentences. */
function sentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30 && s.length <= 240 && !NOISE.test(s) && !BOILERPLATE.test(s) && !NESTED_QUOTE.test(s));
}

function scoreQuote(s, label) {
  let score = 0;
  if (OPINION.test(s)) score += 30;
  if (/\d/.test(s)) score += 12; // concrete numbers survive as B-roll
  if (/[?]/.test(s)) score += 8; // questions make hooks
  if (s.length >= 60 && s.length <= 160) score += 12; // speakable length
  const g = entityGrounding(label, { title: s });
  score += g.grounded ? 15 : -20;
  if (/\b(this|that|it)\b/i.test(s.slice(0, 12))) score -= 10; // dangling reference
  return score;
}

/**
 * Pull the most quotable lines for a cluster, with attribution.
 * Returns [] rather than inventing anything when no member carries text —
 * which is the current state until collectors have re-run.
 */
export function quotesForCluster(cluster, { limit = 4 } = {}) {
  const members = getByIds(cluster.memberIds || []);
  const out = [];
  for (const m of members) {
    if (!m.excerpt) continue;
    if (!entityGrounding(cluster.label, m).grounded) continue;
    const voice = voiceOf(m.source);

    // When the collector kept per-comment attribution, quote each commenter
    // by name. Concatenating a thread into one excerpt and crediting it all
    // to the first author would misattribute real people's words.
    if (Array.isArray(m.voices) && m.voices.length) {
      for (const v of m.voices) {
        for (const s of sentences(v.text)) {
          out.push({
            text: s,
            author: v.author || m.source,
            source: m.source,
            voice,
            url: m.url,
            engagement: (m.points || 0) + (m.comments || 0) * 2,
            score: scoreQuote(s, cluster.label) + Math.min(20, Math.log10((m.points || 0) + 1) * 8) + (voice === "community" ? 40 : voice === "press" ? -25 : 0),
          });
        }
      }
      continue;
    }

    for (const s of sentences(m.excerpt)) {
      out.push({
        text: s,
        author: m.author || m.source,
        source: m.source,
        voice,
        url: m.url,
        engagement: (m.points || 0) + (m.comments || 0) * 2,
        // community voice outranks press by a wide margin — a press sentence
        // has to be exceptional to beat an ordinary human one
        score:
          scoreQuote(s, cluster.label) +
          Math.min(20, Math.log10((m.points || 0) + 1) * 8) +
          (voice === "community" ? 40 : voice === "press" ? -25 : 0),
      });
    }
  }
  return out
    .sort((a, b) => b.score - a.score)
    .filter((q, i, arr) => arr.findIndex((x) => x.text === q.text) === i)
    .slice(0, limit);
}

/** How much real language the pool actually has — honest coverage number. */
export function quoteCoverage(clusters) {
  let withText = 0;
  let withQuotes = 0;
  let withCommunity = 0;
  for (const c of clusters) {
    const members = getByIds(c.memberIds || []);
    if (members.some((m) => m.excerpt)) withText++;
    const qs = quotesForCluster(c, { limit: 3 });
    if (qs.length) withQuotes++;
    if (qs.some((q) => q.voice === "community")) withCommunity++;
  }
  return {
    clusters: clusters.length,
    withText,
    withQuotes,
    withCommunity,
    note:
      withText === 0
        ? "no member carries body text yet — collectors only started capturing excerpts on this build; re-run `factory radar` and quotes appear as posts refresh"
        : `${withCommunity}/${clusters.length} clusters have real COMMUNITY language (${withQuotes} have text of any kind — press releases don't count as voice)`,
  };
}
