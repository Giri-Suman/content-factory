import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./config.js";

/**
 * Content OS storage: tiny JSON collections under data/os/.
 * This is the repo's Prisma-replacement (hard rule: no native deps).
 * One file per collection: { updatedAt, rows: [{ id, ... }] }.
 * Writes are atomic (tmp + rename) so a crash can't corrupt a store.
 */

const OS_DIR = path.join(repoRoot, "data", "os");


/**
 * Sync sleep. `Atomics.wait` is the only way to pause without returning to the
 * event loop, and the store API is synchronous everywhere it is used.
 */
const SLEEPER = new Int32Array(new SharedArrayBuffer(4));
const sleepSync = (ms) => {
  Atomics.wait(SLEEPER, 0, 0, ms);
};

const LOCK_TIMEOUT_MS = 5000;
/** A holder that died leaves its lock behind; nothing here runs for 30s. */
const LOCK_STALE_MS = 30000;

/**
 * Run `fn` with an exclusive cross-process lock on one collection file.
 *
 * WHY: every mutation is read-modify-write, and three processes touch data/os/
 * at once - the queue watcher, the CLI, and whatever the portal queued. Two
 * interleaved upserts mean the second one writes rows it read before the first
 * one saved, and the first row silently disappears. Atomic tmp+rename protects
 * a single write from tearing; it does nothing about a lost update.
 *
 * mkdir is the lock because it is atomic on both Windows and POSIX and needs no
 * native dependency, which is a hard rule in this repo.
 */
function withLock(file, fn) {
  const lockDir = `${file}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      mkdirSync(lockDir);
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      try {
        if (Date.now() - statSync(lockDir).mtimeMs > LOCK_STALE_MS) {
          rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue; // vanished between the check and the stat - try to take it
      }
      if (Date.now() > deadline) {
        throw new Error(`store: could not lock ${path.basename(file)} after ${LOCK_TIMEOUT_MS}ms`);
      }
      sleepSync(25);
    }
  }
  try {
    return fn();
  } finally {
    try {
      rmSync(lockDir, { recursive: true, force: true });
    } catch {
      /* releasing a lock must never mask the real error */
    }
  }
}

export const newId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function collection(name) {
  const file = path.join(OS_DIR, `${name}.json`);

  /**
   * A corrupt file reads as empty so one bad byte cannot take the pipeline
   * down - but see `write`: that emptiness must never overwrite its own source.
   */
  const read = () => {
    if (!existsSync(file)) return { updatedAt: null, rows: [], corrupt: false };
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      return { ...parsed, rows: parsed.rows || [], corrupt: false };
    } catch (e) {
      console.error(`  store: ${name}.json is unreadable (${String(e.message).slice(0, 70)}) - treating as empty`);
      return { updatedAt: null, rows: [], corrupt: true };
    }
  };

  /**
   * NEVER let a write destroy a file it could not read.
   *
   * read() degrades a corrupt file to zero rows. Without this guard the next
   * upsert saved those zero rows back over the original - one unparseable byte
   * silently became "the collection is empty", real data gone, no error
   * anywhere. The bad file is copied aside first so the content survives even
   * if nobody notices for a week.
   */
  const write = (rows) => {
    mkdirSync(OS_DIR, { recursive: true });
    if (existsSync(file) && read().corrupt) {
      const kept = `${file}.corrupt-${Date.now()}`;
      copyFileSync(file, kept);
      console.error(`  store: kept unreadable ${name}.json as ${path.basename(kept)} before overwriting`);
    }
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ updatedAt: new Date().toISOString(), rows }, null, 2));
    renameSync(tmp, file);
    return rows;
  };

  return {
    name,
    file,
    all: () => read().rows,
    get: (id) => read().rows.find((r) => r.id === id) || null,
    find: (fn) => read().rows.filter(fn),
    count: () => read().rows.length,
    save: (rows) => withLock(file, () => write(rows)),
    /** Insert or merge by id (or by a custom key fn). Returns the stored row. */
    upsert(row, keyFn = (r) => r.id) {
      return withLock(file, () => {
        const rows = read().rows;
        const key = keyFn(row);
        const i = rows.findIndex((r) => keyFn(r) === key);
        if (i === -1) {
          const stored = { ...row, id: row.id || newId() };
          rows.push(stored);
          write(rows);
          return stored;
        }
        rows[i] = { ...rows[i], ...row, id: rows[i].id || row.id || newId() };
        write(rows);
        return rows[i];
      });
    },
    update(id, patch) {
      return withLock(file, () => {
        const rows = read().rows;
        const i = rows.findIndex((r) => r.id === id);
        if (i === -1) return null;
        rows[i] = { ...rows[i], ...patch, id };
        write(rows);
        return rows[i];
      });
    },
    remove(id) {
      withLock(file, () => write(read().rows.filter((r) => r.id !== id)));
    },
  };
}

/**
 * Shape validation for LLM JSON output (the repo's zod-replacement).
 * spec: { field: "string" | "number" | "boolean" | "array" | "object" |
 *         "string?" ... (optional) }
 * Returns { ok, errors[] }. Callers retry once on !ok, then degrade.
 */
export function validateShape(obj, spec) {
  const errors = [];
  if (!obj || typeof obj !== "object") return { ok: false, errors: ["not an object"] };
  for (const [field, typeRaw] of Object.entries(spec)) {
    const optional = typeRaw.endsWith("?");
    const type = optional ? typeRaw.slice(0, -1) : typeRaw;
    const val = obj[field];
    if (val === undefined || val === null) {
      if (!optional) errors.push(`missing ${field}`);
      continue;
    }
    const actual = Array.isArray(val) ? "array" : typeof val;
    if (actual !== type) errors.push(`${field}: expected ${type}, got ${actual}`);
  }
  return { ok: errors.length === 0, errors };
}
