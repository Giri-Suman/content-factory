import { collection } from "../../shared/src/store.js";
import { getByIds, getAllTrends } from "../../radar/src/db.js";
import { evidenceFloor, entityGrounding, poolConfidence } from "../../radar/src/evidence.js";
import { quotesForCluster, quoteCoverage } from "../../radar/src/quotes.js";
// Reuse the radar's own baselines. Reimplementing them here produced a direct
// contradiction — `report` called Diátaxis a 4.3× spike while `ground` called
// it unproven — because this copy lacked the VELOCITY_BASELINES seed defaults.
import { velocityBaselines } from "../../radar/src/clusters.js";

const pad = (s, n) => String(s).padEnd(n);
const baselines = () => velocityBaselines(getAllTrends());

export async function evidence(argv) {
  // --help is a usage request, not an unknown subcommand
  const [rawAction, ...rest] = argv;
  const action = rawAction === "--help" || rawAction === "-h" ? undefined : rawAction;
  const targs = rest.filter((a) => !a.startsWith("--"));
  const clusters = collection("clusters").all();
  const base = baselines();

  const classify = (c) => ({ c, evidence: c.evidence || evidenceFloor(c, getByIds(c.memberIds || []), { baselines: base }) });

  switch (action) {
    /* ------------------------------------------------------ report --- */
    case undefined:
    case "report": {
      const rows = clusters.map(classify);
      const pool = poolConfidence(rows);
      console.log(`\n  ${pool.verdict}\n`);
      console.log(`  corroborated ${pool.corroborated}   ·   spiking ${pool.spike}   ·   unproven ${pool.unproven}   of ${pool.total}\n`);

      const good = rows.filter((r) => r.evidence.promotable).sort((a, b) => b.c.opportunityScore - a.c.opportunityScore);
      if (good.length) {
        console.log(`  PROMOTABLE — these have real evidence behind them:\n`);
        for (const r of good.slice(0, 12)) {
          console.log(`   ${String(r.c.opportunityScore).padStart(3)}  ${pad(r.evidence.level, 13)} ${String(r.c.label).slice(0, 46)}`);
          console.log(`        ${r.evidence.why}`);
        }
      } else {
        console.log(`  Nothing is promotable. The ranked table still has a top row — that is what`);
        console.log(`  relative scoring does — but it is not a lead.\n`);
        const top = rows.sort((a, b) => b.c.opportunityScore - a.c.opportunityScore)[0];
        if (top) console.log(`  top row "${String(top.c.label).slice(0, 44)}": ${top.evidence.why}`);
      }
      console.log(`\n  ${quoteCoverage(clusters).note}\n`);
      return true;
    }

    /* ------------------------------------------------------ quotes --- */
    case "quotes": {
      const filter = targs[0]?.toLowerCase();
      let shown = 0;
      // community-bearing clusters first — showing press releases at the top
      // of a "community quotes" listing buries the only thing worth reading
      const ordered = clusters
        .map((c) => ({ c, qs: quotesForCluster(c, { limit: 3 }) }))
        .sort((a, b) => (b.qs.some((q) => q.voice === "community") ? 1 : 0) - (a.qs.some((q) => q.voice === "community") ? 1 : 0));
      for (const { c, qs } of ordered) {
        if (filter && !String(c.label).toLowerCase().includes(filter)) continue;
        if (!qs.length) continue;
        console.log(`\n  ${String(c.label).slice(0, 62)}`);
        for (const q of qs) {
          console.log(`    [${q.voice}] "${q.text.slice(0, 132)}"`);
          console.log(`             — ${q.author}${q.engagement ? ` · ${q.engagement} engagement` : ""}`);
        }
        if (++shown >= (filter ? 20 : 8)) break;
      }
      if (!shown) {
        console.log(`\n  no quotable text${filter ? ` for "${filter}"` : ""} yet.`);
        console.log(`  run \`factory radar collect\` — HN discussions attach on each pass.\n`);
        return true;
      }
      console.log(`\n  verbatim and attributed. Never paraphrase these into a script — quoting a`);
      console.log(`  real person means quoting them exactly.\n`);
      return true;
    }

    /* ------------------------------------------------------ ground --- */
    case "ground": {
      const label = targs.join(" ");
      if (!label) return console.log('usage: factory evidence ground "<cluster label>"'), false;
      const c = clusters.find((x) => String(x.label).toLowerCase().includes(label.toLowerCase()));
      if (!c) return console.log(`no cluster matching "${label}"`), false;
      const members = getByIds(c.memberIds || []);
      console.log(`\n  ${c.label}\n`);
      for (const m of members) {
        const g = entityGrounding(c.label, m);
        console.log(`   ${g.grounded ? "keep  " : "DEMOTE"} ×${g.multiplier}  ${pad(m.source, 16)} ${String(m.title).slice(0, 46)}`);
        console.log(`            ${g.detail}`);
      }
      const ev = evidenceFloor(c, members, { baselines: base });
      console.log(`\n   → ${ev.level}: ${ev.why}\n`);
      return true;
    }

    default:
      console.log(`unknown: evidence ${action}\n  report · quotes [filter] · ground "<label>"`);
      return false;
  }
}
