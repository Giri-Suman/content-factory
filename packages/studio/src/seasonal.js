/**
 * SEASONAL CALENDAR — demand that arrives on a date, not from a trend feed.
 *
 * The radar finds what is spiking NOW. It structurally cannot see that nail-art
 * searches climb for three weeks before Diwali, or that "DSA in 30 days" peaks
 * before placement season. That demand is predictable, and being three weeks
 * early is the entire advantage — publishing Diwali nail art ON Diwali is late.
 *
 * India-weighted on purpose: this creator's audience is India + global English,
 * and the Indian festival calendar drives beauty and nails harder than anything
 * in the Western content calendar.
 *
 * Data only — no LLM, no network, works keyless and offline.
 *
 * Dates: festivals that follow the lunar calendar move every year, so those
 * carry `approx: true` and a note. Treat them as "around here", not gospel;
 * the lead time is wide enough that a few days does not matter.
 */

const CODING = "coding";
const AI = "ai-automation";
const MATH = "math";
const BEAUTY = "makeup"; // shared with nails — the pack decides the treatment
const NAILS = "nails";

/**
 * leadDays — how far AHEAD of the date to publish. This is the field that
 * actually matters. Tutorial content needs the viewer to have time to buy
 * supplies and practise; news-shaped content peaks on the day.
 */
export const SEASONS = [
  /* ---------------- India: beauty + nails ---------------- */
  { id: "diwali", label: "Diwali", month: 10, day: 20, approx: true, note: "lunar — Oct/Nov, verify each year",
    niches: [BEAUTY, NAILS], leadDays: 21,
    angles: ["Diwali nail art that survives 5 days of cooking", "one-palette festive glam", "glitter without the removal nightmare", "quick office-to-party change"] },
  { id: "durga-puja", label: "Durga Puja / Navratri", month: 9, day: 25, approx: true, note: "lunar — Sep/Oct",
    niches: [BEAUTY, NAILS], leadDays: 21,
    angles: ["nine nights, nine looks", "sweat-proof pandal-hopping base", "traditional red bindi + modern eye", "saree-matched nails"] },
  { id: "wedding-season-in", label: "Indian wedding season", month: 11, day: 15, approx: false,
    niches: [BEAUTY, NAILS], leadDays: 30,
    note: "Nov-Feb — the single biggest beauty-demand window in India",
    angles: ["guest makeup that photographs well in tube light", "bridal nails 2 weeks out", "12-hour wear test", "haldi look that survives turmeric"] },
  { id: "karwa-chauth", label: "Karwa Chauth", month: 10, day: 10, approx: true, note: "lunar",
    niches: [BEAUTY, NAILS], leadDays: 14, angles: ["mehndi-matched nails", "red look, modern take"] },
  { id: "holi", label: "Holi", month: 3, day: 8, approx: true, note: "lunar — March",
    niches: [BEAUTY, NAILS], leadDays: 14,
    angles: ["pre-Holi skin barrier prep", "colour removal without scrubbing", "waterproof everything"] },
  { id: "raksha-bandhan", label: "Raksha Bandhan", month: 8, day: 19, approx: true,
    niches: [BEAUTY, NAILS], leadDays: 10, angles: ["quick festive nails", "10-minute family-photo face"] },

  /* ---------------- global: beauty + nails ---------------- */
  { id: "new-year-eve", label: "New Year's Eve", month: 12, day: 31, niches: [BEAUTY, NAILS], leadDays: 14,
    angles: ["chrome nails", "glitter that comes off", "midnight-proof lip"] },
  { id: "valentines", label: "Valentine's Day", month: 2, day: 14, niches: [BEAUTY, NAILS], leadDays: 14,
    angles: ["soft glam", "red French tips", "date-night in 10 minutes"] },
  { id: "summer-heat", label: "Summer / humidity season", month: 4, day: 15, niches: [BEAUTY], leadDays: 21,
    note: "India: Apr-Jun is the sweat-proof-makeup window",
    angles: ["sweat-proof base that isn't cakey", "SPF under makeup", "minimal heat-wave routine"] },

  /* ---------------- coding + AI automation ---------------- */
  { id: "placement-season", label: "Campus placement season (India)", month: 7, day: 15, niches: [CODING, MATH], leadDays: 30,
    note: "Jul-Sep — DSA, system design and resume content peaks",
    angles: ["DSA in 30 days, realistically", "the 8 patterns that cover most interviews", "resume projects that aren't a todo app"] },
  { id: "new-year-resolutions", label: "New year, learn-to-code wave", month: 1, day: 1, niches: [CODING, AI], leadDays: 14,
    angles: ["a roadmap you'll actually finish", "why last year's roadmap failed", "30 days, one project"] },
  { id: "hacktoberfest", label: "Hacktoberfest", month: 10, day: 1, niches: [CODING], leadDays: 14,
    angles: ["your first real PR", "finding issues that aren't spam", "what maintainers actually want"] },
  { id: "advent-of-code", label: "Advent of Code", month: 12, day: 1, niches: [CODING, MATH], leadDays: 10,
    angles: ["day 1 in 5 languages", "the trick most people miss", "when to stop optimising"] },
  { id: "appraisal-season", label: "Appraisal / job-switch season (India)", month: 3, day: 1, niches: [CODING, AI], leadDays: 21,
    note: "Mar-Jun — switch, salary and upskilling content",
    angles: ["what actually moves a senior review", "the portfolio that got the callback", "automating the boring half of your job"] },

  /* ---------------- math ---------------- */
  { id: "board-exams-in", label: "Board exams (India)", month: 2, day: 15, niches: [MATH], leadDays: 30,
    note: "Feb-Mar — class 10/12; the biggest math-demand window in India",
    angles: ["the 5 proofs that always appear", "60 marks from 3 chapters", "why this formula works, in 40 seconds"] },
  { id: "jee-neet", label: "JEE / NEET season", month: 1, day: 10, niches: [MATH], leadDays: 30,
    angles: ["the shortcut that isn't cheating", "one paradox that explains calculus", "visual intuition for limits"] },
  { id: "pi-day", label: "Pi Day", month: 3, day: 14, niches: [MATH], leadDays: 7,
    angles: ["why pi shows up where there's no circle", "computing pi with a random number generator"] },
  { id: "back-to-school", label: "Back to school", month: 6, day: 15, niches: [MATH, CODING], leadDays: 21,
    angles: ["the topic everyone fails first", "notes that actually work"] },
];

const DAY = 864e5;

/** Nearest future occurrence of a month/day, rolling to next year when past. */
function nextOccurrence(season, from = new Date()) {
  const y = from.getUTCFullYear();
  let d = new Date(Date.UTC(y, season.month - 1, season.day));
  if (d.getTime() < from.getTime() - 2 * DAY) d = new Date(Date.UTC(y + 1, season.month - 1, season.day));
  return d;
}

/**
 * What to be working on now. `publishBy` is the actionable date — the season
 * itself is when demand peaks, which is already too late to start.
 */
export function upcoming({ niches = null, withinDays = 45, from = new Date() } = {}) {
  const out = [];
  for (const s of SEASONS) {
    if (niches && !s.niches.some((n) => niches.includes(n))) continue;
    const date = nextOccurrence(s, from);
    const daysAway = Math.round((date.getTime() - from.getTime()) / DAY);
    const publishBy = new Date(date.getTime() - s.leadDays * DAY);
    const startNow = publishBy.getTime() <= from.getTime() + 7 * DAY;
    if (daysAway > withinDays + s.leadDays) continue;
    out.push({
      ...s,
      date: date.toISOString().slice(0, 10),
      daysAway,
      publishBy: publishBy.toISOString().slice(0, 10),
      daysUntilPublishBy: Math.round((publishBy.getTime() - from.getTime()) / DAY),
      startNow,
      urgency: startNow ? (daysAway < s.leadDays ? "late" : "now") : "soon",
    });
  }
  return out.sort((a, b) => a.daysUntilPublishBy - b.daysUntilPublishBy);
}

/** Seed briefs from a season's angles — real topics, not [fill:] templates. */
export function seasonalTopics({ niches = null, withinDays = 45, limit = 10 } = {}) {
  const rows = [];
  for (const s of upcoming({ niches, withinDays })) {
    for (const angle of s.angles) {
      rows.push({ topic: angle, season: s.id, label: s.label, niches: s.niches, publishBy: s.publishBy, urgency: s.urgency });
    }
  }
  return rows.slice(0, limit);
}
