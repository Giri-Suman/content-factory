import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    // Strip ONE layer of matching surrounding quotes, like dotenv does.
    // Pasting a key as KEY="sk-or-..." is the natural thing to do, and without
    // this the quotes travel into the value: the Authorization header became
    // `Bearer "sk-or-…"` and OpenRouter answered 401 "Missing Authentication
    // header", which reads like a missing key rather than a quoted one.
    const value = m[2].replace(/^(['"])([\s\S]*)\1$/, "$2");
    parsed[m[1]] = value;
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
  return parsed;
}

/** Create the gitignored working directories on first run. */
export function ensureDirs() {
  for (const dir of [paths.data, paths.renders]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

/** Injected into every Content OS LLM prompt (CLAUDE.md: niche context). */
export const NICHE_CONTEXT =
  "senior front-end developer creating content on coding, AI automation, and AI tools, " +
  "for developers and tech-curious freelancers, India + global English audience, timezone IST";

/* ---------- user config (data/config.json — the portal's settings) ---------- */

const CONFIG_PATH = path.join(paths.data, "config.json");

export const DEFAULT_CONFIG = {
  // which content niches the trend radar scans — toggled in Mission Control
  categories: { coding: true, ai: true, math: false, makeup: false },
  // P21: auto-swap thumbnail A->B after 72h if views lag the channel median.
  // OFF by default — the honest path is the Studio A/B step in the checklist,
  // since real CTR/impressions aren't exposed by the API.
  thumbnailTimedSwap: false,
};

export function loadUserConfig() {
  if (existsSync(CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
      return {
        ...DEFAULT_CONFIG,
        ...cfg,
        categories: { ...DEFAULT_CONFIG.categories, ...(cfg.categories || {}) },
      };
    } catch {
      /* corrupted file -> defaults */
    }
  }
  return structuredClone(DEFAULT_CONFIG);
}

export function saveUserConfig(cfg) {
  ensureDirs();
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  return cfg;
}
