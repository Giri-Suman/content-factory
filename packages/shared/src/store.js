import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./config.js";

/**
 * Content OS storage: tiny JSON collections under data/os/.
 * This is the repo's Prisma-replacement (hard rule: no native deps).
 * One file per collection: { updatedAt, rows: [{ id, ... }] }.
 * Writes are atomic (tmp + rename) so a crash can't corrupt a store.
 */

const OS_DIR = path.join(repoRoot, "data", "os");

export const newId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function collection(name) {
  const file = path.join(OS_DIR, `${name}.json`);

  const read = () => {
    if (!existsSync(file)) return { updatedAt: null, rows: [] };
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return { updatedAt: null, rows: [] }; // corrupt file = empty, never crash
    }
  };

  const write = (rows) => {
    mkdirSync(OS_DIR, { recursive: true });
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
    save: write,
    /** Insert or merge by id (or by a custom key fn). Returns the stored row. */
    upsert(row, keyFn = (r) => r.id) {
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
    },
    update(id, patch) {
      const rows = read().rows;
      const i = rows.findIndex((r) => r.id === id);
      if (i === -1) return null;
      rows[i] = { ...rows[i], ...patch, id };
      write(rows);
      return rows[i];
    },
    remove(id) {
      const rows = read().rows.filter((r) => r.id !== id);
      write(rows);
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
