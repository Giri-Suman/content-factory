import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "../../shared/src/config.js";
import { screenshot } from "../../shared/src/chrome.js";
import { collection, newId } from "../../shared/src/store.js";
import { addReceipt } from "./claims.js";
import { assertSafeUrl } from "../../shared/src/safeUrl.js";

/**
 * EVIDENCE CAPTURE — first-hand receipts for the coding / AI-automation /
 * tool-review verticals.
 *
 * Adapted from the "Hands" block of the AI Content Factory idea: drive real
 * software and capture what it actually shows, instead of describing it from
 * memory. Their version uses Playwright; this uses the system Chrome the repo
 * already drives for HTML-to-PNG, because Playwright ships its own browser
 * bundle and this machine has ~4.5GB free on C:.
 *
 * The point is not the screenshot. The point is that it closes the loop with
 * the claims map: a shot of a pricing page IS the receipt for a price claim.
 * The failure that motivated the claims map — a model inventing "$8" for a
 * product nobody named — has an exact analog here ("this tool costs $20/mo"),
 * and this makes the receipt automatic rather than a chore.
 *
 * SAFETY: captured pages are treated as IMAGES, never as text fed back into a
 * prompt. A tool's landing page is untrusted content; screenshotting it is
 * safe, but piping its copy into an LLM would not be.
 */

const EVIDENCE_DIR = path.join(repoRoot, "renders", "_evidence");

const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "shot";

/**
 * The shots a tool review actually needs. Named presets, because "capture the
 * pricing page" is the reusable intent — not a viewport size.
 */
export const PRESETS = {
  page: { width: 1440, height: 900, note: "standard desktop view" },
  full: { width: 1440, height: 3200, note: "tall capture for a long landing or docs page" },
  pricing: { width: 1440, height: 1600, note: "pricing tables run long — this is the receipt for any cost claim" },
  mobile: { width: 390, height: 844, note: "how it looks on a phone" },
  square: { width: 1080, height: 1080, note: "drops straight into a carousel slide" },
};

/**
 * Capture one URL.
 * @returns {{ id, url, file, bytes, preset, at }}
 */
export async function capture(url, { preset = "page", name = null, settleMs = 3500 } = {}) {
  /**
   * SSRF guard, checked AFTER DNS resolution — an attacker controls their own
   * DNS, so validating the hostname string would catch nothing. Verified
   * before this existed: capturing 169.254.169.254 succeeded, and on a cloud
   * host that endpoint serves instance credentials.
   */
  url = await assertSafeUrl(url);
  const p = PRESETS[preset];
  if (!p) throw new Error(`unknown preset "${preset}" — one of: ${Object.keys(PRESETS).join(", ")}`);

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const base = `${slug(name || url)}-${preset}-${new Date().toISOString().slice(0, 10)}.png`;
  const file = path.join(EVIDENCE_DIR, base);

  screenshot(url, file, { width: p.width, height: p.height, settleMs });
  const bytes = statSync(file).size;

  const row = {
    id: newId(),
    url,
    file: path.relative(repoRoot, file),
    bytes,
    preset,
    name: name || null,
    at: new Date().toISOString(),
  };
  collection("evidence").upsert(row, (r) => r.file === row.file);
  return row;
}

/**
 * Capture a URL AND attach it as the receipt for a specific claim.
 *
 * This is the whole reason the module exists: "Cursor is $20/month" stops
 * being an assertion and becomes a screenshot of the pricing page, dated.
 */
export async function captureForClaim(briefId, claimText, url, { preset = "pricing", settleMs = 3500 } = {}) {
  const shot = await capture(url, { preset, name: claimText, settleMs });
  addReceipt(briefId, claimText, `${shot.file}  (captured ${shot.at.slice(0, 10)} from ${url})`);
  return shot;
}

/** Everything captured, newest first. */
export const evidenceLog = () =>
  collection("evidence")
    .all()
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));

/**
 * A tool review's standard evidence set. One command, four receipts —
 * landing, pricing, docs and the mobile view.
 */
export async function captureToolReview(toolName, baseUrl, { pricingPath = "/pricing", docsPath = "/docs" } = {}) {
  const root = String(baseUrl).replace(/\/+$/, "");
  const jobs = [
    [`${root}`, "page", `${toolName} landing`],
    [`${root}${pricingPath}`, "pricing", `${toolName} pricing`],
    [`${root}${docsPath}`, "full", `${toolName} docs`],
    [`${root}`, "mobile", `${toolName} mobile`],
  ];
  const shots = [];
  const failures = [];
  for (const [url, preset, name] of jobs) {
    try {
      shots.push(await capture(url, { preset, name }));
    } catch (e) {
      // a missing /pricing or /docs is normal — record it, keep going
      failures.push({ url, error: e.message.slice(0, 120) });
    }
  }
  return { tool: toolName, shots, failures };
}
