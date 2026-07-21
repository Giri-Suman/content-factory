import { collection, newId } from "../../shared/src/store.js";

/**
 * P19 Prompt Evolution. Every major generation prompt is versioned. The
 * system may PROPOSE a new version (weekly memo), but the human approves
 * every promotion — it never silently rewrites its own prompts.
 */

export const TASKS = ["script", "metadata", "idea", "brief"];

const BASE = {
  script: "Compile a brief into renderer scenes: open with a kinetic hook, 3-5 scenes, ~8s each, concrete payoff.",
  metadata: "Write a keyword-rich title (number/tool/outcome), 2-line description, niche-specific tags.",
  idea: "Rate an idea for niche fit, novelty, and hook potential.",
  brief: "Write a multi-platform brief; concrete hooks only, no generic openers.",
};

/** Seed v1 for any task that has no versions yet. */
export function ensureBaseVersions() {
  const store = collection("promptversions");
  for (const task of TASKS) {
    if (!store.all().some((v) => v.task === task)) {
      store.upsert({ id: newId(), task, version: 1, template: BASE[task], active: true, retired: false, createdAt: new Date().toISOString() });
    }
  }
}

export function versionsFor(task) {
  return collection("promptversions").find((v) => v.task === task).sort((a, b) => b.version - a.version);
}

export function activeVersion(task) {
  return collection("promptversions").find((v) => v.task === task && v.active)[0] || null;
}

/** Propose a new version (diff vs the active one) — NOT activated. */
export function proposeVersion(task, template) {
  ensureBaseVersions();
  const versions = versionsFor(task);
  const next = (versions[0]?.version || 0) + 1;
  return collection("promptversions").upsert({
    id: newId(),
    task,
    version: next,
    template,
    active: false,
    retired: false,
    proposed: true,
    createdAt: new Date().toISOString(),
  });
}

/** Manual approve: activate a proposed version, retire the old active one. */
export function approveVersion(versionId) {
  const store = collection("promptversions");
  const v = store.get(versionId);
  if (!v) return null;
  for (const other of store.find((x) => x.task === v.task && x.active)) store.update(other.id, { active: false, retired: true });
  return store.update(versionId, { active: true, proposed: false, approvedAt: new Date().toISOString() });
}
