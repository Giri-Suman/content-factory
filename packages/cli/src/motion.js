import { existsSync } from "node:fs";
import path from "node:path";
import * as ML from "../../studio/src/motionLab.js";

const pad = (s, n) => String(s).padEnd(n);
const flag = (args, name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
// explicit-presence check: `Number(x) || d` swallows a deliberate 0 (bitten twice — see lessons.md)
const num = (args, name, d) => {
  const raw = flag(args, name);
  return raw !== undefined && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : d;
};

export async function motion(argv) {
  // --help is a usage request, not an unknown subcommand
  const [rawAction, ...rest] = argv;
  const action = rawAction === "--help" || rawAction === "-h" ? undefined : rawAction;
  const targs = rest.filter((a) => !a.startsWith("--"));

  switch (action) {
    /* -------------------------------------------------- list --------- */
    case undefined:
    case "list": {
      const fam = flag(rest, "family");
      const niche = flag(rest, "niche");
      const perf = ML.effectPerformance();
      const bench = Object.fromEntries(ML.benchResults().map((b) => [b.effectId, b]));
      let items = ML.EFFECTS;
      if (fam) items = items.filter((e) => e.family === fam);
      if (niche) items = items.filter((e) => e.niches.includes(niche) || e.niches.includes("all"));

      console.log(`\nMotion Lab — ${items.length} effects (${ML.EFFECTS.filter((e) => e.impl === "live").length} live, ${ML.EFFECTS.filter((e) => e.impl === "spec").length} spec'd)\n`);
      let last = "";
      for (const e of items) {
        if (e.family !== last) {
          console.log(`  ${e.family.toUpperCase()}`);
          last = e.family;
        }
        const b = bench[e.id];
        const p = perf[e.id];
        const mark = e.impl === "live" ? "●" : "○";
        const score = b ? ` measured ${b.attention}` : "";
        const yours = p ? ` · yours ${p.ratio}× (n=${p.n})` : "";
        console.log(`    ${mark} ${pad(e.id, 20)} ${pad(`${e.cost}×`, 6)}${score}${yours}`);
        console.log(`      ${e.note}`);
      }
      console.log(`\n  ● live (renders now)   ○ spec'd (defined, not yet coded)`);
      console.log(`  cost = render seconds per second of output\n`);
      console.log(`  factory motion suggest --scene=hook --niche=nails`);
      console.log(`  factory motion preview <id>     factory motion bench --all\n`);
      return true;
    }

    /* ----------------------------------------------- suggest --------- */
    case "suggest": {
      const scene = flag(rest, "scene") || "kinetic";
      const niche = flag(rest, "niche") || "coding";
      const picks = ML.suggestEffects({ sceneType: scene, niche, limit: num(rest, "limit", 5) });
      console.log(`\nbest effects for a ${scene} scene in ${niche}:\n`);
      for (const p of picks) {
        console.log(`  ${pad(p.score, 6)} ${pad(p.id, 20)} ${p.family}`);
        console.log(`         ${p.note}`);
        console.log(`         basis: ${p.basis}`);
      }
      const anyReal = picks.some((p) => p.basis.startsWith("your"));
      if (!anyReal) {
        console.log(`\n  ranked by fit heuristic — publish ~20 videos with effects tagged and`);
        console.log(`  this reranks on YOUR retention instead of my guesses.\n`);
      } else console.log("");
      return true;
    }

    /* ----------------------------------------------- preview --------- */
    case "preview": {
      const id = targs[0];
      if (!id) return console.log("usage: factory motion preview <effect-id> [--seconds=4] [--text=…]"), false;
      const r = ML.renderPreview(id, { seconds: num(rest, "seconds", 4), text: flag(rest, "text") || "Motion Lab" });
      console.log(`  rendered ${r.effectId} -> ${path.relative(process.cwd(), r.file)}`);
      return true;
    }

    /* ------------------------------------------------- bench --------- */
    case "bench": {
      const all = rest.includes("--all");
      const ids = all ? ML.EFFECTS.filter((e) => e.impl === "live").map((e) => e.id) : targs;
      if (!ids.length) return console.log("usage: factory motion bench <id…> | --all"), false;
      console.log(`\nrendering + measuring ${ids.length} effect(s) — this is real pixel analysis, not a guess\n`);
      for (const id of ids) {
        try {
          const r = ML.benchEffect(id, { seconds: num(rest, "seconds", 3) });
          console.log(`  ${pad(id, 20)} ${pad(r.role, 9)} score ${pad(r.attention ?? "n/a", 6)} ${r.reading}`);
          if (ML.getEffect(id)?.wraps) {
            console.log(`  ${" ".repeat(20)} ↳ wrapper: this measures its OWN motion only — your footage supplies the rest`);
          }
        } catch (e) {
          // strip ANSI before truncating, or the escape codes eat the message
          const msg = e.message.replace(/\[[0-9;]*m/g, "").split("\n")[0].slice(0, 90);
          console.log(`  ${pad(id, 20)} failed: ${msg}`);
        }
      }
      console.log("");
      return true;
    }

    /* ------------------------------------------------ measure -------- */
    case "measure": {
      const file = targs[0];
      if (!file || !existsSync(file)) return console.log("usage: factory motion measure <video.mp4> [--role=ambient|hook]"), false;
      const r = ML.measureAttention(file, { role: flag(rest, "role") || "hook" });
      console.log(`\n  ${r.file}  (${r.durationSec}s, scored as ${r.role})\n`);
      console.log(`    opening energy (first 2s)  ${r.openingEnergy}`);
      console.log(`    motion energy (whole)      ${r.motionEnergy}`);
      console.log(`    contrast                   ${r.contrast}`);
      console.log(`    loop seam                  ${r.loopSeam ?? "n/a"}  ${r.loopSeam >= 0.9 ? "(clean loop — replays add watch time)" : ""}`);
      console.log(`\n    → ${r.attention}  ${r.reading}`);
      console.log(`\n    ${r.caveat}\n`);
      return true;
    }

    /* --------------------------------------------------- tag --------- */
    case "tag": {
      const [postId, ...fx] = targs;
      if (!postId || !fx.length) return console.log("usage: factory motion tag <mypost-id> <effect-id…>"), false;
      ML.tagPostEffects(postId, fx);
      console.log(`  tagged ${postId} with ${fx.join(", ")} — calibration will join this to retention`);
      return true;
    }

    /* ---------------------------------------------- results ---------- */
    case "results": {
      const perf = ML.effectPerformance();
      const keys = Object.keys(perf);
      if (!keys.length) {
        console.log("\n  no effect→outcome data yet.\n");
        console.log("  needs ≥3 published posts with stats AND effects tagged:");
        console.log("    factory motion tag <mypost-id> word-punch aurora-mesh\n");
        console.log("  until then `suggest` ranks on fit heuristics and says so.\n");
        return true;
      }
      console.log(`\neffect → your median views, vs your overall median:\n`);
      for (const [id, v] of Object.entries(perf).sort((a, b) => b[1].ratio - a[1].ratio)) {
        const bar = "█".repeat(Math.min(24, Math.round(v.ratio * 10)));
        console.log(`  ${pad(id, 20)} ${pad(v.ratio + "×", 7)} n=${pad(v.n, 4)} ${bar}`);
      }
      console.log(`\n  small n — treat as directional until each effect has ~5 posts.\n`);
      return true;
    }

    default:
      console.log(`unknown: motion ${action}\n  list · suggest · preview · bench · measure · tag · results`);
      return false;
  }
}
