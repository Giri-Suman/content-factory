import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "../../shared/src/config.js";
import { countToday } from "./log.js";
import { claimsMap } from "../../studio/src/claims.js";

/**
 * Pre-publish lint. Enforces the master plan's non-negotiables so nothing
 * ships on the wrong side of YouTube's inauthentic-content line. Returns
 * { pass, checks: [{ id, level: ok|warn|fail, msg }] }.
 * A single `fail` blocks publishing; `warn`s are surfaced but don't block.
 */

const scriptsDir = path.join(repoRoot, "data", "scripts");
const rendersDir = path.join(repoRoot, "renders");

export function checkCompliance(id, { platform = "youtube" } = {}) {
  const checks = [];
  const add = (level, msg, cid) => checks.push({ id: cid, level, msg });

  const scriptPath = path.join(scriptsDir, `${id}.json`);
  const renderDir = path.join(rendersDir, id);
  const script = existsSync(scriptPath) ? JSON.parse(readFileSync(scriptPath, "utf8")) : null;

  // 1 — a finished render must exist
  const wide = path.join(renderDir, "wide.mp4");
  const short = path.join(renderDir, "short.mp4");
  const hasVideo = existsSync(wide) || existsSync(short);
  add(hasVideo ? "ok" : "fail", hasVideo ? "rendered video present" : "no rendered MP4 — render first", "render");

  // 2 — human review gate: the script was edited/approved (reviewedAt stamped on save)
  if (script?.reviewedAt) {
    add("ok", `human review logged (${new Date(script.reviewedAt).toLocaleString()})`, "review");
  } else if (script) {
    add("fail", "no human review — open it in the editor and Save/Approve first", "review");
  } else {
    add("warn", "no script.json found (a math short or imported clip) — confirm you reviewed it", "review");
  }

  // 3 — synthetic-media disclosure must be declared
  const synthetic = script ? script.synthetic !== false : true; // AI voice/visuals => synthetic by default
  add(
    synthetic ? "ok" : "warn",
    synthetic
      ? "will set the altered/synthetic-content disclosure"
      : "marked non-synthetic — make sure that's true (own face/voice, no AI visuals)",
    "disclosure"
  );

  // 4 — no verbatim source narration (the Jan-2026 termination profile)
  if (script?.scenes?.length) {
    const words = script.scenes.reduce((n, s) => n + (s.voiceover || "").split(/\s+/).length, 0);
    const sameFirst = script.scenes.filter((s) => /^https?:\/\//.test((s.voiceover || "").trim())).length;
    if (words < 40) add("warn", "very short script — thin content risks the inauthentic-content policy", "content");
    else add("ok", `${words} words of original narration`, "content");
    if (sameFirst) add("fail", "a scene's voiceover is just a URL — write original narration", "content-url");
  }

  // 5 — rate limit: ≤2 real uploads/day/platform
  const today = countToday(platform);
  if (today >= 2) add("fail", `already published ${today}× to ${platform} today — spam pattern; wait`, "rate");
  else add("ok", `${today}/2 uploads to ${platform} in the last 24h`, "rate");

  // 6 — metadata present
  const title = script?.title || (existsSync(path.join(scriptsDir, `${id}.meta.json`)) ? "meta" : null);
  add(title ? "ok" : "warn", title ? "title present" : "no title — set one before upload", "title");

  /**
   * 7 — unbacked numeric claims.
   *
   * A WARN rather than a FAIL: the number may be true and only you know that.
   * But a price or a duration going out with nothing behind it is the class of
   * mistake that gets a creator called out, and on beauty content it is a
   * product claim. Real output invented "This $8 primer" for a product that
   * was never named, so this is not hypothetical.
   */
  try {
    const briefId = script?.briefId || id.replace(/^brief-/, "");
    const m = claimsMap(briefId);
    if (m.unbackedNumeric > 0) {
      add("warn", `${m.unbackedNumeric} unbacked numeric claim(s) — run \`factory claims map ${briefId}\``, "claims");
    } else if (m.total) {
      add("ok", `${m.total} claim(s), every number has a receipt`, "claims");
    }
  } catch {
    /* no brief, or claims unavailable — never block publishing on this check */
  }

  const pass = !checks.some((c) => c.level === "fail");
  return { pass, checks };
}

/** Build YouTube metadata from a script + its meta sidecar. */
export function buildMetadata(id, overrides = {}) {
  const scriptPath = path.join(scriptsDir, `${id}.json`);
  const metaPath = path.join(scriptsDir, `${id}.meta.json`);
  const script = existsSync(scriptPath) ? JSON.parse(readFileSync(scriptPath, "utf8")) : {};
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
  return {
    title: (overrides.title || script.title || id).slice(0, 100),
    description: (overrides.description || meta.description || script.outro?.cta || "").slice(0, 4900),
    tags: (overrides.tags || meta.tags || []).slice(0, 15),
    categoryId: overrides.categoryId || "28", // Science & Technology
    privacyStatus: overrides.privacyStatus || "private", // NEVER public without explicit intent
    synthetic: script.synthetic !== false,
  };
}
