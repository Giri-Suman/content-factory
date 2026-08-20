/**
 * `factory sync` — share this machine's state with cloud jobs.
 *
 * Both paths stay: local operation is unchanged. This copies data/ to R2 so a
 * runner can borrow it, and copies results back.
 */

import path from "node:path";
import { isConfigured, missingConfig } from "../../shared/src/r2.js";
import { listFootage, pullFootage, pullState, pushFootage, pushState, stateFiles } from "../../shared/src/stateSync.js";

const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`);
const pad = (s, n) => String(s).padEnd(n);

export async function sync(argv) {
  const [action = "status", ...rest] = argv;
  const targs = rest.filter((a) => !a.startsWith("--"));

  if (!isConfigured()) {
    console.log(`\n  R2 is not configured. Missing: ${missingConfig().join(", ")}\n`);
    return false;
  }

  switch (action) {
    case "status": {
      const local = stateFiles();
      const foot = await listFootage();
      console.log("");
      console.log(`  local state   : ${local.length} files`);
      console.log(`  footage in R2 : ${foot.length} file(s), ${kb(foot.reduce((a, f) => a + f.size, 0))}`);
      if (foot.length) for (const f of foot.slice(0, 8)) console.log(`      ${pad(kb(f.size), 8)} ${f.name}`);
      const d = await pullState({ dryRun: true });
      if (d.error) console.log(`  remote state  : ${d.error}`);
      else console.log(`  remote state  : pushed ${d.at}  (${d.written.length} would change locally, ${d.same.length} identical)`);
      console.log(`\n  push:  factory sync push        pull:  factory sync pull\n`);
      return true;
    }

    case "push": {
      const r = await pushState({ force: rest.includes("--force") });
      console.log(`\n  pushed ${r.pushed.length} of ${r.total} state file(s)${r.skipped.length ? `, ${r.skipped.length} unchanged` : ""}`);
      for (const p of r.pushed.slice(0, 10)) console.log(`    ${pad(kb(p.bytes), 8)} ${p.rel}`);
      if (r.pushed.length > 10) console.log(`    ...and ${r.pushed.length - 10} more`);
      console.log("");
      return true;
    }

    case "pull": {
      const r = await pullState({ dryRun: rest.includes("--dry-run") });
      if (r.error) return console.log(`\n  ${r.error}\n`), false;
      console.log(`\n  state from ${r.at}`);
      console.log(`  ${r.dryRun ? "would write" : "wrote"} ${r.written.length} file(s), ${r.same.length} already identical`);
      for (const w of r.written.slice(0, 10)) console.log(`    ${w}`);
      console.log("");
      return true;
    }

    /* Footage is pushed per file — it is large and only edit jobs need it. */
    case "footage": {
      const sub = targs[0];
      if (sub === "push") {
        const name = targs.slice(1).join(" ");
        if (!name) return console.log("\nusage: factory sync footage push <file name>\n"), false;
        const r = await pushFootage(name);
        console.log(`\n  uploaded ${kb(r.bytes)} -> ${r.key}`);
        console.log(`  a cloud edit can now use: ${path.basename(name)}\n`);
        return true;
      }
      if (sub === "pull") {
        const name = targs.slice(1).join(" ");
        if (!name) return console.log("\nusage: factory sync footage pull <file name>\n"), false;
        const r = await pullFootage(name);
        console.log(`\n  downloaded ${kb(r.bytes)} -> ${r.file}\n`);
        return true;
      }
      const list = await listFootage();
      if (!list.length) return console.log("\n  no footage in R2 — factory sync footage push <file>\n"), true;
      console.log("");
      for (const f of list) console.log(`  ${pad(kb(f.size), 9)} ${pad((f.modified || "").slice(0, 10), 12)} ${f.name}`);
      console.log("");
      return true;
    }

    default:
      console.log(`unknown: sync ${action}\n  status · push · pull · footage [push|pull]`);
      return false;
  }
}
