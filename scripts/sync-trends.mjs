/**
 * Pull cloud-collected trends down to this machine.
 *
 * The `collect trends` GitHub Action runs every 6h without this laptop and
 * parks the result on an orphan `factory-data` branch. This brings it local so
 * the portal, briefs and scoring see the same data the cloud collected.
 *
 * Safe by design: it refuses to overwrite a LARGER local file unless forced,
 * because trends.json is cumulative. A smaller remote file means the cloud lost
 * state (first run after a reset, a failed restore), and silently clobbering
 * weeks of local collection with it is the one unrecoverable mistake here.
 *
 *   node scripts/sync-trends.mjs          fetch and merge-safe replace
 *   node scripts/sync-trends.mjs --force  replace regardless of size
 *   node scripts/sync-trends.mjs --check  report only, change nothing
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const local = path.join(root, "data", "trends.json");
const force = process.argv.includes("--force");
const checkOnly = process.argv.includes("--check");

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const kb = (n) => `${Math.round(n / 1024)}KB`;
const count = (buf) => {
  try {
    const t = JSON.parse(buf);
    const a = Array.isArray(t) ? t : t.items || t.trends || [];
    return Array.isArray(a) ? a.length : null;
  } catch {
    return null;
  }
};

// --- does the data branch exist? -------------------------------------------
let hasBranch = true;
try {
  git("ls-remote", "--exit-code", "--heads", "origin", "factory-data");
} catch {
  hasBranch = false;
}
if (!hasBranch) {
  console.log("\n  No `factory-data` branch on origin yet.");
  console.log("  The collect workflow creates it on its first run.");
  console.log("  Trigger one: GitHub -> Actions -> 'collect trends' -> Run workflow\n");
  process.exit(0);
}

// --- fetch it ---------------------------------------------------------------
git("fetch", "--depth=1", "origin", "factory-data");
const remoteBuf = execFileSync("git", ["show", "FETCH_HEAD:trends.json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const remoteWhen = git("log", "-1", "--format=%cI", "FETCH_HEAD");

const remoteSize = Buffer.byteLength(remoteBuf);
const localSize = existsSync(local) ? statSync(local).size : 0;

console.log("");
console.log(`  remote  ${kb(remoteSize)}  ${count(remoteBuf) ?? "?"} items   collected ${remoteWhen}`);
if (localSize) {
  const localBuf = readFileSync(local, "utf8");
  console.log(`  local   ${kb(localSize)}  ${count(localBuf) ?? "?"} items`);
} else {
  console.log(`  local   (none)`);
}

if (checkOnly) {
  console.log("\n  --check: nothing written\n");
  process.exit(0);
}

// --- the guard --------------------------------------------------------------
if (localSize > remoteSize && !force) {
  console.log("");
  console.log(`  REFUSING to overwrite: local is ${kb(localSize - remoteSize)} larger than remote.`);
  console.log("  trends.json is cumulative, so a smaller remote usually means the cloud");
  console.log("  lost state rather than that it found less. Nothing was changed.");
  console.log("");
  console.log("  If you're sure the remote is the good copy:  node scripts/sync-trends.mjs --force");
  console.log("");
  process.exit(1);
}

// --- write, keeping one backup ---------------------------------------------
mkdirSync(path.dirname(local), { recursive: true });
if (localSize) {
  copyFileSync(local, `${local}.bak`);
}
writeFileSync(local, remoteBuf);

console.log("");
console.log(`  wrote data/trends.json  (${kb(remoteSize)})`);
if (localSize) console.log(`  previous copy kept at data/trends.json.bak`);
console.log("");
