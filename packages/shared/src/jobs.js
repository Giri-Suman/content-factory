import { collection, newId } from "./store.js";

/**
 * JobRun ledger (data/os/jobruns.json) — every pipeline run logs here so
 * the dashboard and the future worker can show what ran, when, and how it
 * went. Keeps the newest 200 runs.
 */

const MAX_RUNS = 200;

export async function withJobRun(job, fn) {
  const jobruns = collection("jobruns");
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const finish = (ok, error, extra) => {
    const rows = jobruns.all();
    rows.push({ id: newId(), job, startedAt, ms: Date.now() - t0, ok, error: error || null, ...extra });
    jobruns.save(rows.slice(-MAX_RUNS));
  };
  try {
    const result = await fn();
    finish(true, null, result && typeof result === "object" ? { summary: result.summary ?? null } : {});
    return result;
  } catch (err) {
    finish(false, String(err?.message || err).slice(0, 300));
    throw err;
  }
}

export function recentJobRuns(limit = 30) {
  return collection("jobruns").all().slice(-limit).reverse();
}
