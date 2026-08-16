#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { doctor } from "../src/doctor.js";
import { c } from "../src/colors.js";

const [, , cmd, ...rest] = process.argv;

const HELP = `
${c.bold("factory")} — content-factory command line

  ${c.cyan("factory doctor")}                       verify every tool + key the pipeline needs
  ${c.cyan("factory render <script.json>")}         compile a script into MP4 (16:9 + 9:16)
      --wide-only | --vertical-only    render a single aspect ratio
  ${c.cyan("factory radar")}                        scan + score trending topics, alert hot ones
  ${c.cyan("factory script <id | \"topic\">")}        draft a script.json from a trend or topic
      --template                       skeleton to hand-fill (no API key needed)
  ${c.cyan("factory math \"<topic>\"")}               LLM-written manim math short (9:16)
      factory math <demo-name> --demo  render a bundled demo (no key needed)
  ${c.cyan("factory worker")}                       long-running heartbeat: collect/score 30m, youtube 60m,
                                       deep 6h, digest 08:00 IST  (--fast for test cadences)
  ${c.cyan("factory shorts <id>")}                  cut 1-3 standalone clips from a rendered episode
  ${c.cyan("factory edit <footage.mp4>")}           auto-edit filmed footage: silence cuts + punch-ins
      --noise=-35dB --min-silence=0.45 --no-punch --no-captions --no-retakes
  ${c.cyan("factory publish <id>")}                 compliance-check + upload to YouTube (dry-run without --go)
      --public | --unlisted            visibility (default: private) · --at "<iso>" schedules · --go = real upload
  ${c.cyan("factory auth-youtube")}                 one-time OAuth to get your refresh token
  ${c.cyan("factory analytics")}                    pull stats -> category weights that steer the radar
  ${c.cyan("factory help")}                         this message
`;

switch (cmd) {
  case "doctor": {
    const ok = await doctor();
    process.exit(ok ? 0 : 1);
    break;
  }
  case "render": {
    if (rest[0] === "brief") {
      const { renderBrief } = await import("../../pipeline/src/render.js");
      const ok = await renderBrief(rest.slice(1));
      process.exit(ok ? 0 : 1);
    } else {
      const { renderScript } = await import("../../pipeline/src/render.js");
      const ok = await renderScript(rest);
      process.exit(ok ? 0 : 1);
    }
    break;
  }
  case "radar": {
    const { runRadar } = await import("../../radar/src/radar.js");
    const ok = await runRadar(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "script": {
    const { generateScript } = await import("../../studio/src/generate.js");
    const ok = await generateScript(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "math": {
    const { mathShort } = await import("../../pipeline/src/math.js");
    const ok = await mathShort(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "shorts": {
    const { makeClips } = await import("../../pipeline/src/clips.js");
    const ok = await makeClips(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "edit": {
    const { autoEdit } = await import("../../pipeline/src/autoedit.js");
    const ok = await autoEdit(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "yt": {
    const { ytCommand } = await import("../../radar/src/ytCli.js");
    const ok = await ytCommand(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "score": {
    const { runScore } = await import("../../radar/src/clusters.js");
    await runScore();
    process.exit(0);
    break;
  }
  case "health": {
    const { printHealth } = await import("../src/health.js");
    const green = await printHealth();
    process.exit(green ? 0 : 1);
    break;
  }
  case "prune": {
    const { prune } = await import("../src/prune.js");
    await prune(rest);
    process.exit(0);
    break;
  }
  case "steps": {
    const { burnSteps } = await import("../../pipeline/src/stepCards.js");
    const ok = await burnSteps(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "reframe": {
    const { reframe } = await import("../../pipeline/src/reframe.js");
    const ok = await reframe(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "capture": {
    const { capture } = await import("../src/capture.js");
    try {
      const ok = await capture(rest);
      process.exit(ok ? 0 : 1);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "claims": {
    const { claims } = await import("../src/claims.js");
    try {
      const ok = await claims(rest);
      process.exit(ok ? 0 : 1);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "capabilities": {
    const { capabilities } = await import("../src/capabilities.js");
    try {
      const ok = await capabilities(rest);
      process.exit(ok ? 0 : 1);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "evidence": {
    const { evidence } = await import("../src/evidence.js");
    try {
      const ok = await evidence(rest);
      process.exit(ok ? 0 : 1);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "humanize": {
    const { humanize } = await import("../src/humanize.js");
    try {
      const ok = await humanize(rest);
      process.exit(ok ? 0 : 1);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "motion": {
    const { motion } = await import("../src/motion.js");
    try {
      const ok = await motion(rest);
      process.exit(ok ? 0 : 1);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "longform": {
    const { mineLongform } = await import("../../pipeline/src/longform.js");
    const ok = await mineLongform(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "batch": {
    const { batchProduce } = await import("../../pipeline/src/batch.js");
    try {
      await batchProduce(rest);
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "tools": {
    const T = await import("../../studio/src/creatorTools.js");
    const [action, ...targs] = rest.filter((a) => !a.startsWith("--"));
    try {
      if (action === "captions" && targs[0]) {
        const r = T.captionFiles(targs[0]);
        console.log(`captions: ${r.cues} cues -> ${path.basename(r.srtFile)} + ${path.basename(r.vttFile)}`);
        console.log("  upload the .srt with the video — YouTube indexes it for search (burned-in text isn't readable)");
        console.log(`  reading speed: ${r.readingSpeed.medianCps} CPS median — ${r.readingSpeed.reading}`);
        if (r.advertiser.risk !== "none") console.log(`  advertiser risk ${r.advertiser.risk}: ${r.advertiser.reading}`);
      } else if (action === "silent" && targs[0]) {
        const { silentVersion } = await import("../../pipeline/src/render.js");
        const dir = path.join(process.cwd(), "renders", targs[0]);
        const src = ["short.mp4", "wide.mp4"].map((f) => path.join(dir, f)).find((f) => existsSync(f));
        if (!src) throw new Error(`no short.mp4/wide.mp4 in renders/${targs[0]}`);
        const s = silentVersion(src);
        console.log(`silent copy -> ${path.relative(process.cwd(), s.file)}`);
        console.log(`  ${s.note}`);
      } else if (action === "chapters" && targs[0]) {
        const r = T.chapters(targs[0]);
        if (r.note) console.log(r.note);
        else {
          console.log(r.valid ? "chapters (paste into the description):" : `only ${r.chapters.length} chapters — YouTube needs 3+`);
          console.log(r.text);
        }
      } else if (action === "teleprompter" && targs[0]) {
        const r = T.teleprompter(targs[0]);
        console.log(`\n${r.topic}\n${"-".repeat(50)}`);
        for (const b of r.blocks) console.log(`[${b.kind}  ~${b.seconds}s]\n  ${b.text}\n`);
        console.log(`${r.wordCount} words · ~${r.totalSec}s target`);
      } else if (action === "calendar") {
        const r = T.calendar(Number(targs[0]) || 14);
        for (const d of r.days) {
          const bits = [...d.slotted.map((s) => `${s.topic.slice(0, 30)} (${s.state || "planned"})`), ...d.scheduled.map((s) => `${s.platform}`)];
          console.log(`  ${d.date} ${d.weekday}  ${bits.length ? bits.join(" · ") : "—"}`);
        }
        if (r.cadenceWarning) console.log(`\n  ⚠ ${r.cadenceWarning}`);
      } else if (action === "translate" && targs[0]) {
        const K = await import("../../studio/src/creatorKit.js");
        const langs = targs.slice(1).length ? targs.slice(1) : ["es", "hi"];
        const r = await K.translateCaptions(targs[0], langs);
        console.log(`translated ${r.cues} cues into ${r.made.length} language(s):`);
        for (const m of r.made) console.log(`  ${m.name.padEnd(12)} -> captions.${m.code}.srt`);
      } else if (action === "pacing") {
        const K = await import("../../studio/src/creatorKit.js");
        const { collection: coll } = await import("../../shared/src/store.js");
        // treat arg 1 as a brief id only if such a brief really exists,
        // otherwise it's free text to measure
        if (targs.length === 1 && coll("briefs").get(targs[0])) {
          const r = K.pacingForBrief(targs[0]);
          console.log(`\npacing for brief (target ${r.target}s):`);
          console.log(`  WHOLE: ${r.whole.words} words -> ~${r.whole.estSec}s  [${r.whole.verdict}]`);
          console.log(`         ${r.whole.advice}\n`);
          for (const p of r.perPart) console.log(`  ${p.name.padEnd(8)} ${String(p.words).padStart(3)}w ~${String(p.estSec).padStart(5)}s  ${p.verdict}`);
        } else {
          const r = K.pacingCheck(targs.join(" "));
          console.log(`${r.words} words -> ~${r.estSec}s (target ${r.targetSec}s) — ${r.verdict}\n  ${r.advice}`);
        }
      } else if (action === "link") {
        const K = await import("../../studio/src/creatorKit.js");
        if (targs[0] === "add" && targs[1] && targs[2]) {
          const l = K.addLink({ label: targs[1], url: targs[2], kind: targs[3] || "product" });
          console.log(`added ${l.kind}: ${l.label} -> ${l.url}`);
        } else {
          const r = K.linkKit({ videoId: targs[0] || "video" });
          console.log(`\nlink block (${r.count} link(s), UTM-tagged so you can attribute clicks):\n`);
          console.log(r.block);
        }
      } else if (action === "stock") {
        const K = await import("../../studio/src/creatorKit.js");
        // flags live on `rest` — `targs` already had them stripped
        const kind = rest.includes("--music") ? "music" : rest.includes("--photo") ? "photo" : "video";
        const q = targs.join(" ");
        if (!q) {
          console.error('usage: factory tools stock "<query>" [--music|--photo]');
          process.exit(1);
        }
        const r = await K.stockSearch(q, { kind });
        if (r.keyless) {
          console.log(`\n${r.note}\n`);
          for (const l of r.links) console.log(`  ${l.source.padEnd(20)} ${l.url}`);
        } else {
          console.log(`\n${r.results.length} free-licence ${kind}(s) for "${q}":\n`);
          for (const it of r.results) console.log(`  ${String(it.duration || "").padStart(3)}s by ${(it.by || "?").padEnd(18)} ${it.preview?.slice(0, 60)}`);
        }
      } else if (action === "niche") {
        const N = await import("../../studio/src/nichePacks.js");
        if (targs[0] === "set") {
          const set = N.setActiveNiches(targs.slice(1));
          console.log(`active niches: ${set.join(", ")}`);
        } else if (targs[0] && N.getPack(targs[0])) {
          const s = N.shotListFor(targs[0]);
          console.log(`\n${s.label} — ${s.lane} lane · ~${s.totalSec}s of shots\n`);
          for (const sh of s.shots) console.log(`  ${sh.n}. [${String(sh.sec).padStart(2)}s] ${sh.name}\n         ${sh.note}`);
          console.log(`\n  hooks that work here: ${s.hooks.join(", ")}`);
          console.log(`  pacing:  ${s.pacing}`);
          console.log(`  gotcha:  ${s.gotcha}`);
          console.log(`  tags:    ${s.hashtags.join(" ")}`);
        } else {
          console.log(`\nniche packs (factory tools niche <name> | niche set <a> <b>):\n`);
          for (const n of N.NICHE_NAMES) {
            const p = N.getPack(n);
            console.log(`  ${n.padEnd(14)} ${p.lane.padEnd(9)} ${p.shots.length} shots · ${p.label}`);
          }
          console.log(`\n  active: ${N.activeNiches().join(", ")}`);
        }
      } else if (action === "cta") {
        const E = await import("../../studio/src/engagement.js");
        if (targs[0] === "add") {
          const added = E.addCta({ platform: targs[1], text: targs.slice(2).join(" ") });
          console.log(`added CTA for ${added.platform}: ${added.text}`);
        } else if (targs[0] === "next") {
          const p = E.nextCta(targs[1] || "yt_short");
          console.log(p ? `[${p.kind}] ${p.text}\n  (${p.note})` : "no CTAs for that platform");
        } else {
          const r = E.ctaLibrary({ platform: targs[0] });
          console.log(`\nCTA library (${r.ctas.length}):\n`);
          for (const c of r.ctas) console.log(`  [${c.platform.padEnd(11)} ${c.kind.padEnd(9)} used ${c.uses}x] ${c.text}\n      ${c.note || ""}`);
          console.log("\nend-screen plans:");
          for (const [plat, tips] of Object.entries(r.endScreens)) {
            console.log(`  ${plat}:`);
            for (const t of tips) console.log(`     · ${t}`);
          }
        }
      } else if (action === "replies") {
        const E = await import("../../studio/src/engagement.js");
        const r = await E.draftReplies({ limit: Number(targs[0]) || 10 });
        if (r.note) console.log(r.note);
        else {
          console.log(`drafted ${r.drafted} reply/replies (${r.mode} mode) — review before pasting:\n`);
          const { collection } = await import("../../shared/src/store.js");
          for (const l of collection("commentleads").find((x) => x.replyDraft).slice(0, r.drafted)) {
            console.log(`  Q: ${l.comment.slice(0, 70)}\n  A: ${l.replyDraft}\n`);
          }
        }
      } else if (action === "abtitle") {
        const E = await import("../../studio/src/engagement.js");
        if (targs[0] === "run") {
          const r = E.runTitleTests();
          console.log(`title tests: ${r.swapped} swapped now, ${r.pending} still pending`);
        } else if (targs[0]) {
          const t = await E.scheduleTitleAB(targs[0], { variantB: targs.slice(1).join(" ") || undefined });
          console.log(`A/B scheduled:\n  A: ${t.variantA}\n  B: ${t.variantB}\n  swap at ${t.swapAt}\n  metric: ${t.metric}`);
        } else {
          console.error("usage: factory tools abtitle <myPostId> [variant B text] | abtitle run");
          process.exit(1);
        }
      } else if (action === "gaps") {
        const G = await import("../../studio/src/growthTools.js");
        const r = G.catalogGaps();
        console.log(`\nback-catalog gaps — ${r.publishedCount} published · ${r.candidatesConsidered} signals · ${r.coveredCount} covered · ${r.gapCount} uncovered:\n`);
        for (const g of r.gaps) console.log(`  ${String(Math.round(g.demand)).padStart(4)}  [${g.source.padEnd(8)}] ${g.title.slice(0, 58)}`);
      } else if (action === "repurpose") {
        const G = await import("../../studio/src/growthTools.js");
        const r = G.repurposeScan();
        if (r.note) console.log(`${r.note} (have ${r.posts})`);
        else {
          console.log(`\nrepurpose scan — ${r.posts} posts, median ${r.medianViews.toLocaleString()} views:\n`);
          for (const s of r.suggestions) console.log(`  [${s.kind.padEnd(6)}] ${s.title.slice(0, 44)}\n            ${s.why}`);
        }
      } else if (action === "competitors") {
        const G = await import("../../studio/src/growthTools.js");
        const r = G.competitorDiff({ days: Number(targs[0]) || 7 });
        if (r.note) console.log(r.note);
        else {
          console.log(`\ncompetitor diff — ${r.watching} channels, last ${r.windowDays}d:\n`);
          for (const o of r.newOutliers) console.log(`  ${o.ratio}x  [${o.channel.slice(0, 16)}] ${o.title.slice(0, 46)}${o.isShort ? " (short)" : ""}`);
          console.log(`\n  shorts share: ${r.formatShift.recentShortsPct}% now vs ${r.formatShift.priorShortsPct}% prior window`);
          for (const c of r.cadence) console.log(`  ${c.delta > 0 ? "+" : ""}${c.delta} uploads  ${c.channel}`);
        }
      } else if (action === "description" && targs[0]) {
        const r = await T.descriptionKit(targs[0], targs[1]);
        console.log(`\n${r.description}\n`);
        console.log(`${r.chars} chars ${r.withinLimit ? "(ok)" : "(OVER 5000 limit)"}`);
      } else {
        console.error("usage: factory tools captions <renderId> | chapters <renderId> | teleprompter <briefId> | calendar [days] | description <briefId> [renderId]");
        process.exit(1);
      }
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "ai": {
    const { tierAvailability, TASKS, DEFAULT_TIERS, TIER_NAMES, resolveChain } = await import("../../llm/src/tiers.js");
    const { loadUserConfig, saveUserConfig, loadEnv } = await import("../../shared/src/config.js");
    loadEnv();
    const [action, ...aargs] = rest.filter((a) => !a.startsWith("--"));
    const cfg = loadUserConfig();
    const tiers = { ...DEFAULT_TIERS, ...(cfg.aiTiers || {}) };
    try {
      const { SERVICES, serviceAvailability, resolveService, DEFAULT_SERVICE_TIERS } = await import("../../llm/src/tiers.js");
      const svcTiers = { ...DEFAULT_SERVICE_TIERS, ...(cfg.serviceTiers || {}) };
      if (action === "set" && aargs[0] && aargs[1]) {
        const isTask = Boolean(TASKS[aargs[0]]);
        const isSvc = Boolean(SERVICES[aargs[0]]);
        // accept the legacy budget/premium names so old notes still work, but
        // persist the canonical one and say so rather than storing a stale name
        const { canonicalTier } = await import("../../llm/src/tiers.js");
        const tier = canonicalTier(aargs[1]);
        if ((!isTask && !isSvc) || !tier) {
          throw new Error(`usage: factory ai set <${[...Object.keys(TASKS), ...Object.keys(SERVICES)].join("|")}> <${TIER_NAMES.join("|")}>`);
        }
        if (isTask) cfg.aiTiers = { ...tiers, [aargs[0]]: tier };
        else cfg.serviceTiers = { ...svcTiers, [aargs[0]]: tier };
        saveUserConfig(cfg);
        console.log(`${aargs[0]} -> ${tier} tier${tier !== aargs[1] ? `  (“${aargs[1]}” is the old name for “${tier}”)` : ""}`);
      } else if (action === "models") {
        // OpenRouter's free roster rotates; a stale default 404s with
        // "unavailable for free", which reads like a broken key. Check it here.
        if (!process.env.OPENROUTER_API_KEY) throw new Error("needs OPENROUTER_API_KEY in .env");
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
        });
        if (!res.ok) throw new Error(`openrouter ${res.status}`);
        const free = ((await res.json()).data || []).filter((m) => m.id.endsWith(":free"));
        const current = process.env.OPENROUTER_FREE_MODEL || "google/gemma-4-31b-it:free";
        console.log(`\n${free.length} free models on OpenRouter right now:\n`);
        for (const m of free.sort((a, b) => (b.context_length || 0) - (a.context_length || 0))) {
          console.log(`  ${m.id === current ? "->" : "  "} ${m.id.padEnd(52)} ctx ${m.context_length || "?"}`);
        }
        console.log(`\n  in use: ${current}${free.some((m) => m.id === current) ? "" : "   ** NOT in the free list — this will 404 **"}`);
        console.log(`  change it with OPENROUTER_FREE_MODEL=<id> in .env`);
        console.log(`  pick one that returns clean JSON — some leak reasoning or fence it\n`);
      } else {
        const { TIER_META } = await import("../../llm/src/tiers.js");
        console.log("\nAI TIERS — what's ready right now:\n");
        for (const t of tierAvailability()) {
          const meta = TIER_META[t.tier] || {};
          console.log(`  ${t.tier.padEnd(8)} ${(t.available ? "READY" : "not set up").padEnd(11)} ${(meta.cost || "").padEnd(16)} ${meta.note || ""}`);
          for (const o of t.options) console.log(`     ${o.ready ? "+" : "o"} ${o.label.padEnd(22)} ${o.model}`);
        }

        /**
         * "READY" above only means a key EXISTS. That is how an account with
         * zero credits reported all three tiers ready while every paid call
         * answered "Insufficient credits" and free models throttled after a
         * couple of requests. Ask OpenRouter what the key can actually do.
         */
        if (process.env.OPENROUTER_API_KEY) {
          try {
            const cr = await fetch("https://openrouter.ai/api/v1/credits", {
              headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
              signal: AbortSignal.timeout(8000),
            });
            if (cr.ok) {
              const { data } = await cr.json();
              const left = (data.total_credits || 0) - (data.total_usage || 0);
              console.log(`\n  OpenRouter balance: $${left.toFixed(4)}  (granted $${(data.total_credits || 0).toFixed(2)}, used $${(data.total_usage || 0).toFixed(4)})`);
              if (left <= 0) {
                console.log(`  ⚠ no credits — the CHEAP, MEDIUM and BEST rows above cannot actually run,`);
                console.log(`    however "READY" they look. Only the free tier will work.`);
                console.log(`    Add credit at openrouter.ai/settings/credits to unlock them, or stay`);
                console.log(`    on free — it is genuinely sufficient for one video at a time.`);
              }
            }
          } catch {
            /* a status probe must never break the status command */
          }
        }
        console.log("\nPER-TASK ASSIGNMENT (factory ai set <task> <tier>):\n");
        for (const [task, meta] of Object.entries(TASKS)) {
          const { chain } = resolveChain(task, tiers);
          console.log(`  ${task.padEnd(9)} ${tiers[task].padEnd(8)} ${chain.length ? `-> ${chain[0].label}` : "-> (nothing configured; heuristic fallback)"}`);
          console.log(`     ${meta.note}`);
        }
        console.log("\nOTHER PAID SURFACES (factory ai set <service> <tier>):\n");
        for (const s of serviceAvailability()) {
          const active = resolveService(s.service, svcTiers);
          console.log(`  ${s.service.padEnd(11)} ${svcTiers[s.service].padEnd(8)} -> ${active ? active.label : "(none available)"}`);
          console.log(`     ${s.note}`);
          for (const t of s.tiers) {
            const opts = t.options.map((o) => `${o.ready ? "+" : "o"} ${o.label}`).join(", ");
            console.log(`     ${t.tier.padEnd(8)} ${opts || "(none)"}`);
          }
        }
        if (!tierAvailability().some((t) => t.available)) {
          console.log("\n  No LLM configured yet. The FREE tier costs nothing:");
          console.log("    1. install ollama (ollama.com)  2. ollama pull llama3.2");
          console.log("    3. put OLLAMA_MODEL=llama3.2 in .env   -> every AI feature turns on at $0");
        }
      }
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "catalog": {
    const { collection } = await import("../../shared/src/store.js");
    const [action, ...cargs] = rest.filter((a) => !a.startsWith("--"));
    try {
      if (action === "seed-formats" || action === "formats") {
        const { ensureFormats } = await import("../../studio/src/formats.js");
        const fmts = ensureFormats();
        if (action === "formats") for (const f of fmts) console.log(`  #${String(f.num).padStart(2)} [${f.lane.padEnd(9)}] ${f.autoPct}%  ${f.name}`);
        else console.log(`format registry: ${fmts.length} formats seeded`);
      } else if (action === "seed-ideas") {
        const { seedIdeas } = await import("../../studio/src/seedIdeas.js");
        const r = seedIdeas();
        console.log(`seed ideas: +${r.added} added, ${r.skipped} already present (${r.total} in bank)`);
      } else if (action === "fanout" && cargs[0]) {
        const { fanOut } = await import("../../studio/src/fanout.js");
        const r = await fanOut(cargs[0]);
        console.log(`fan-out: ${r.totalAssets} total assets (derivatives: ${r.derivatives.join(", ")})`);
      } else if (action === "carousel" && cargs[0]) {
        const { renderCarousel } = await import("../../pipeline/src/carousel.js");
        const r = renderCarousel(cargs[0]);
        console.log(`carousel: ${r.files.length} slides -> ${r.outDir}`);
      } else if (action === "blog" && cargs[0]) {
        const { composeBlog } = await import("../../studio/src/composers.js");
        const r = await composeBlog(cargs[0]);
        console.log(`blog draft: ${r.title} -> ${r.file}`);
      } else if (action === "newsletter") {
        const { composeNewsletter } = await import("../../studio/src/composers.js");
        const r = composeNewsletter();
        console.log(`newsletter draft -> ${r.file}`);
      } else if (action === "comments") {
        const { mineComments } = await import("../../studio/src/composers.js");
        const r = await mineComments();
        console.log(`comment miner: ${r.mined} reply-worthy${r.note ? ` (${r.note})` : ""}`);
      } else {
        console.error("usage: factory catalog formats|seed-formats|seed-ideas|fanout <id>|carousel <id>|blog <id>|newsletter|comments");
        process.exit(1);
      }
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "dryrun": {
    const { dryRun } = await import("../../pipeline/src/dryrun.js");
    try {
      await dryRun(rest);
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "playbook": {
    const PB = await import("../../studio/src/playbooks.js");
    const { collection } = await import("../../shared/src/store.js");
    const [action, ...pargs] = rest.filter((a) => !a.startsWith("--"));
    try {
      if (action === "list" || !action) {
        for (const p of PB.ensurePlaybooks()) {
          console.log(`\n${p.platform}: length ${p.lengthBandSec[0]}-${p.lengthBandSec[1]}s · hooks ${p.hooks.join("/")} · slots ${p.slots.join(", ")}`);
        }
      } else if (action === "refresh") {
        const { withJobRun } = await import("../../shared/src/jobs.js");
        const r = await withJobRun("playbook-refresh", () => PB.refreshPlaybooks());
        console.log(`playbook refresh: ${r.proposals} proposal(s), ${r.unverifiedSignals} unverified signal(s) quarantined`);
        for (const p of collection("playbookproposals").find((x) => x.status === "pending")) {
          console.log(`  [${p.platform}] ${p.field}: ${JSON.stringify(p.current)} -> ${JSON.stringify(p.proposed)}  (${p.evidence.join("; ")})  id=${p.id}`);
        }
      } else if (action === "approve" && pargs[0]) {
        const r = PB.applyProposal(pargs[0]);
        console.log(r ? `approved: ${r.platform} ${r.field} -> ${JSON.stringify(r.proposed)}` : "no such pending proposal");
      } else if (action === "reject" && pargs[0]) {
        PB.rejectProposal(pargs[0]);
        console.log("rejected");
      } else if (action === "seed-signal") {
        const { seedPlaybookSignal } = await import("../../studio/src/seedPlaybookSignal.js");
        const r = seedPlaybookSignal();
        console.log(`seeded ${r.seeded} MyPosts (35s outperform signal)`);
      } else {
        console.error("usage: factory playbook list | refresh | approve <id> | reject <id> | seed-signal");
        process.exit(1);
      }
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "thumbnails": {
    const { generateThumbnails } = await import("../../pipeline/src/thumbnails.js");
    const { thumbnailJudge } = await import("../../judges/src/judges.js");
    const id = rest.filter((a) => !a.startsWith("--"))[0];
    if (!id) {
      console.error("usage: factory thumbnails <briefId>");
      process.exit(1);
    }
    try {
      const { collection } = await import("../../shared/src/store.js");
      const { variants } = await generateThumbnails(id);
      const judged = variants.map((v) => ({ ...v, critique: thumbnailJudge(v) })).sort((a, b) => b.critique.score - a.critique.score);
      for (const v of judged) {
        console.log(`  ${v.layout.padEnd(14)} ${v.critique.score}/100 ${v.critique.verdict}${v.critique.reasons.length ? " — " + v.critique.reasons.join("; ") : ""}`);
      }
      collection("thumbnails").update(id, { judged: judged.map((j) => ({ layout: j.layout, score: j.critique.score, verdict: j.critique.verdict })) });
      console.log(`RESULT ${JSON.stringify({ id, variants: variants.length })}`);
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "produce": {
    const orch = await import("../../pipeline/src/orchestrator.js");
    const noflag = rest.filter((a) => !a.startsWith("--"));
    const capIdx = rest.indexOf("--capture-file");
    const captureFile = capIdx !== -1 ? rest[capIdx + 1] : null;
    try {
      if (noflag[0] === "board") {
        const { columns, alerts } = orch.board();
        for (const [state, items] of Object.entries(columns)) {
          if (items.length) console.log(`\n${state} (${items.length}):`);
          for (const it of items) console.log(`  [${it.lane}] ${it.topic.slice(0, 46)}${it.stuck ? `  ⚠ ${it.stuck}` : ""}`);
        }
        if (alerts.length) console.log(`\n⚠ ${alerts.length} stuck item(s)`);
      } else if (noflag[0]) {
        const r = await orch.produce(noflag[0], { captureFile });
        console.log(`\n-> ${r.state}${r.escalated ? " (escalated)" : ""}`);
      } else {
        console.error("usage: factory produce <briefId> [--capture-file <path>] | board");
        process.exit(1);
      }
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "lessons": {
    const L = await import("../../studio/src/lessons.js");
    const { collection } = await import("../../shared/src/store.js");
    const [action, ...largs] = rest.filter((a) => !a.startsWith("--"));
    try {
      if (action === "seed") {
        const { seedCritiques } = await import("../../studio/src/seedCritiques.js");
        const r = seedCritiques();
        console.log(`seeded ${r.seeded} critiques (${r.total} total)`);
      } else if (action === "distill") {
        const { withJobRun } = await import("../../shared/src/jobs.js");
        const r = await withJobRun("distill", () => L.distillLessons());
        console.log(`distilled: +${r.added} new, ${r.merged} merged from ${r.candidates} candidates (${r.total} lessons)`);
      } else if (action === "preview" && largs[0]) {
        const { block, lessons } = L.lessonsFor(largs[0]);
        console.log(`\ntop ${lessons.length} lessons injected into "${largs[0]}" generation:`);
        console.log(block || "  (none yet)");
      } else if (action === "pin" && largs[0]) {
        L.pinLesson(largs[0], true);
        console.log("pinned");
      } else if (action === "kill" && largs[0]) {
        L.killLesson(largs[0]);
        console.log("killed");
      } else if (action === "list" || !action) {
        const rows = collection("lessons").all().filter((l) => l.active).map((l) => ({ ...l, w: L.lessonWeight(l) })).sort((a, b) => b.w - a.w);
        for (const l of rows) console.log(`  [${l.scope.padEnd(8)}] w${String(l.w).padStart(5)} n${l.evidenceCount} ${l.pinned ? "📌 " : ""}${l.text.slice(0, 70)}`);
      } else {
        console.error("usage: factory lessons seed | distill | list | preview <scope> | pin <id> | kill <id>");
        process.exit(1);
      }
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "prompts": {
    const P = await import("../../studio/src/prompts.js");
    const [action, ...pargs] = rest.filter((a) => !a.startsWith("--"));
    try {
      P.ensureBaseVersions();
      if (action === "list" || !action) {
        for (const task of P.TASKS) {
          const vs = P.versionsFor(task);
          console.log(`  ${task.padEnd(9)} ${vs.map((v) => `v${v.version}${v.active ? "*" : v.proposed ? "?" : ""}`).join(" ")}`);
        }
        console.log("  (* active, ? proposed-awaiting-approval)");
      } else if (action === "propose" && pargs[0]) {
        const v = P.proposeVersion(pargs[0], pargs.slice(1).join(" ") || "(proposed template)");
        console.log(`proposed ${pargs[0]} v${v.version} — approve with: factory prompts approve ${v.id}`);
      } else if (action === "approve" && pargs[0]) {
        const v = P.approveVersion(pargs[0]);
        console.log(v ? `approved ${v.task} v${v.version} (now active)` : "no such version");
      } else {
        console.error("usage: factory prompts list | propose <task> <template> | approve <versionId>");
        process.exit(1);
      }
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "qc": {
    const { qcBrief } = await import("../../judges/src/qc.js");
    const { qcStats } = await import("../../judges/src/runner.js");
    const [action, ...qargs] = rest.filter((a) => !a.startsWith("--"));
    try {
      if (action === "brief" && qargs[0]) {
        const r = await qcBrief(qargs[0], { rendered: !rest.includes("--no-render") });
        console.log(`\nQC for brief ${qargs[0]} (cost $${r.costSpent.toFixed(2)}):`);
        for (const [judge, res] of Object.entries(r.results)) {
          const c = res.critique;
          console.log(`  ${judge.padEnd(9)} ${res.status.padEnd(10)} ${c.score}/100 (${c.mode}, ${res.attempts} attempt${res.attempts > 1 ? "s" : ""})`);
          for (const reason of c.reasons.slice(0, 3)) console.log(`      - ${reason}`);
        }
        if (r.escalated.length) console.log(`  ⚠ escalated: ${r.escalated.join(", ")} — Human Review queue`);
      } else if (action === "stats" || !action) {
        const s = qcStats();
        console.log("\npass rates:");
        for (const j of s.perJudge) console.log(`  ${j.judge.padEnd(9)} ${j.passRate ?? "—"}% (${j.passes}/${j.total})`);
        console.log(`  escalations pending: ${s.escalations.length}`);
      } else {
        console.error("usage: factory qc brief <id> [--no-render] | stats");
        process.exit(1);
      }
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "calibrate": {
    const cal = await import("../../publish/src/calibration.js");
    const { withJobRun } = await import("../../shared/src/jobs.js");
    const [action, ...cargs] = rest.filter((a) => !a.startsWith("--"));
    try {
      if (action === "seed") {
        const { seedMyPosts } = await import("../../publish/src/seedMyPosts.js");
        const r = seedMyPosts(Number(cargs[0]) || 25);
        console.log(`seeded ${r.seeded} synthetic MyPosts (${r.total} total)`);
      } else if (action === "ingest") {
        const r = await withJobRun("my-channel", () => cal.ingestMyChannel());
        console.log(`my-channel ingest: ${r.polled} polled${r.note ? ` (${r.note})` : ""}`);
      } else if (action === "memo") {
        const m = await withJobRun("memo", () => cal.weeklyMemo());
        if (m.skipped) console.log(`skipped: ${m.skipped}`);
        else {
          console.log(`\nweekly memo (n=${m.n}, overall median ${m.joins.overallMedian} views):`);
          console.log(`  outperformed: ${m.outperformed.join(" · ")}`);
          console.log(`  underperformed: ${m.underperformed.join(" · ")}`);
          console.log(`  recommendations: ${m.recommendations.join(" · ")}`);
        }
      } else if (action === "tune") {
        const r = await withJobRun("auto-tune", () => cal.autoTune());
        if (r.skipped) console.log(`skipped: ${r.skipped}`);
        else {
          console.log(`auto-tune: ${r.tuned} change(s) (N=${r.n})`);
          for (const c of r.changes) console.log(`  · [${c.kind}] ${c.detail}`);
        }
      } else if (action === "scorecard") {
        const s = cal.predictionScorecard();
        console.log(`\nprediction scorecard (n=${s.n}):`);
        for (const t of s.byTier) console.log(`  tier ${t.tier}: ${t.n} posts, median ${t.median ?? "—"} views`);
        console.log(`  ${s.tierHonest}`);
      } else if (action === "joins") {
        const j = cal.performanceJoins();
        for (const dim of ["byHook", "byPillar", "byLength", "bySlot"]) {
          console.log(`\n${dim} (overall median ${j.overallMedian}):`);
          for (const g of j[dim]) console.log(`  ${String(g.vsOverall).padStart(5)}×  ${g.key.padEnd(16)} median ${g.median} (n=${g.n})`);
        }
      } else if (action === "state") {
        console.log(`RESULT ${JSON.stringify({ joins: cal.performanceJoins(), scorecard: cal.predictionScorecard() })}`);
      } else if (action === "revert" && cargs[0]) {
        const r = cal.revertTuning(cargs[0]);
        console.log(r ? `reverted [${r.kind}] ${r.detail}` : "nothing to revert");
      } else {
        console.error("usage: factory calibrate seed [n] | ingest | joins | memo | tune | scorecard");
        process.exit(1);
      }
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "ideabank": {
    const bank = await import("../../studio/src/ideaBank.js");
    const { collection } = await import("../../shared/src/store.js");
    const [action, ...bargs] = rest.filter((a) => !a.startsWith("--"));
    try {
      if (action === "sync") {
        const r = await bank.syncApproved();
        console.log(`idea bank: ${r.entered} entered (${r.approved} approved briefs total)`);
      } else if (action === "enter" && bargs[0]) {
        const r = await bank.enterIdeaBank(bargs[0]);
        console.log(`${r.existed ? "already in bank" : "entered"}: [${r.idea.pillar}/${r.idea.effort}] ${r.idea.title.slice(0, 60)}`);
      } else if (action === "rank" || action === "list") {
        const ranked = bank.rankIdeas();
        if (rest.includes("--json")) {
          console.log(`RESULT ${JSON.stringify(ranked)}`);
        } else {
          for (const i of ranked.slice(0, 15)) {
            console.log(
              `  ${String(i.rank).padStart(6)}  [${i.pillar.padEnd(12)} ${i.effort}] ${i.title.slice(0, 46)}  (base ${i.score} × p${i.factors.pillarBalance} × e${i.factors.effortFit} × f${i.factors.freshness})`
            );
          }
        }
      } else if (action === "series" && bargs[0] === "create" && bargs[1]) {
        const s = bank.createSeries(bargs.slice(1).join(" "));
        console.log(`series: ${s.name} (${s.id})`);
      } else if (action === "series" && bargs[0] === "add" && bargs[1] && bargs[2]) {
        const i = bank.assignToSeries(bargs[2], bargs[1]);
        console.log(`assigned as episode ${i.episodeNum}`);
      } else if (action === "brief" && bargs[0]) {
        const idea = collection("ideabank").get(bargs[0]);
        if (!idea) throw new Error(`no idea ${bargs[0]}`);
        const { generateBrief } = await import("../../studio/src/briefs.js");
        let series = null;
        if (idea.seriesId) {
          const s = collection("series").get(idea.seriesId);
          if (s) series = { ...s, episodeNum: idea.episodeNum };
        }
        const b = await generateBrief({ topic: idea.title, series });
        collection("ideabank").update(idea.id, { status: "scheduled" });
        console.log(`[${b.kind}] ${b.topic}${b.duplicateWarning ? `\n  ⚠ near-duplicate of: ${b.duplicateWarning.title} (${b.duplicateWarning.sim})` : ""}`);
      } else {
        console.error("usage: factory ideabank sync | enter <briefId> | rank | series create <name> | series add <seriesId> <ideaId> | brief <ideaId>");
        process.exit(1);
      }
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "keywords": {
    const { keywordGapPass, topOpportunities } = await import("../../radar/src/keywords.js");
    const { withJobRun } = await import("../../shared/src/jobs.js");
    const [action] = rest.filter((a) => !a.startsWith("--"));
    try {
      if (action === "list") {
        for (const k of topOpportunities()) {
          console.log(`  ${String(k.opportunity).padStart(5)}  d${k.demand.score}/s${k.supply.score}  ${k.keyword}`);
        }
      } else {
        const r = await withJobRun("yt-kwgap", () => keywordGapPass());
        console.log(`\ntop opportunities:`);
        for (const k of topOpportunities(12)) {
          console.log(`  ${String(k.opportunity).padStart(5)}  demand ${k.demand.score} / supply ${k.supply.score}  ${k.keyword}`);
          console.log(`         ${k.demand.detail}`);
        }
      }
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "lab": {
    const lab = await import("../../studio/src/titleLab.js");
    const [action, ...largs] = rest.filter((a) => !a.startsWith("--"));
    try {
      if (action === "extract") {
        const r = await lab.extractPatterns();
        console.log(r.skipped ? `skipped: ${r.skipped}` : `patterns: +${r.added} new, ${r.merged} merged (from ${r.samples} outlier titles)`);
      } else if (action === "score" && largs[0]) {
        const r = await lab.scoreTitle(largs.join(" "));
        console.log(`\n"${r.title}"`);
        console.log(`  overall ${r.overall}/10 (${r.mode})${r.banned ? "  ⚠ BANNED GENERIC OPENER" : ""}`);
        for (const [k, v] of Object.entries(r.subScores)) console.log(`  ${k.padEnd(13)} ${v}/10${r.rewrites[k] ? `  → ${r.rewrites[k]}` : ""}`);
        for (const m of r.matches) console.log(`  ~ ${m.template} (${m.avgOutlierRatio}x, n=${m.sampleSize})`);
        console.log(`RESULT ${JSON.stringify(r)}`);
      } else if (action === "hook" && largs[0]) {
        const r = await lab.scoreHook(largs.join(" "));
        console.log(`\n"${r.hook}"\n  ${r.pattern} · ${r.score}/10 (${r.mode})${r.banned ? " ⚠ BANNED" : ""}${r.rewrite ? `\n  → ${r.rewrite}` : ""}`);
        console.log(`RESULT ${JSON.stringify(r)}`);
      } else {
        console.error('usage: factory lab extract | score "<title>" | hook "<hook>"');
        process.exit(1);
      }
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "center": {
    const center = await import("../../publish/src/center.js");
    const [action, ...cargs] = rest.filter((a) => !a.startsWith("--"));
    try {
      if (action === "send" && cargs[0]) {
        const r = center.sendToCenter(cargs[0]);
        console.log(`publish center: ${r.created} item(s) created${r.skipped ? `, ${r.skipped} already existed` : ""}`);
      } else if (action === "attach" && cargs[0] && cargs[1]) {
        const item = center.attachFile(cargs[0], cargs[1], rest.includes("--thumb") ? "thumb" : "video");
        console.log(`attached ${rest.includes("--thumb") ? "thumbnail" : "video"} to ${item.platform} item ${item.id}`);
      } else if (action === "publish" && cargs[0]) {
        const { item, note } = await center.publishItem(cargs[0]);
        console.log(`[${item.status}] ${item.platform} — ${note}`);
        if (item.studioUrl) console.log(`  studio: ${item.studioUrl}`);
      } else if (action === "live" && cargs[0]) {
        const item = center.markPublished(cargs[0], cargs[1] || null);
        console.log(`[published] ${item.platform} ${item.externalUrl || ""} — MyPost recorded`);
      } else if (action === "golden" && cargs[0]) {
        center.setGolden60(cargs[0], true);
        console.log("golden 60 done ✓");
      } else if (action === "list" || !action) {
        for (const i of center.centerQueue()) {
          console.log(`  [${i.status.padEnd(9)}] ${i.platform.padEnd(9)} ${i.scheduledText.padEnd(28)} ${i.topic.slice(0, 40)}${i.golden60Done ? " ·g60✓" : ""}`);
        }
      } else {
        console.error("usage: factory center send <briefId> | attach <itemId> <file> [--thumb] | publish <itemId> | live <itemId> [url] | golden <itemId> | list");
        process.exit(1);
      }
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "worker": {
    const { runWorker } = await import("../src/worker.js");
    // returns false when the singleton lock is held — exit non-zero so a
    // supervisor/script can tell "already running" from "ran and stopped"
    const started = await runWorker(rest);
    if (started === false) process.exit(1);
    break;
  }
  case "digest": {
    const { buildDigest } = await import("../../studio/src/digest.js");
    const d = buildDigest();
    console.log(`digest ${d.date}: top ${d.top10.length} · risers ${d.overnightRisers.length} · outliers ${d.outliers.length} · unposted ${d.unposted.length}`);
    process.exit(0);
    break;
  }
  case "brief": {
    const { generateBrief } = await import("../../studio/src/briefs.js");
    const { collection } = await import("../../shared/src/store.js");
    const noflag = rest.filter((a) => !a.startsWith("--"));
    const target = noflag[0];
    try {
      let args;
      if (target === "topic" && noflag[1]) {
        args = { topic: noflag.slice(1).join(" ") };
        console.log(`briefing keyword/topic: ${args.topic}`);
      } else if (!target || target === "top") {
        const top = collection("clusters").all().sort((a, b) => b.opportunityScore - a.opportunityScore)[0];
        if (!top) throw new Error("no clusters — run: factory score");
        args = { clusterId: top.id };
        console.log(`briefing #1 cluster: ${top.label} (${top.opportunityScore})`);
      } else if (collection("clusters").get(target)) args = { clusterId: target };
      else if (collection("wishlist").get(target)) args = { wishlistId: target };
      else throw new Error(`${target} matches no cluster or wishlist entry`);
      const b = await generateBrief(args);
      console.log(`\n[${b.kind}] ${b.topic}`);
      if (b.duplicateWarning) console.log(`  ⚠ near-duplicate (${b.duplicateWarning.sim}) of idea: ${b.duplicateWarning.title}`);
      if (b.factualityWarning) console.log(`  ⚠ unsourced specifics — ${b.factualityWarning.note}`);
      console.log(`  status ${b.status}${b.deadline ? ` · deadline ${b.deadline}` : ""}${b.scheduledDate ? ` · slot ${b.scheduledDate}` : ""}`);
      console.log(`  hooks: ${b.payload.yt_short.hook_variants.map((h) => h.slice(0, 60)).join(" | ")}`);
      if (b.payload.template) console.log("  (template mode — add an LLM key for full generation)");
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "wishlist": {
    const { analyzeYouTube, pollTracked } = await import("../../studio/src/wishlist.js");
    const { collection } = await import("../../shared/src/store.js");
    const [action, ...wargs] = rest.filter((a) => !a.startsWith("--"));
    try {
      if (action === "manual" && wargs[0]) {
        const { analyzeManual } = await import("../../studio/src/wishlist.js");
        const { readFileSync, unlinkSync } = await import("node:fs");
        const form = JSON.parse(readFileSync(wargs[0], "utf8").replace(/^﻿/, ""));
        if (wargs[0].endsWith(".tmp.json")) unlinkSync(wargs[0]);
        const e = await analyzeManual(form);
        console.log(`\n[${e.predictedTier}] manual ${e.platform} entry — ${e.verdict.rubric}`);
        if (e.contentAnalysis) console.log(`  hook: ${e.contentAnalysis.hookPattern} · steal: ${e.contentAnalysis.stealThis}`);
        else console.log("  (no LLM key — structural analysis skipped)");
      } else if (action === "add" && wargs[0]) {
        const e = await analyzeYouTube(wargs[0]);
        console.log(`\n[${e.predictedTier}] ${e.title}`);
        console.log(`  ${e.verdict.rubric}`);
        if (e.contentAnalysis) {
          console.log(`  hook: ${e.contentAnalysis.hookPattern} · topic: ${e.contentAnalysis.topic}`);
          console.log(`  steal: ${e.contentAnalysis.stealThis}`);
        } else console.log("  (no LLM key — structural analysis skipped)");
        console.log(`RESULT ${JSON.stringify({ id: e.id, tier: e.predictedTier })}`);
      } else if (action === "poll") {
        const r = await pollTracked();
        console.log(`tracking poll: ${r.polled} entr${r.polled === 1 ? "y" : "ies"} updated${r.note ? ` (${r.note})` : ""}`);
      } else if (action === "list") {
        for (const e of collection("wishlist").all()) {
          console.log(`  [${e.predictedTier}] ${e.platform.padEnd(9)} ${(e.title || "").slice(0, 60)}`);
        }
      } else {
        console.error("usage: factory wishlist add <youtube-url> | manual <form.json> | poll | list");
        process.exit(1);
      }
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    break;
  }
  case "publish": {
    const { publish } = await import("../../publish/src/publish.js");
    const ok = await publish(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "auth-youtube": {
    const { authYoutube } = await import("../../publish/src/auth.js");
    const ok = await authYoutube();
    process.exit(ok ? 0 : 1);
    break;
  }
  case "analytics": {
    const { runAnalytics } = await import("../../publish/src/analytics.js");
    const ok = await runAnalytics();
    process.exit(ok ? 0 : 1);
    break;
  }
  case "compliance": {
    // machine-readable compliance report for the portal
    const { checkCompliance } = await import("../../publish/src/compliance.js");
    const { loadEnv } = await import("../../shared/src/config.js");
    loadEnv();
    const id = rest.filter((a) => !a.startsWith("--"))[0];
    if (!id) {
      console.error("usage: factory compliance <id> [--json]");
      process.exit(1);
    }
    const report = checkCompliance(id, { platform: "youtube" });
    if (rest.includes("--json")) console.log(`RESULT ${JSON.stringify(report)}`);
    else {
      const icon = { ok: "+", warn: "o", fail: "x" };
      for (const ch of report.checks) console.log(`  ${icon[ch.level]} ${ch.msg}`);
      console.log(report.pass ? "\nPASS" : "\nBLOCKED");
    }
    process.exit(0);
    break;
  }
  case "help":
  case undefined:
    console.log(HELP);
    break;
  default:
    console.error(`${c.red("unknown command:")} ${cmd}`);
    console.log(HELP);
    process.exit(1);
}
