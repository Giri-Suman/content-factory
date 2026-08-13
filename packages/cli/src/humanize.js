import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "../../shared/src/config.js";
import { collection } from "../../shared/src/store.js";
import * as H from "../../studio/src/humanize.js";

const pad = (s, n) => String(s).padEnd(n);
const flag = (args, name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

function report(r, label) {
  const bar = r.score >= 85 ? "" : r.score >= 70 ? "  ⚠" : "  ✗";
  console.log(`\n  ${label}  ${r.score}/100${bar}  ${r.reading}   (${r.words} words, surface: ${r.surface})`);
  if (!r.hits.length) return;
  console.log("");
  for (const h of r.hits) {
    console.log(`    -${pad(h.cost, 4)} ${pad(h.name, 28)} ${h.count}×  ${h.samples.map((s) => JSON.stringify(s)).join(" ")}`);
    console.log(`          ${h.why}`);
  }
}

export async function humanize(argv) {
  // --help is a usage request, not an unknown subcommand
  const [rawAction, ...rest] = argv;
  const action = rawAction === "--help" || rawAction === "-h" ? undefined : rawAction;
  const targs = rest.filter((a) => !a.startsWith("--"));
  const surface = flag(rest, "surface") || "voiceover";
  const doFix = rest.includes("--fix");
  const useAi = rest.includes("--ai");

  switch (action) {
    /* ------------------------------------------------- patterns ---- */
    case "patterns": {
      const s = flag(rest, "surface");
      console.log(`\n${H.PATTERNS.length} patterns${s ? `, weighted for "${s}"` : ""}\n`);
      if (s && !H.SURFACE_IDS.includes(s)) return console.log(`unknown surface. one of: ${H.SURFACE_IDS.join(", ")}`), false;
      let cat = "";
      const ordered = [...H.PATTERNS].sort((a, b) => a.cat.localeCompare(b.cat) || a.id.localeCompare(b.id));
      for (const p of ordered) {
        if (p.cat !== cat) { console.log(`  ${p.cat.toUpperCase()}`); cat = p.cat; }
        if (s) {
          const w = p.surfaces[s];
          const lbl = w === undefined ? "n/a" : w === 0 ? "native" : w >= 18 ? "fatal" : w >= 12 ? "high" : w >= 7 ? "med" : "low";
          console.log(`    ${pad(p.id, 24)} ${lbl}`);
        } else {
          const per = H.SURFACE_IDS.map((k) => {
            const w = p.surfaces[k];
            return w === undefined ? "-" : w === 0 ? "N" : w >= 18 ? "F" : w >= 12 ? "H" : w >= 7 ? "m" : "l";
          }).join(" ");
          console.log(`    ${pad(p.id, 24)} ${per}`);
        }
      }
      if (!s) {
        console.log(`\n  columns: ${H.SURFACE_IDS.join(" ")}`);
        console.log(`  F=fatal H=high m=med l=low N=native(never flagged here) -=ignored\n`);
        console.log(`  "native" is the important one: emoji in a caption and a single`);
        console.log(`  "Honestly?" in a hook are NOT tells — they're how the format works.\n`);
      } else console.log("");
      return true;
    }

    /* ------------------------------------------------- surfaces ---- */
    case "surfaces": {
      console.log("");
      for (const [k, v] of Object.entries(H.SURFACES)) console.log(`  ${pad(k, 12)} ${v}`);
      console.log("");
      return true;
    }

    /* --------------------------------------------------- script ---- */
    case "script": {
      const id = targs[0];
      if (!id) return console.log("usage: factory humanize script <script-id|brief-id> [--fix] [--ai]"), false;
      const dir = path.join(repoRoot, "data", "scripts");
      const file = existsSync(path.join(dir, `${id}.json`)) ? path.join(dir, `${id}.json`) : path.join(dir, `brief-${id.slice(0, 10)}.json`);
      if (!existsSync(file)) return console.log(`no script for ${id}`), false;

      const script = JSON.parse(readFileSync(file, "utf8"));
      const before = H.scanScript(script);
      console.log(`\n  ${script.title}`);
      console.log(`  overall ${before.score}/100 across ${before.perScene.length} scenes, ${before.totalHits} tells\n`);
      for (const s of before.perScene) {
        const mark = s.score >= 85 ? "ok " : s.score >= 70 ? "⚠  " : "✗  ";
        console.log(`  ${mark}scene ${s.i} ${pad(s.type, 11)} ${String(s.score).padStart(3)}/100  ${s.hits.map((h) => h.name).join(", ") || "clean"}`);
      }

      if (!doFix) {
        if (before.totalHits) console.log(`\n  --fix applies the mechanical fixes · --fix --ai also rewrites the phrasing\n`);
        else console.log("");
        return true;
      }

      let changed = 0;
      for (const scene of script.scenes || []) {
        const src = scene.voiceover || "";
        if (!src) continue;
        if (useAi) {
          const r = await H.rewrite(src, { surface: "voiceover" });
          if (r.text !== src) { scene.voiceover = r.text; changed++; console.log(`\n  scene rewritten (${r.method}) ${r.before.score} -> ${r.after.score}`); console.log(`    - ${src}`); console.log(`    + ${r.text}`); }
        } else {
          const r = H.autoFix(src, { surface: "voiceover" });
          if (r.text !== src) { scene.voiceover = r.text; changed++; console.log(`\n  ${r.applied.join(", ")}`); console.log(`    - ${src}`); console.log(`    + ${r.text}`); }
        }
      }
      if (changed) {
        writeFileSync(file, JSON.stringify(script, null, 2));
        const after = H.scanScript(script);
        console.log(`\n  rewrote ${changed} scene(s): ${before.score} -> ${after.score}/100`);
        console.log(`  saved ${path.relative(repoRoot, file)}\n`);
      } else console.log("\n  nothing to fix mechanically" + (useAi ? "" : " — try --fix --ai for phrasing") + "\n");
      return true;
    }

    /* ----------------------------------------------------- file ---- */
    case "file": {
      const f = targs[0];
      if (!f || !existsSync(f)) return console.log("usage: factory humanize file <path> [--surface=description] [--fix]"), false;
      const src = readFileSync(f, "utf8");
      const r = H.scan(src, { surface });
      report(r, path.basename(f));
      if (doFix) {
        const fixed = useAi ? await H.rewrite(src, { surface }) : { text: H.autoFix(src, { surface }).text };
        if (fixed.text !== src) {
          writeFileSync(f, fixed.text);
          console.log(`\n  rewritten -> ${H.scan(fixed.text, { surface }).score}/100, saved ${path.basename(f)}\n`);
        } else console.log("\n  no mechanical change\n");
      } else console.log("");
      return true;
    }

    /* ----------------------------------------------------- scan ---- */
    case "scan":
    case undefined: {
      const text = targs.join(" ");
      if (!text) {
        console.log(`\nusage:\n  factory humanize scan "text" [--surface=voiceover] [--fix] [--ai]`);
        console.log(`  factory humanize script <id> [--fix] [--ai]`);
        console.log(`  factory humanize file <path> [--surface=description] [--fix]`);
        console.log(`  factory humanize audit          scan everything the system has generated`);
        console.log(`  factory humanize voice          learn your style from your shipped posts`);
        console.log(`  factory humanize patterns [--surface=…]   ·   surfaces\n`);
        console.log(`surfaces: ${H.SURFACE_IDS.join(", ")}\n`);
        return true;
      }
      report(H.scan(text, { surface }), "input");
      if (doFix) {
        const r = useAi ? await H.rewrite(text, { surface }) : { text: H.autoFix(text, { surface }).text, method: "autofix" };
        console.log(`\n  ${r.method || "autofix"}:\n    ${r.text}`);
        console.log(`\n  -> ${H.scan(r.text, { surface }).score}/100\n`);
      } else console.log("");
      return true;
    }

    /* ---------------------------------------------------- audit ---- */
    case "audit": {
      console.log("\nscanning everything the factory has generated…\n");
      const rows = [];

      // A clean score over template scaffolding means nothing. If the briefs
      // are still [fill:] placeholders, the corpus was never LLM-written and
      // this audit has nothing to detect — say so instead of reporting 98/100.
      const briefs = collection("briefs").all();
      const templated = briefs.filter((b) => /\[fill:/.test(JSON.stringify(b.payload || {}))).length;

      for (const b of briefs) {
        const p = b.payload || {};
        const t = p.yt_short?.title;
        const hook = p.yt_short?.hook_variants?.[0];
        if (t) rows.push(["title", b.id, H.scan(t, { surface: "title" })]);
        if (hook) rows.push(["hook", b.id, H.scan(hook, { surface: "voiceover" })]);
        if (p.ig_reel?.caption) rows.push(["caption", b.id, H.scan(p.ig_reel.caption, { surface: "caption" })]);
        // core_idea and the blog outline are generated prose too — the first
        // real brief put "Leveraging AirLLM to…" in core_idea, which no
        // scanned surface was looking at.
        if (p.core_idea) rows.push(["core-idea", b.id, H.scan(p.core_idea, { surface: "description" })]);
        if (p.blog_outline?.quick_answer) rows.push(["blog", b.id, H.scan(p.blog_outline.quick_answer, { surface: "description" })]);
      }
      for (const l of collection("engagementlog").all()) {
        if (l.replyDraft) rows.push(["reply", l.id, H.scan(l.replyDraft, { surface: "reply" })]);
      }

      if (!rows.length) return console.log("  nothing generated yet\n"), true;
      const bad = rows.filter((r) => r[2].score < 85).sort((a, b) => a[2].score - b[2].score);
      const byS = {};
      for (const [s, , r] of rows) (byS[s] ||= []).push(r.score);

      console.log("  by surface:");
      for (const [s, arr] of Object.entries(byS)) {
        const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
        console.log(`    ${pad(s, 10)} ${String(avg).padStart(3)}/100 avg   ${arr.filter((x) => x < 85).length}/${arr.length} flagged`);
      }
      if (bad.length) {
        console.log(`\n  worst ${Math.min(10, bad.length)}:`);
        for (const [s, id, r] of bad.slice(0, 10)) {
          console.log(`    ${String(r.score).padStart(3)} ${pad(s, 9)} ${pad(id.slice(0, 14), 15)} ${r.hits.map((h) => h.id).join(", ")}`);
        }
      }
      console.log(`\n  ${rows.length} pieces scanned · ${bad.length} below 85`);
      if (templated === briefs.length && briefs.length) {
        console.log(`\n  ⚠ all ${briefs.length} briefs are still [fill:] templates — none was written by an`);
        console.log(`    LLM, so this score reflects template scaffolding, not AI output.`);
        console.log(`    It will only mean something once briefs generate for real (needs a`);
        console.log(`    reachable AI tier: \`factory ai\`).`);
      } else if (templated) {
        const real = briefs.length - templated;
        console.log(`\n  note: ${templated}/${briefs.length} briefs are still [fill:] templates and`);
        console.log(`    score artificially clean — only the ${real} real ${real === 1 ? "one is" : "ones are"} meaningful.`);
      }
      console.log("");
      return true;
    }

    /* ---------------------------------------------------- voice ---- */
    case "voice": {
      const p = H.learnFromMyPosts();
      if (!p) {
        const existing = H.voiceProfile("mine");
        if (existing) { console.log(`\n  current profile (${existing.samples} samples): avg ${existing.avgSentenceWords}w, variance ${existing.lengthVariance}, contractions ${existing.contractionRate}%\n`); return true; }
        console.log("\n  not enough published posts yet (need 3+ with real title/description).");
        console.log("  until then rewrites use generic plain-English rules, and say so.\n");
        return true;
      }
      console.log(`\n  learned from ${p.samples} of your posts:`);
      console.log(`    average sentence   ${p.avgSentenceWords} words`);
      console.log(`    length variance    ${p.lengthVariance}  ${p.lengthVariance < 3 ? "(low — uniform sentences are themselves an AI tell)" : ""}`);
      console.log(`    contractions       ${p.contractionRate}% of words`);
      console.log(`    em dashes          ${p.usesEmDash ? "yes, genuinely yours — rewrites will keep them" : "no"}`);
      console.log(`    questions          ${p.questionRate}% of sentences\n`);
      return true;
    }

    default:
      console.log(`unknown: humanize ${action}\n  scan · script · file · audit · voice · patterns · surfaces`);
      return false;
  }
}
