import { loadUserConfig } from "../../shared/src/config.js";
import { collection, newId } from "../../shared/src/store.js";
import { providerStatus } from "../../llm/src/llm.js";

/**
 * P18 generic judge-and-regenerate runner. One implementation for every
 * judge: judge -> if fail, regenerate with fixInstructions -> re-judge,
 * max 3 attempts. 3 fails (or cost-cap) -> escalate to Human Review.
 * Every attempt + critique is persisted (training data for P19).
 */

const MAX_ATTEMPTS = 3;
// rough per-call cost estimate for the cost guard (cheap model)
const COST_PER_LLM_CALL = 0.01;
const budget = () => loadUserConfig().qcBudgetPerVideo ?? 0.5;

function persistCritique(artifactType, artifactId, c, attempt) {
  const crit = collection("critiques");
  const row = {
    id: newId(),
    artifactType,
    artifactId,
    judge: c.judge,
    score: c.score,
    verdict: c.verdict,
    reasons: c.reasons,
    fixInstructions: c.fixInstructions,
    mode: c.mode,
    attempt,
    createdAt: new Date().toISOString(),
  };
  crit.save([...crit.all(), row].slice(-1000));
  return row;
}

/**
 * @param artifactType  "idea"|"script"|"metadata"|"visual"|"audio"
 * @param artifactId    stable id (briefId, ideaId…) for grouping critiques
 * @param judgeFn       async () => critique   (re-reads current artifact)
 * @param regenerateFn  async (fixInstructions) => void  (mutates artifact); null = not regenerable
 * @param costState     { spent } shared across a video's judges
 */
export async function judgeAndRegenerate({ artifactType, artifactId, judgeFn, regenerateFn, costState = { spent: 0 } }) {
  let attempt = 1;
  let critique = await judgeFn();
  if (critique.mode?.includes("llm")) costState.spent += COST_PER_LLM_CALL;
  persistCritique(artifactType, artifactId, critique, attempt);

  while (critique.verdict === "fail" && attempt < MAX_ATTEMPTS) {
    if (!regenerateFn) break; // not regenerable -> escalate below
    if (costState.spent >= budget()) {
      return { status: "escalated", reason: `QC budget $${budget()} exceeded`, critique, attempts: attempt };
    }
    if (critique.mode === "heuristic" && !providerStatus().active && !regenerateFn.codedFix) {
      break; // no key + no coded fix -> can't improve -> escalate
    }
    await regenerateFn(critique.fixInstructions);
    attempt++;
    critique = await judgeFn();
    if (critique.mode?.includes("llm")) costState.spent += COST_PER_LLM_CALL;
    persistCritique(artifactType, artifactId, critique, attempt);
  }

  if (critique.verdict === "pass") return { status: "passed", critique, attempts: attempt };
  return { status: "escalated", reason: `${attempt} attempt(s), still failing`, critique, attempts: attempt };
}

/* ---------------- dashboard aggregates ---------------- */

export function qcStats() {
  const crits = collection("critiques").all();
  const judges = ["idea", "script", "metadata", "visual", "audio"];
  const perJudge = judges.map((j) => {
    const rows = crits.filter((c) => c.judge === j);
    const passes = rows.filter((c) => c.verdict === "pass").length;
    return { judge: j, total: rows.length, passes, passRate: rows.length ? Math.round((passes / rows.length) * 100) : null };
  });
  const recentFailures = crits
    .filter((c) => c.verdict === "fail")
    .slice(-15)
    .reverse()
    .map((c) => ({ judge: c.judge, artifactId: c.artifactId, reasons: c.reasons, attempt: c.attempt, at: c.createdAt }));
  const escalations = collection("escalations").all().filter((e) => !e.resolved);
  return { perJudge, recentFailures, escalations, totalCritiques: crits.length };
}

export function escalate(artifactType, artifactId, reason) {
  const crits = collection("critiques").find((c) => c.artifactId === artifactId);
  const esc = collection("escalations");
  const row = { id: newId(), artifactType, artifactId, reason, critiques: crits.slice(-6), resolved: false, at: new Date().toISOString() };
  esc.save([...esc.all().filter((e) => e.artifactId !== artifactId), row]);
  return row;
}
