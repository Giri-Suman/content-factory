import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { paths } from "../../shared/src/config.js";

/** Publish ledger — the audit trail + the basis for the ≤2/day/platform rule. */
const LOG_PATH = path.join(paths.data, "published.json");

export function readLog() {
  if (!existsSync(LOG_PATH)) return { entries: [] };
  try {
    return JSON.parse(readFileSync(LOG_PATH, "utf8"));
  } catch {
    return { entries: [] };
  }
}

export function appendLog(entry) {
  mkdirSync(paths.data, { recursive: true });
  const log = readLog();
  log.entries.push({ ...entry, at: new Date().toISOString() });
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

/** How many times we've published to `platform` in the last 24h. */
export function countToday(platform) {
  const cutoff = Date.now() - 24 * 36e5;
  return readLog().entries.filter((e) => e.platform === platform && new Date(e.at).getTime() >= cutoff && !e.dryRun)
    .length;
}
