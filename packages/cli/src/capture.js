import { PRESETS, capture as shoot, captureForClaim, captureToolReview, evidenceLog } from "../../studio/src/capture.js";

const pad = (s, n) => String(s).padEnd(n);
const flag = (args, name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

export async function capture(argv) {
  const [rawAction, ...rest] = argv;
  const action = rawAction === "--help" || rawAction === "-h" ? undefined : rawAction;
  const targs = rest.filter((a) => !a.startsWith("--"));

  switch (action) {
    /* -------------------------------------------------- presets --- */
    case "presets": {
      console.log("");
      for (const [k, v] of Object.entries(PRESETS)) {
        console.log(`  ${pad(k, 9)} ${pad(`${v.width}x${v.height}`, 11)} ${v.note}`);
      }
      console.log("");
      return true;
    }

    /* ----------------------------------------------------- tool --- */
    case "tool": {
      const [name, url] = targs;
      if (!name || !url) {
        console.log('usage: factory capture tool <name> <baseUrl> [--pricing=/plans] [--docs=/documentation]');
        console.log("  captures landing + pricing + docs + mobile in one go — the standard review set");
        return false;
      }
      console.log(`\ncapturing the review set for ${name}…\n`);
      const r = captureToolReview(name, url, {
        pricingPath: flag(rest, "pricing") || "/pricing",
        docsPath: flag(rest, "docs") || "/docs",
      });
      for (const s of r.shots) console.log(`  ✓ ${pad(s.preset, 8)} ${Math.round(s.bytes / 1024)}KB  ${s.file}`);
      for (const f of r.failures) console.log(`  ✕ ${f.url}\n      ${f.error}`);
      console.log(`\n  ${r.shots.length} captured${r.failures.length ? `, ${r.failures.length} unavailable (a missing /pricing or /docs is normal)` : ""}`);
      console.log(`  the pricing shot is the receipt for any cost claim — attach it:`);
      console.log(`    factory capture claim <briefId> "<the claim>" <url>\n`);
      return true;
    }

    /* ---------------------------------------------------- claim --- */
    case "claim": {
      const [briefId, ...restArgs] = targs;
      const claimText = restArgs.slice(0, -1).join(" ");
      const url = restArgs[restArgs.length - 1];
      if (!briefId || !claimText || !url || !/^https?:\/\//i.test(url)) {
        console.log('usage: factory capture claim <briefId> "<the claim>" <url>');
        console.log('  e.g. factory capture claim ms123 "Cursor costs $20 per month" https://cursor.com/pricing');
        return false;
      }
      const s = captureForClaim(briefId, claimText, url, { preset: flag(rest, "preset") || "pricing" });
      console.log(`\n  captured ${s.file} (${Math.round(s.bytes / 1024)}KB)`);
      console.log(`  attached as the receipt for: "${claimText}"`);
      console.log(`\n  verify with: factory claims map ${briefId}\n`);
      return true;
    }

    /* ------------------------------------------------------ log --- */
    case "log": {
      const rows = evidenceLog();
      if (!rows.length) return console.log("\n  nothing captured yet — factory capture tool <name> <url>\n"), true;
      console.log(`\n  ${rows.length} capture(s)\n`);
      for (const r of rows.slice(0, 25)) {
        console.log(`  ${pad(r.at.slice(0, 10), 12)} ${pad(r.preset, 8)} ${pad(Math.round(r.bytes / 1024) + "KB", 7)} ${r.name || r.url}`);
        console.log(`               ${r.file}`);
      }
      console.log("");
      return true;
    }

    /* ------------------------------------------------------ url --- */
    case undefined:
    case "url": {
      const url = targs[0];
      if (!url) {
        console.log(`\nusage:`);
        console.log(`  factory capture url <url> [--preset=page|full|pricing|mobile|square] [--name=…]`);
        console.log(`  factory capture tool <name> <baseUrl>          the standard 4-shot review set`);
        console.log(`  factory capture claim <briefId> "<claim>" <url>  capture AND attach as a receipt`);
        console.log(`  factory capture log · presets\n`);
        console.log(`  Uses the system Chrome this repo already drives — no Playwright, no extra download.`);
        console.log(`  Interaction flows (clicking, forms, login) are the one thing it cannot do.\n`);
        return true;
      }
      const s = shoot(url, { preset: flag(rest, "preset") || "page", name: flag(rest, "name") });
      console.log(`  ${s.file}  (${Math.round(s.bytes / 1024)}KB, ${s.preset})`);
      return true;
    }

    default:
      console.log(`unknown: capture ${action}\n  url · tool · claim · log · presets`);
      return false;
  }
}
