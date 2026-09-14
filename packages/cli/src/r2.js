/**
 * `factory r2` — push finished renders off this machine and get shareable links.
 *
 * The point: renders live on this laptop's disk, so a finished video is
 * unreachable the moment it sleeps. R2 makes it downloadable from anywhere with
 * zero egress cost. Uses only R2's S3 API — no DNS, no Workers, no public
 * bucket, so it cannot interfere with the site hosted on this Cloudflare account.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "../../shared/src/config.js";
import {
  FREE_TIER_BYTES,
  RENDER_CEILING_BYTES,
  RETAIN_HOURS,
  deleteObject,
  getLifecycle,
  isConfigured,
  listObjects,
  missingConfig,
  presignGet,
  pruneExpired,
  pushFile,
  putLifecycle,
  usage,
} from "../../shared/src/r2.js";

const rendersDir = path.join(repoRoot, "renders");
const kb = (n) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)}GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`);
const gbs = (n) => `${(n / 1024 ** 3).toFixed(1)}GB`;
const pad = (s, n) => String(s).padEnd(n);

const UPLOADABLE = /\.(mp4|png|jpg|webp)$/i;

/**
 * Every uploadable file under a render, including subdirectories.
 *
 * This used to read only the top level, so thumbs/ and carousel/ were never
 * pushed - the Packaging page showed 14 broken images because the files it asks
 * for had never left the laptop.
 */
function filesFor(id) {
  const dir = path.join(rendersDir, id);
  if (!existsSync(dir)) return null;
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (UPLOADABLE.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

function allRenderIds() {
  if (!existsSync(rendersDir)) return [];
  return readdirSync(rendersDir).filter((d) => statSync(path.join(rendersDir, d)).isDirectory());
}

function requireConfig() {
  if (isConfigured()) return true;
  console.log(`\n  R2 is not configured. Missing: ${missingConfig().join(", ")}`);
  console.log(`\n  Add to .env:`);
  console.log(`    R2_ACCOUNT_ID=...          Cloudflare dashboard -> R2 -> account ID`);
  console.log(`    R2_ACCESS_KEY_ID=...       R2 -> Manage API Tokens -> Create (Object Read & Write)`);
  console.log(`    R2_SECRET_ACCESS_KEY=...`);
  console.log(`    R2_BUCKET=content-factory-renders`);
  console.log(`\n  Scope the token to the ONE bucket. A bucket is storage only — it has no`);
  console.log(`  domain and cannot affect any site on the same account.\n`);
  return false;
}

export async function r2(argv) {
  const [action, ...rest] = argv;
  const targs = rest.filter((a) => !a.startsWith("--"));

  switch (action) {
    /* ---------------------------------------------------- status --- */
    case undefined:
    case "status": {
      console.log("");
      if (!isConfigured()) {
        requireConfig();
        return true;
      }
      console.log(`  configured  bucket "${process.env.R2_BUCKET}"`);
      const local = allRenderIds();
      let u;
      try {
        u = await usage();
      } catch (e) {
        console.log(`  could not list bucket: ${e.message}`);
        return false;
      }
      const remoteIds = new Set((await listObjects("renders/")).map((o) => o.key.split("/")[1]).filter(Boolean));

      // A bar makes "how close am I to the wall" readable at a glance, which a
      // byte count does not.
      const pct = u.bytes / FREE_TIER_BYTES;
      const width = 32;
      const filled = Math.min(width, Math.round(pct * width));
      const ceilAt = Math.round((RENDER_CEILING_BYTES / FREE_TIER_BYTES) * width);
      const bar = Array.from({ length: width }, (_, i) => (i < filled ? "#" : i === ceilAt ? "|" : ".")).join("");
      console.log(`  storage     [${bar}] ${(pct * 100).toFixed(1)}% of 10GB`);
      console.log(`              ${kb(u.bytes)} used · ${kb(u.headroom)} until the ${gbs(RENDER_CEILING_BYTES)} render ceiling ("|" above)`);
      if (u.overCeiling) {
        console.log(`              *** AT THE CEILING — new renders are BLOCKED until space is freed ***`);
      }
      console.log(`  objects     ${u.objects}`);
      console.log(`  local       ${local.length} render folder(s)`);

      // retention
      let lc = null;
      try {
        lc = await getLifecycle();
      } catch {
        /* non-fatal */
      }
      const lcText = !lc
        ? "NOT SET — see `factory r2 lifecycle`"
        : lc.unknown
          ? "cannot verify (object-scoped token) — check the dashboard"
          : `Cloudflare deletes after ${lc.days} day(s) [${lc.status}]`;
      console.log(`  retention   ${RETAIN_HOURS}h · ${lcText}`);
      if (u.expired.length) {
        console.log(`              ${u.expired.length} object(s) past ${RETAIN_HOURS}h holding ${kb(u.expiredBytes)} — free now: factory r2 prune`);
      }
      const missing = local.filter((id) => !remoteIds.has(id));
      if (missing.length) {
        console.log(`\n  ${missing.length} render(s) not yet pushed:`);
        for (const id of missing.slice(0, 12)) console.log(`    ${id}`);
        if (missing.length > 12) console.log(`    ...and ${missing.length - 12} more`);
        console.log(`\n  push them all:  factory r2 push --all`);
      } else if (local.length) {
        console.log(`\n  everything local is already in R2.`);
      }
      console.log("");
      return true;
    }

    /* ------------------------------------------------------ push --- */
    case "push": {
      if (!requireConfig()) return false;
      const all = rest.includes("--all");
      const ids = all ? allRenderIds() : targs;
      if (!ids.length) {
        console.log(`\nusage: factory r2 push <renderId> [more...]   |   factory r2 push --all`);
        console.log(`  render ids are the folder names under renders/\n`);
        return false;
      }
      let okCount = 0;
      let failCount = 0;
      for (const id of ids) {
        const files = filesFor(id);
        if (!files) {
          console.log(`  ✕ ${id} — no such folder under renders/`);
          failCount++;
          continue;
        }
        if (!files.length) {
          console.log(`  - ${id} — nothing uploadable (mp4/png/jpg/webp)`);
          continue;
        }
        console.log(`\n  ${id}`);
        for (const f of files) {
          try {
            const r = await pushFile(id, f);
            console.log(`    ↑ ${pad(path.basename(f), 22)} ${kb(r.bytes)}`);
            okCount++;
          } catch (e) {
            console.log(`    ✕ ${pad(path.basename(f), 22)} ${String(e.message).slice(0, 110)}`);
            failCount++;
          }
        }
      }
      console.log(`\n  ${okCount} uploaded${failCount ? `, ${failCount} failed` : ""}`);
      if (okCount) console.log(`  get links:  factory r2 url <renderId>\n`);
      return failCount === 0;
    }

    /* ------------------------------------------------------- url --- */
    case "url": {
      if (!requireConfig()) return false;
      const id = targs[0];
      if (!id) {
        console.log(`\nusage: factory r2 url <renderId> [--days=7]`);
        console.log(`  prints time-limited download links (max 7 days, R2's ceiling)\n`);
        return false;
      }
      const daysArg = rest.find((a) => a.startsWith("--days="));
      const days = Math.min(7, Math.max(1, Number(daysArg?.split("=")[1]) || 7));
      let objects;
      try {
        objects = await listObjects(`renders/${id}/`);
      } catch (e) {
        console.log(`  ${e.message}`);
        return false;
      }
      if (!objects.length) {
        console.log(`\n  nothing in R2 for "${id}" — push it first:  factory r2 push ${id}\n`);
        return false;
      }
      console.log(`\n  ${objects.length} file(s), links valid ${days} day(s):\n`);
      for (const o of objects) {
        console.log(`  ${path.basename(o.key)}  (${kb(o.size)})`);
        console.log(`  ${presignGet(o.key, days * 86400)}\n`);
      }
      return true;
    }

    /* ------------------------------------------------------ list --- */
    case "list": {
      if (!requireConfig()) return false;
      let objects;
      try {
        objects = await listObjects(targs[0] ? `renders/${targs[0]}/` : "renders/");
      } catch (e) {
        console.log(`  ${e.message}`);
        return false;
      }
      if (!objects.length) return console.log("\n  bucket is empty under renders/\n"), true;
      console.log("");
      for (const o of objects) {
        console.log(`  ${pad(kb(o.size), 9)} ${pad((o.modified || "").slice(0, 10), 12)} ${o.key}`);
      }
      console.log(`\n  ${objects.length} object(s), ${kb(objects.reduce((a, o) => a + o.size, 0))}\n`);
      return true;
    }

    /* ----------------------------------------------------- prune --- */
    case "prune": {
      if (!requireConfig()) return false;
      const dry = rest.includes("--dry-run");
      const r = await pruneExpired({ dryRun: dry });
      if (!r.removed.length && !r.failed.length) {
        console.log(`
  nothing is past ${RETAIN_HOURS}h — nothing to delete`);
        console.log(`  currently ${kb(r.before.bytes)} used, ${kb(r.before.headroom)} of headroom
`);
        return true;
      }
      console.log(`
  ${dry ? "WOULD delete" : "deleted"} ${r.removed.length} object(s) past ${RETAIN_HOURS}h:
`);
      for (const o of r.removed.slice(0, 20)) console.log(`    ${pad(kb(o.size), 9)} ${o.key}`);
      if (r.removed.length > 20) console.log(`    ...and ${r.removed.length - 20} more`);
      for (const f of r.failed) console.log(`    FAILED ${f.key} — ${f.error}`);
      console.log(`
  ${dry ? "would free" : "freed"} ${kb(r.freed)}
`);
      return r.failed.length === 0;
    }

    /* -------------------------------------------------------- rm --- */
    case "rm": {
      if (!requireConfig()) return false;
      const id = targs[0];
      if (!id) {
        console.log(`
usage: factory r2 rm <renderId>`);
        console.log(`  deletes that render from R2 permanently. The local copy is untouched.
`);
        return false;
      }
      const objs = await listObjects(`renders/${id}/`);
      if (!objs.length) return console.log(`
  nothing in R2 under renders/${id}/
`), true;
      const freed = objs.reduce((a, o) => a + o.size, 0);
      for (const o of objs) {
        await deleteObject(o.key);
        console.log(`    removed ${pad(kb(o.size), 9)} ${o.key}`);
      }
      console.log(`
  deleted ${objs.length} object(s), freed ${kb(freed)}`);
      console.log(`  (renders/${id}/ on this machine is untouched)
`);
      return true;
    }

    /* ------------------------------------------------- lifecycle --- */
    case "lifecycle": {
      if (!requireConfig()) return false;
      const daysFlag = rest.find((a) => a.startsWith("--days="));
      const days = Math.max(1, Number(daysFlag ? daysFlag.split("=")[1] : 2) || 2);
      try {
        const r = await putLifecycle({ days, prefix: "renders/" });
        console.log(`
  Cloudflare will now delete renders/ objects after ${r.days} day(s).
`);
        return true;
      } catch (e) {
        console.log(`
  ${e.message}
`);
        // A forbidden lifecycle call is a known, documented limitation of the
        // safer token scope, not a failure of this command.
        return e.code === "LIFECYCLE_FORBIDDEN";
      }
    }


    default:
      console.log(`unknown: r2 ${action}\n  status · push · url · list · prune · rm · lifecycle`);
      return false;
  }
}
