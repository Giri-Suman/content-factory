import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * System Chrome / Edge — the project's zero-dependency headless browser.
 *
 * The path list lived in FIVE files (doctor, carousel, prepare, stepCards,
 * thumbnails). Five copies of a lookup is five places to forget when a browser
 * moves, and the failure is silent: HTML-to-PNG just stops working in one
 * module while the others keep going.
 *
 * Deliberately NOT Playwright. Playwright downloads its own browser bundle
 * (hundreds of MB) and this machine has ~4.5GB free on C:. Headless Chrome
 * already screenshots a URL, which covers the evidence a tool review actually
 * needs. Interaction flows — clicking, forms, login — are the one thing it
 * cannot do; that is the Playwright tier, registered as an adapter rather than
 * installed.
 */

const CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

export const findChrome = () => CANDIDATES.find((p) => p && existsSync(p)) || null;

/**
 * Screenshot a URL (or a local file://) to PNG.
 *
 * `settleMs` maps to --virtual-time-budget, which lets the page finish its
 * initial render and fonts before the shot. Without it, a site with webfonts
 * or a fade-in animation captures mid-transition and the evidence is a
 * half-drawn page.
 */
export function screenshot(url, outFile, { width = 1440, height = 900, settleMs = 3500, scale = 1 } = {}) {
  const chrome = findChrome();
  if (!chrome) throw new Error("no Chrome or Edge found — install one, or run `factory doctor` to see what's missing");

  /**
   * Chrome resolves --screenshot against ITS OWN working directory, not the
   * caller's, so a relative path silently writes somewhere else and the caller
   * sees "produced no file". Resolve here rather than trusting every call site,
   * and make sure the directory exists — Chrome will not create it.
   */
  outFile = path.resolve(outFile);
  mkdirSync(path.dirname(outFile), { recursive: true });

  const res = spawnSync(
    `"${chrome}" --headless=new --disable-gpu --hide-scrollbars --no-sandbox ` +
      `--force-device-scale-factor=${scale} --window-size=${width},${height} ` +
      `--virtual-time-budget=${settleMs} --screenshot="${outFile}" "${url}"`,
    { shell: true, encoding: "utf8", windowsHide: true, timeout: 1000 * 90 }
  );
  if (!existsSync(outFile)) {
    throw new Error(`screenshot produced no file: ${(res.stderr || res.stdout || "chrome gave no output").slice(-300)}`);
  }
  return outFile;
}
