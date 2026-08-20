/**
 * Reconcile cloud-collected trends with this machine's copy.
 *
 * The GitHub Action collects every 6h without this laptop and parks the result
 * on an orphan `factory-data` branch. This brings it home.
 *
 * MERGE, not replace. The first real sync proved why: local had 497 trends,
 * the cloud had 292, and only 271 were shared — so each side held records the
 * other did not (226 local-only, 21 cloud-only). Copying either direction
 * destroys the difference. `trends` is a map keyed by id, so a union is both
 * possible and obviously correct.
 *
 * Per-record merge rules matter for scoring:
 *   first_seen -> EARLIEST of the two
 *   last_seen  -> LATEST of the two
 * Velocity is derived from how long an item has been observed, so widening that
 * window with the other side's sightings is the whole point of syncing. Taking
 * one record wholesale would throw away half the observation history.
 *
 *   node scripts/sync-trends.mjs           merge remote into local
 *   node scripts/sync-trends.mjs --check   report the difference, change nothing
 *   node scripts/sync-trends.mjs --push    merge, then push the union back up so
 *                                          the cloud continues from it too
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const local = path.join(root, "data", "trends.json");
const checkOnly = process.argv.includes("--check");
const doPush = process.argv.includes("--push");

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
const kb = (n) => `${Math.round(n / 1024)}KB`;
const empty = () => ({ trends: {}, cursors: {} });

/* -------------------------------------------------------------- fetch --- */

let hasBranch = true;
try {
  git("ls-remote", "--exit-code", "--heads", "origin", "factory-data");
} catch {
  hasBranch = false;
}
if (!hasBranch) {
  console.log("\n  No `factory-data` branch yet — the collect workflow creates it on its first run.");
  console.log("  GitHub -> Actions -> 'collect trends' -> Run workflow\n");
  process.exit(0);
}

git("fetch", "--depth=1", "origin", "factory-data");
const remoteRaw = git("show", "FETCH_HEAD:trends.json");
const remoteWhen = git("log", "-1", "--format=%cI", "FETCH_HEAD").trim();

const parse = (s, label) => {
  try {
    const o = JSON.parse(s);
    return { trends: o.trends || {}, cursors: o.cursors || {} };
  } catch (e) {
    console.error(`\n  ${label} trends.json is not valid JSON: ${e.message}\n`);
    process.exit(1);
  }
};

const remote = parse(remoteRaw, "remote");
const localRaw = existsSync(local) ? readFileSync(local, "utf8") : JSON.stringify(empty());
const mine = parse(localRaw, "local");

/* -------------------------------------------------------------- merge --- */

const older = (a, b) => (!a ? b : !b ? a : a < b ? a : b);
const newer = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

function mergeRecord(a, b) {
  if (!a) return b;
  if (!b) return a;
  // Prefer whichever was seen most recently as the base — it has the freshest
  // points/comments/score — then widen the observation window from both.
  const base = (b.last_seen || "") > (a.last_seen || "") ? { ...a, ...b } : { ...b, ...a };
  base.first_seen = older(a.first_seen, b.first_seen);
  base.last_seen = newer(a.last_seen, b.last_seen);
  // Never un-mark work that has already happened on either side.
  base.used = a.used || b.used;
  base.alerted = a.alerted || b.alerted;
  return base;
}

const allIds = new Set([...Object.keys(mine.trends), ...Object.keys(remote.trends)]);
const mergedTrends = {};
let widened = 0;
for (const id of allIds) {
  const a = mine.trends[id];
  const b = remote.trends[id];
  const m = mergeRecord(a, b);
  if (a && b && (m.first_seen !== a.first_seen || m.last_seen !== a.last_seen)) widened++;
  mergedTrends[id] = m;
}
const mergedCursors = { ...mine.cursors };
for (const [k, v] of Object.entries(remote.cursors)) {
  mergedCursors[k] = newer(String(mergedCursors[k] ?? ""), String(v)) || v;
}
const merged = { trends: mergedTrends, cursors: mergedCursors };
const mergedText = JSON.stringify(merged, null, 2);

/* ------------------------------------------------------------- report --- */

const lk = Object.keys(mine.trends).length;
const rk = Object.keys(remote.trends).length;
const shared = Object.keys(remote.trends).filter((k) => k in mine.trends).length;

console.log("");
console.log(`  remote   ${String(rk).padStart(5)} trends  ${kb(Buffer.byteLength(remoteRaw))}   collected ${remoteWhen}`);
console.log(`  local    ${String(lk).padStart(5)} trends  ${kb(Buffer.byteLength(localRaw))}`);
console.log("");
console.log(`  in both  ${String(shared).padStart(5)}`);
console.log(`  new from cloud ${String(rk - shared).padStart(4)}`);
console.log(`  local only     ${String(lk - shared).padStart(4)}  (kept — a merge never drops these)`);
console.log(`  MERGED   ${String(allIds.size).padStart(5)} trends  ${kb(Buffer.byteLength(mergedText))}`);
if (widened) console.log(`  ${widened} record(s) gained a wider first_seen/last_seen window — better velocity data`);

if (checkOnly) {
  console.log("\n  --check: nothing written\n");
  process.exit(0);
}

/* -------------------------------------------------------------- write --- */

mkdirSync(path.dirname(local), { recursive: true });
if (existsSync(local)) copyFileSync(local, `${local}.bak`);
writeFileSync(local, mergedText);
console.log(`\n  wrote data/trends.json (previous copy kept as trends.json.bak)`);

/* --------------------------------------------------------------- push --- */

if (!doPush) {
  console.log(`  the cloud still has only its ${rk} — push the union so it continues from yours:`);
  console.log(`    npm run sync:trends -- --push\n`);
  process.exit(0);
}

// Build the single-commit data branch in a temp dir, exactly as the workflow
// does, so history never accumulates and the repo stays small.
const tmp = path.join(os.tmpdir(), `factory-data-${Date.now()}`);
mkdirSync(tmp, { recursive: true });
writeFileSync(path.join(tmp, "trends.json"), mergedText);
const tgit = (...args) => execFileSync("git", args, { cwd: tmp, encoding: "utf8" });
const origin = git("remote", "get-url", "origin").trim();
tgit("init", "-q");
tgit("checkout", "-q", "-b", "factory-data");
tgit("add", "trends.json");
tgit("-c", "user.name=factory-sync", "-c", "user.email=factory-sync@local", "commit", "-q", "-m", `merged trends @ ${new Date().toISOString()}`);
tgit("push", "-q", "-f", origin, "factory-data");
console.log(`  pushed the merged ${allIds.size} trends to factory-data — the cloud continues from this\n`);
