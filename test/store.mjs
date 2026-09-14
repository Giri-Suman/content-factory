/**
 * Store guarantees that money and publishing decisions rest on.
 *
 * Run: node test/store.mjs
 *
 * These are the two failure modes that lose data silently rather than loudly:
 * a lost update from two processes writing at once, and a corrupt file being
 * "recovered" as an empty one. Both were live until this suite existed.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { collection } from "../packages/shared/src/store.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OS_DIR = path.join(root, "data", "os");
const NAME = "__storetest";
const FILE = path.join(OS_DIR, `${NAME}.json`);

let pass = 0;
let fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " — " + detail : ""}`);
  }
};

const cleanup = () => {
  for (const f of [FILE, `${FILE}.tmp`]) if (existsSync(f)) rmSync(f, { force: true });
  if (existsSync(`${FILE}.lock`)) rmSync(`${FILE}.lock`, { recursive: true, force: true });
};

mkdirSync(OS_DIR, { recursive: true });
cleanup();

/* ---------------------------------------------------------- lost update --- */
/**
 * Two processes appending at once. Without a cross-process lock the second
 * one writes rows it read before the first one saved, and appends are lost.
 */
{
  const c = collection(NAME);
  c.save([]);

  const storeUrl = pathToFileURL(path.join(root, "packages/shared/src/store.js")).href;
  /* spawn, NOT spawnSync: spawnSync blocks until the child exits, so two of
     them never overlap and the test proves nothing about concurrency. */
  const child = (tag, n) =>
    new Promise((resolve) => {
      const c = spawn(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import { collection } from ${JSON.stringify(storeUrl)};
           const c = collection(${JSON.stringify(NAME)});
           for (let i = 0; i < ${n}; i++) c.upsert({ id: ${JSON.stringify(tag)} + i, tag: ${JSON.stringify(tag)} });`,
        ],
        { cwd: root }
      );
      let stderr = "";
      c.stderr.on("data", (d) => (stderr += d));
      c.on("exit", (status) => resolve({ status, stderr }));
    });

  const [a, b] = await Promise.all([child("a", 25), child("b", 25)]);
  const errs = [a, b].filter((r) => r.status !== 0).map((r) => r.stderr.slice(0, 200));
  ok("concurrent writers both exit clean", errs.length === 0, errs.join(" | "));

  const rows = collection(NAME).all();
  ok("no appends lost under concurrency", rows.length === 50, `got ${rows.length} of 50`);
}

/* ------------------------------------------------- corrupt never wipes it --- */
{
  writeFileSync(FILE, "{ this is not json");
  const c = collection(NAME);

  ok("corrupt file reads as empty rather than throwing", c.all().length === 0);

  // the dangerous move: write after a failed read
  c.save([{ id: "fresh" }]);

  const kept = (await import("node:fs")).readdirSync(OS_DIR).filter((f) => f.startsWith(`${NAME}.json.corrupt-`));
  ok("the unreadable file is preserved, not discarded", kept.length === 1, `found ${kept.length} backups`);
  const keptText = readFileSync(path.join(OS_DIR, kept[0]), "utf8");
  ok("the preserved copy holds the original bytes", keptText === "{ this is not json");

  for (const f of kept) rmSync(path.join(OS_DIR, f), { force: true });
}

/* ------------------------------------------------------- stale lock break --- */
{
  cleanup();
  const c = collection(NAME);
  c.save([]);
  mkdirSync(`${FILE}.lock`, { recursive: true });
  // a lock this fresh must NOT be broken; the call should time out instead
  const started = Date.now();
  let threw = null;
  try {
    c.upsert({ id: "blocked" });
  } catch (e) {
    threw = e;
  }
  const waited = Date.now() - started;
  ok("a live lock blocks instead of corrupting", threw !== null && waited >= 4000, `waited ${waited}ms, threw=${Boolean(threw)}`);
  rmSync(`${FILE}.lock`, { recursive: true, force: true });
  c.upsert({ id: "after" });
  ok("the store works again once the lock clears", c.all().some((r) => r.id === "after"));
}

cleanup();
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
