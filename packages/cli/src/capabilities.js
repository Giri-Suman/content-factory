import { capabilitySummary, licenseReport } from "../../shared/src/capabilities.js";
import { blockedModels, MODEL_LICENSES } from "../../shared/src/licenses.js";
import { seasonalTopics, upcoming } from "../../studio/src/seasonal.js";

const pad = (s, n) => String(s).padEnd(n);
const MARK = { live: "●", built: "○", adapter: "◐", nongoal: "✕" };

export async function capabilities(argv) {
  const [rawAction, ...rest] = argv;
  const action = rawAction === "--help" || rawAction === "-h" ? undefined : rawAction;
  const targs = rest.filter((a) => !a.startsWith("--"));

  switch (action) {
    /* ------------------------------------------------ licences ---- */
    case "licenses":
    case "licences": {
      const blocked = blockedModels();
      console.log(`\n  ${Object.keys(MODEL_LICENSES).length} models in the registry · ${blocked.length} BLOCKED for commercial use\n`);
      console.log(`  This channel monetises, so licence is a legal question, not a preference.`);
      console.log(`  Rule: cut by licence FIRST, then quality.\n`);
      console.log(`  ✕ BLOCKED — cannot be used for monetised output:\n`);
      for (const b of blocked) {
        console.log(`    ${pad(b.id, 15)} ${b.license}`);
        console.log(`    ${" ".repeat(15)} ${b.note}`);
      }
      const safe = Object.entries(MODEL_LICENSES).filter(([, v]) => v.status === "commercial");
      const copyleft = Object.entries(MODEL_LICENSES).filter(([, v]) => v.status === "copyleft");
      console.log(`\n  ✓ commercial-safe: ${safe.length}`);
      const byKind = {};
      for (const [id, v] of safe) (byKind[v.kind] ??= []).push(id);
      for (const [kind, ids] of Object.entries(byKind)) console.log(`      ${pad(kind, 11)} ${ids.join(", ")}`);
      if (copyleft.length) {
        console.log(`\n  ~ copyleft (output is yours; care only if redistributing the tool):`);
        for (const [id, v] of copyleft) console.log(`      ${pad(id, 11)} ${v.license}`);
      }
      console.log("");
      return true;
    }

    /* ------------------------------------------------ seasonal ---- */
    case "seasonal": {
      const niche = targs[0] ? [targs[0]] : null;
      const rows = upcoming({ niches: niche, withinDays: 75 });
      if (!rows.length) return console.log("\n  nothing in the next 75 days for that niche\n"), true;
      console.log(`\n  Demand that arrives on a date — the radar cannot see these coming.\n`);
      console.log(`  ${pad("PUBLISH BY", 12)} ${pad("EVENT", 30)} ${pad("IN", 6)} NICHES`);
      console.log("  " + "-".repeat(74));
      for (const s of rows) {
        const flag = s.urgency === "late" ? "LATE" : s.urgency === "now" ? "NOW " : "    ";
        console.log(`  ${pad(s.publishBy, 12)} ${pad(s.label, 30)} ${pad(s.daysAway + "d", 6)} ${s.niches.join(", ")}  ${flag}`);
      }
      console.log(`\n  angles ready to brief:\n`);
      for (const t of seasonalTopics({ niches: niche, withinDays: 75, limit: 8 })) {
        console.log(`    ${pad(t.publishBy, 12)} ${t.topic}`);
      }
      console.log(`\n  brief one directly:  factory brief "<angle>"\n`);
      return true;
    }

    /* --------------------------------------------------- report ---- */
    case undefined:
    case "report": {
      const s = capabilitySummary();
      console.log(`\n  ${s.total} capabilities · ${s.live} live · ${s.built} built-but-blocked · ${s.adapter} needs hardware · ${s.nongoal} deliberate non-goals\n`);
      let stage = "";
      for (const r of s.rows) {
        if (r.stage !== stage) {
          console.log(`  ${r.stage.toUpperCase()}`);
          stage = r.stage;
        }
        console.log(`    ${MARK[r.status]} ${pad(r.label, 34)} ${r.detail || ""}`);
        if (r.status === "built") console.log(`      ${" ".repeat(34)} ↳ code is here, its dependency is not`);
      }
      console.log(`\n  ● live   ○ built, dependency missing   ◐ needs GPU/weights this machine can't host   ✕ deliberate non-goal\n`);

      const lic = licenseReport();
      if (lic.blocked.length) {
        console.log(`  ${lic.blocked.length} models are licence-BLOCKED — see \`factory capabilities licenses\`\n`);
      }
      return true;
    }

    default:
      console.log(`unknown: capabilities ${action}\n  report · licenses · seasonal [niche]`);
      return false;
  }
}
