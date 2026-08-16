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
/**
 * Injected into every generation and judging prompt (17 modules).
 *
 * This used to describe a coding-only creator, which meant every LLM judgment
 * scored makeup, nails and math as "extreme niche misalignment" — the system
 * systematically rejected three of the four categories it is meant to serve.
 * A shared identity string is load-bearing precisely because it is everywhere;
 * getting it wrong is not a copy problem, it is a correctness problem.
 *
 * Use `nicheContextFor(niche)` when the category is known — a beauty brief
 * judged against the coding audience still scores badly even with this fixed.
 */
export const NICHE_CONTEXT =
  "a multi-category content studio covering four verticals: (1) coding and software engineering, " +
  "(2) AI automation and AI tools, (3) math explainers, and (4) makeup, beauty and nail art. " +
  "All four are equally core — never treat one as off-topic. India + global English audience, timezone IST";

/** Per-category audience, for when the brief's niche is known. */
export const NICHE_AUDIENCES = {
  coding: "working developers and tech-curious freelancers who watch fast, practical engineering content",
  "ai-automation": "developers and operators automating real workflows with AI tools and agents",
  math: "math-curious viewers who love visual proofs, paradoxes and 'wait, what?' moments; plus Indian exam prep",
  makeup: "beauty viewers judging real product results on real skin — technique breakdowns, dupes, honest reviews",
  nails: "nail-art viewers looking for achievable at-home designs, wear tests and festival looks",
  cooking: "home cooks who want a repeatable result, not a restaurant performance",
  fitness: "people training at home who care about form and consistency over intensity",
};

/** Specialised context. Falls back to the multi-category identity. */
export function nicheContextFor(niche) {
  const aud = NICHE_AUDIENCES[niche];
  if (!aud) return NICHE_CONTEXT;
  return `a content studio working in the "${niche}" vertical for ${aud}. India + global English audience, timezone IST`;
}

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
