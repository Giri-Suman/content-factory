import { addReceipt, claimsMap } from "../../studio/src/claims.js";
import { collection } from "../../shared/src/store.js";

const pad = (s, n) => String(s).padEnd(n);
const NUMERIC = new Set(["price", "duration", "percentage", "multiplier", "benchmark"]);

export async function claims(argv) {
  const [rawAction, ...rest] = argv;
  const action = rawAction === "--help" || rawAction === "-h" ? undefined : rawAction;
  const targs = rest.filter((a) => !a.startsWith("--"));

  switch (action) {
    /* --------------------------------------------------- receipt --- */
    case "receipt": {
      const [briefId, ...restArgs] = targs;
      const sep = restArgs.join(" ").split("::");
      if (!briefId || sep.length < 2) {
        console.log('usage: factory claims receipt <briefId> "<claim text>" :: "<your receipt>"');
        console.log('  the receipt is a file path, a URL, or a note about what you measured');
        console.log('  e.g. ... "lasted four hours" :: "photos/puja-4h-timestamped.jpg"');
        return false;
      }
      const r = addReceipt(briefId, sep[0].trim().replace(/^["']|["']$/g, ""), sep[1].trim().replace(/^["']|["']$/g, ""));
      console.log(`receipt attached to ${briefId}`);
      console.log(`  claim  : ${r.claimText.slice(0, 70)}`);
      console.log(`  receipt: ${r.receipt}`);
      return true;
    }

    /* ----------------------------------------------------- audit --- */
    case "audit": {
      const briefs = collection("briefs").filter
        ? collection("briefs").all()
        : collection("briefs").all();
      const rows = [];
      for (const b of briefs) {
        if (b.status === "killed") continue;
        try {
          const m = claimsMap(b.id);
          if (m.total) rows.push(m);
        } catch {
          /* skip */
        }
      }
      if (!rows.length) return console.log("\n  no briefs with factual claims yet\n"), true;
      const risky = rows.filter((r) => r.unbackedNumeric > 0).sort((a, b) => b.unbackedNumeric - a.unbackedNumeric);
      console.log(`\n  ${rows.length} brief(s) with claims · ${risky.length} carrying unbacked numbers\n`);
      for (const r of risky.slice(0, 12)) {
        console.log(`  ${String(r.unbackedNumeric).padStart(2)} unbacked  ${r.topic.slice(0, 56)}`);
        console.log(`     ${r.briefId}`);
      }
      if (!risky.length) console.log("  every numeric claim across your briefs has a receipt");
      console.log("");
      return true;
    }

    /* ------------------------------------------------------- map --- */
    case undefined:
    case "map": {
      const briefId = targs[0] || collection("briefs").all().slice(-1)[0]?.id;
      if (!briefId) return console.log("usage: factory claims map <briefId>"), false;
      const m = claimsMap(briefId);

      console.log(`\n  ${m.topic}`);
      console.log(`  ${m.total} claim(s) · ${m.backed} with a receipt · ${m.unbacked} without (${m.unbackedNumeric} numeric)\n`);
      if (!m.total) {
        console.log("  nothing asserted that needs backing.\n");
        return true;
      }
      for (const r of m.rows) {
        const flag = r.backing ? "ok " : NUMERIC.has(r.kind) ? "!! " : " ? ";
        console.log(`  ${flag} ${pad(r.where, 8)} ${pad(r.kind, 11)} ${JSON.stringify(r.trigger)}`);
        console.log(`      ${r.text.slice(0, 92)}`);
        if (r.backing) console.log(`      receipt: [${r.backing.kind}] ${String(r.backing.label).slice(0, 74)}`);
        else console.log(`      ${r.why} — no receipt`);
      }
      console.log(`\n  ${m.verdict}`);
      console.log(`\n  attach one:  factory claims receipt ${briefId} "<claim>" :: "<photo, link or measurement>"`);
      console.log(`  !! = a number with nothing behind it   ? = unbacked but not numeric\n`);
      return true;
    }

    default:
      console.log(`unknown: claims ${action}\n  map [briefId] · receipt <briefId> "<claim>" :: "<receipt>" · audit`);
      return false;
  }
}
