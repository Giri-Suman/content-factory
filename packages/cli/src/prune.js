import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot } from "../../shared/src/config.js";
import { collection } from "../../shared/src/store.js";

/**
 * factory prune — data hygiene. Pays down the growth debt: the JSON store
 * re-serializes a whole collection on every write, so an unbounded
 * trends.json makes every single upsert slower forever.
 *
 * Conservative by design: never touches anything referenced by a brief,
 * cluster, or publish item, and always writes a .bak first. --dry by
 * default so you see the plan before anything moves.
 */

const DEFAULTS = { trendDays: 30, snapshotsPerItem: 10, jobruns: 200, critiques: 1000, quota: 2000 };

export async function prune(argv = []) {
  loadEnv();
  const apply = argv.includes("--apply");
  // explicit 0 must mean zero — `Number(x) || default` silently eats it
  const rawDays = (argv.find((a) => a.startsWith("--days=")) || "").split("=")[1];
  const days = rawDays !== undefined && rawDays !== "" && Number.isFinite(Number(rawDays)) ? Number(rawDays) : DEFAULTS.trendDays;
  const plan = [];

  /* ---- trends: drop old, unused, unreferenced ---- */
  const trendsPath = path.join(repoRoot, "data", "trends.json");
  if (existsSync(trendsPath)) {
    const store = JSON.parse(readFileSync(trendsPath, "utf8"));
    const trends = store.trends || {};
    const cutoff = Date.now() - days * 864e5;
    // anything a cluster still points at is off-limits
    const referenced = new Set();
    for (const c of collection("clusters").all()) for (const id of c.memberIds || []) referenced.add(id);
    const doomed = Object.values(trends).filter(
      (t) => !t.used && !referenced.has(t.id) && new Date(t.last_seen).getTime() < cutoff
    );
    plan.push({
      what: "trends",
      before: Object.keys(trends).length,
      remove: doomed.length,
      keptBecause: `used, cluster-referenced, or newer than ${days}d`,
      sizeKB: Math.round(statSync(trendsPath).size / 1024),
      run: () => {
        for (const t of doomed) delete trends[t.id];
        writeFileSync(`${trendsPath}.bak`, readFileSync(trendsPath));
        writeFileSync(trendsPath, JSON.stringify(store, null, 1));
      },
    });
  }

  /* ---- snapshots: keep the newest N per item (velocity only needs 2) ---- */
  const snaps = collection("snapshots");
  const allSnaps = snaps.all();
  if (allSnaps.length) {
    const byItem = new Map();
    for (const s of allSnaps) {
      if (!byItem.has(s.itemId)) byItem.set(s.itemId, []);
      byItem.get(s.itemId).push(s);
    }
    const keep = [];
    for (const list of byItem.values()) {
      list.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
      keep.push(...list.slice(0, DEFAULTS.snapshotsPerItem));
    }
    plan.push({
      what: "snapshots",
      before: allSnaps.length,
      remove: allSnaps.length - keep.length,
      keptBecause: `newest ${DEFAULTS.snapshotsPerItem} per item`,
      run: () => snaps.save(keep),
    });
  }

  /* ---- capped logs ---- */
  for (const [name, cap] of [["jobruns", DEFAULTS.jobruns], ["critiques", DEFAULTS.critiques], ["quota", DEFAULTS.quota]]) {
    const col = collection(name);
    const all = col.all();
    if (all.length > cap) {
      plan.push({
        what: name,
        before: all.length,
        remove: all.length - cap,
        keptBecause: `newest ${cap}`,
        run: () => col.save(all.slice(-cap)),
      });
    }
  }

  /* ---- resolved escalations + decided title tests ---- */
  const escCol = collection("escalations");
  const escOld = escCol.all().filter((e) => e.resolved);
  if (escOld.length) {
    plan.push({
      what: "escalations (resolved)",
      before: escCol.count(),
      remove: escOld.length,
      keptBecause: "unresolved only",
      run: () => escCol.save(escCol.all().filter((e) => !e.resolved)),
    });
  }

  /* ---- report ---- */
  console.log(`\nprune plan (${apply ? "APPLYING" : "dry run — add --apply to execute"}):\n`);
  let total = 0;
  for (const p of plan) {
    total += p.remove;
    console.log(`  ${p.what.padEnd(24)} ${String(p.before).padStart(6)} -> ${String(p.before - p.remove).padStart(6)}   (-${p.remove})`);
    console.log(`  ${" ".repeat(24)} keeps: ${p.keptBecause}`);
  }
  if (!total) {
    console.log("  nothing to prune — stores are within limits\n");
    return { pruned: 0 };
  }
  if (apply) {
    for (const p of plan) p.run();
    const newKB = existsSync(path.join(repoRoot, "data", "trends.json")) ? Math.round(statSync(path.join(repoRoot, "data", "trends.json")).size / 1024) : 0;
    console.log(`\n  removed ${total} rows · trends.json now ${newKB}KB · .bak written\n`);
  } else {
    console.log(`\n  ${total} rows would be removed\n`);
  }
  console.log(`RESULT ${JSON.stringify({ pruned: apply ? total : 0, planned: total, applied: apply })}`);
  return { pruned: apply ? total : 0, planned: total };
}
