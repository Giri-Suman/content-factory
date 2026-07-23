#!/usr/bin/env node
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
      --noise=-35dB --min-silence=0.45 --no-punch --no-captions
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
    await runWorker(rest);
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
