import { existsSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// repo root = three levels up from packages/shared/src/
export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
);

export const paths = {
  root: repoRoot,
  env: path.join(repoRoot, ".env"),
  data: path.join(repoRoot, "data"),
  renders: path.join(repoRoot, "renders"),
  assets: path.join(repoRoot, "assets"),
};

/**
 * Minimal .env parser — KEY=value lines, # comments, no quotes magic.
 * Populates process.env without overriding values already set, and
 * returns the parsed map. Safe to call when .env doesn't exist yet.
 */
export function loadEnv() {
  const parsed = {};
  if (!existsSync(paths.env)) return parsed;
  for (const line of readFileSync(paths.env, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    parsed[m[1]] = m[2];
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
  return parsed;
}

/** Create the gitignored working directories on first run. */
export function ensureDirs() {
  for (const dir of [paths.data, paths.renders]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}
