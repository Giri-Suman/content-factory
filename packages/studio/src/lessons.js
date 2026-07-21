import { loadEnv, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection, newId } from "../../shared/src/store.js";
import { chat, providerStatus } from "../../llm/src/llm.js";

/**
 * P19 Lesson Memory. Distills the structured Critiques (P18) + calibration
 * joins (P15) into evidence-cited Lessons, then injects the top-weighted
 * ones back into every generation prompt. Yesterday's failure reasons
 * become tomorrow's prompt constraints. No vibes: every lesson cites the
 * critiques/posts behind it.
 */

export const SCOPES = ["idea", "script", "metadata", "visual", "timing", "topic"];
const JUDGE_SCOPE = { idea: "idea", script: "script", metadata: "metadata", visual: "visual", audio: "script" };
const K = 8; // max lessons injected per prompt
const STALE_DAYS = 60;

/** Collapse a specific critique reason to a reusable pattern key. */
function reasonPattern(reason) {
  return reason
    .toLowerCase()
    .replace(/["'].*?["']/g, "")
    .replace(/\d+(\.\d+)?%?/g, "N")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
}

const recencyFactor = (iso) => {
  const days = (Date.now() - new Date(iso).getTime()) / 864e5;
  return days <= 7 ? 1 : days <= 30 ? 0.7 : days <= STALE_DAYS ? 0.4 : 0.1;
};

export function lessonWeight(l) {
  return Math.round(l.evidenceCount * recencyFactor(l.lastEvidenceAt || l.createdAt) * (l.pinned ? 3 : 1) * 10) / 10;
}

/* ---------------- distillation ---------------- */

/** Coded distiller: group failing critiques by pattern -> cited lessons. */
function distillFromCritiques() {
  const crits = collection("critiques").find((c) => c.verdict === "fail");
  const groups = new Map();
  for (const c of crits) {
    const scope = JUDGE_SCOPE[c.judge] || "script";
    for (const reason of c.reasons || []) {
      const key = `${scope}::${reasonPattern(reason)}`;
      if (!groups.has(key)) groups.set(key, { scope, sample: reason, ids: new Set(), lastAt: c.createdAt });
      const g = groups.get(key);
      g.ids.add(c.id);
      if (c.createdAt > g.lastAt) g.lastAt = c.createdAt;
    }
  }
  return [...groups.values()]
    .filter((g) => g.ids.size >= 2) // 2+ occurrences = a pattern, not a one-off
    .map((g) => ({
      scope: g.scope,
      text: lessonText(g.scope, g.sample),
      evidenceCount: g.ids.size,
      evidenceIds: [...g.ids],
      lastEvidenceAt: g.lastAt,
    }));
}

/** Calibration joins (P15) -> timing/topic/script lessons. */
function distillFromCalibration() {
  const posts = collection("myposts").find((m) => (m.statsSnapshots || []).length > 0);
  if (posts.length < 5) return [];
  const views = (m) => (m.statsSnapshots || []).slice(-1)[0]?.views || 0;
  const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
  const overall = median(posts.map(views));
  const lessons = [];
  const dim = (keyFn, scope, label) => {
    const groups = {};
    for (const p of posts) {
      const k = keyFn(p);
      if (k) (groups[k] ??= []).push(views(p));
    }
    const ranked = Object.entries(groups).filter(([, v]) => v.length >= 2).map(([k, v]) => [k, median(v)]).sort((a, b) => b[1] - a[1]);
    if (ranked.length >= 2 && overall > 0) {
      const [top, topMed] = ranked[0];
      const [bot, botMed] = ranked[ranked.length - 1];
      if (topMed / overall >= 1.15) lessons.push({ scope, text: `${label} "${top}" outperforms your median (${(topMed / overall).toFixed(2)}×) — favor it.`, evidenceCount: groups[top].length, evidenceIds: [], lastEvidenceAt: new Date().toISOString() });
      if (botMed / overall <= 0.85) lessons.push({ scope, text: `${label} "${bot}" underperforms (${(botMed / overall).toFixed(2)}×) — avoid or rework.`, evidenceCount: groups[bot].length, evidenceIds: [], lastEvidenceAt: new Date().toISOString() });
    }
  };
  dim((p) => p.hookPattern, "script", "hook pattern");
  dim((p) => p.pillar, "topic", "pillar");
  const slot = (p) => { const h = (new Date(p.postedAt).getUTCHours() + 5) % 24; return h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night"; };
  dim(slot, "timing", "posting slot");
  return lessons;
}

function lessonText(scope, sample) {
  const s = sample.toLowerCase();
  if (s.includes("banned")) return "Never open with generic phrases (‘you won’t believe’, ‘wait for it’). Lead with the concrete payoff.";
  if (s.includes("caption") && s.includes("scale")) return "Keep captions at ≥60% scale — small captions fail the VisualJudge for mobile readability.";
  if (s.includes("dead air") || s.includes("silence")) return "Trim dead air >1.5s; keep the voice track continuous.";
  if (s.includes("weak title")) return "Titles need a number, named tool, or outcome — thin titles fail the MetadataJudge.";
  if (s.includes("placeholder") || s.includes("[fill")) return "Never ship [fill:] placeholders — fill every field before rendering.";
  if (s.includes("pacing") || s.includes("slow")) return "Change the beat every ≤5-9s; slow pacing loses the viewer.";
  if (s.includes("hook") && s.includes("long")) return "The hook must land in ~2 seconds — keep the opening line short.";
  if (s.includes("description")) return "Always write a keyword-rich 2-line description.";
  if (s.includes("tag")) return "Use niche-specific tags, never generic ones (video/viral/fyp).";
  return `Address the recurring issue: ${sample.slice(0, 80)}`;
}

async function llmPhrase(lessons) {
  if (!providerStatus().active || !lessons.length) return lessons;
  try {
    const res = await chat({
      task: "score",
      maxTokens: 1500,
      system:
        `Rewrite these draft content-creation lessons as crisp, actionable rules for: ${NICHE_CONTEXT}. ` +
        'Keep the same order and count. Reply ONLY JSON: {"texts":["...","..."]}',
      user: lessons.map((l, i) => `${i}. [${l.scope}] ${l.text}`).join("\n"),
    });
    const p = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
    if (Array.isArray(p.texts) && p.texts.length === lessons.length) return lessons.map((l, i) => ({ ...l, text: p.texts[i] || l.text }));
  } catch {
    /* keep coded */
  }
  return lessons;
}

export async function distillLessons() {
  loadEnv();
  const candidates = await llmPhrase([...distillFromCritiques(), ...distillFromCalibration()]);
  const store = collection("lessons");
  let added = 0;
  let merged = 0;
  for (const c of candidates) {
    const existing = store.all().find((l) => l.scope === c.scope && l.text === c.text);
    if (existing) {
      const ids = [...new Set([...(existing.evidenceIds || []), ...c.evidenceIds])];
      store.update(existing.id, { evidenceCount: Math.max(existing.evidenceCount, ids.length || c.evidenceCount), evidenceIds: ids, lastEvidenceAt: c.lastEvidenceAt, active: true });
      merged++;
    } else {
      store.upsert({ id: newId(), ...c, active: true, pinned: false, createdAt: new Date().toISOString() });
      added++;
    }
  }
  deactivateStale();
  return { added, merged, total: store.count(), candidates: candidates.length };
}

export function deactivateStale() {
  const store = collection("lessons");
  for (const l of store.all()) {
    if (l.pinned) continue;
    const stale = (Date.now() - new Date(l.lastEvidenceAt || l.createdAt).getTime()) / 864e5 > STALE_DAYS;
    if (stale && l.active) store.update(l.id, { active: false });
  }
}

/* ---------------- injection ---------------- */

/** Top-K active lessons for a scope, formatted for a system prompt. */
export function lessonsFor(scope, k = K) {
  const top = collection("lessons")
    .find((l) => l.active && l.scope === scope)
    .map((l) => ({ ...l, w: lessonWeight(l) }))
    .sort((a, b) => b.w - a.w)
    .slice(0, k);
  if (!top.length) return { block: "", lessons: [] };
  const block = `\nLESSONS FROM MY OWN RESULTS (obey these):\n${top.map((l) => `- ${l.text}`).join("\n")}`;
  return { block, lessons: top };
}

export function pinLesson(id, pinned) {
  return collection("lessons").update(id, { pinned: Boolean(pinned), active: true });
}
export function killLesson(id) {
  return collection("lessons").update(id, { active: false });
}
