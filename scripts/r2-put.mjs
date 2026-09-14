/**
 * Put one local file into R2. Used by CI to hand a build back to the laptop.
 *
 *   node scripts/r2-put.mjs <localFile> <r2Key>
 *
 * WHY THIS EXISTS: a bundle built on Windows is broken at runtime (see the
 * "React Server Consumer Manifest" note in lessons.md), so the only correct
 * bundle comes from Linux CI. GitHub artifacts need an authenticated download,
 * and R2 credentials already exist on both sides — so CI drops the build here
 * and the laptop picks it up with the keys it already has.
 */

import { readFileSync } from "node:fs";
import { putObject } from "../packages/shared/src/r2.js";

const [file, key] = process.argv.slice(2);
if (!file || !key) {
  console.error("usage: node scripts/r2-put.mjs <localFile> <r2Key>");
  process.exit(1);
}

const buf = readFileSync(file);
await putObject(key, buf, { contentType: "application/gzip" });
console.log(`uploaded ${file} -> ${key} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
