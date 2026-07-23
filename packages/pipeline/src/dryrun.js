import { loadEnv } from "../../shared/src/config.js";
import { collection } from "../../shared/src/store.js";

/**
 * P23 full-auto dry run: #1 cluster -> idea judge -> brief -> auto-approve
 * -> synthetic produce (script->judges->render->thumbnails->judges->ready)
 * — instrumented for wall-clock, estimated $ cost, and judge attempts.
 * Targets: <45 min, <$2 per synthetic video after warm caches.
 */

export async function dryRun(argv = []) {
  loadEnv();
  const t0 = Date.now();
  const clusters = collection("clusters").all().sort((a, b) => b.opportunityScore - a.opportunityScore);
  if (!clusters.length) throw new Error("no clusters — run: factory radar");
  const top = clusters[0];
  console.log(`\n=== FULL-AUTO DRY RUN ===\n#1 cluster: ${top.label} (score ${top.opportunityScore})\n`);

  // 1 — IdeaJudge on the cluster
  const { ideaJudge } = await import("../../judges/src/judges.js");
  const idea = await ideaJudge({ title: top.label, label: top.label, summary: top.summary });
  console.log(`IdeaJudge: ${idea.score}/100 ${idea.verdict}${idea.reasons.length ? " — " + idea.reasons[0] : ""}`);

  // 2 — generate brief
  const { generateBrief } = await import("../../studio/src/briefs.js");
  const brief = await generateBrief({ clusterId: top.id });
  console.log(`brief: ${brief.id} (${brief.kind})`);

  // fill metadata so the SEO gate can pass in a real (LLM) run; keyless we
  // note it. tag the video id so cost logging attributes correctly.
  globalThis.__factoryVideoId = `brief-${brief.id.slice(0, 10)}`;

  // 3 — auto-approve (the ONLY human step in production; automated here)
  const briefs = collection("briefs");
  briefs.update(brief.id, {
    status: "approved",
    lane: "synthetic",
    pipeline: { state: "approved", updatedAt: new Date().toISOString(), history: [{ state: "approved", at: new Date().toISOString() }] },
  });
  if (!argv.includes("--keep-template") && brief.payload.template) {
    // give it complete, publishable metadata across every platform so the
    // SEO gate passes and the run reaches "ready" (an LLM brief has all this)
    const p = brief.payload;
    const title = `${top.label.slice(0, 55)}`.replace(/[^\w\s]/g, "").trim() || "AI automation in 30 seconds";
    p.yt_short.title = title;
    p.yt_short.description = "The concrete, copy-paste version of this — built in code, rendered from a JSON script.\nNew AI + automation builds weekly.";
    p.yt_short.tags = ["ai automation", "coding", "developer tools", "python", "productivity"];
    p.ig_reel.caption = `${title} — here's the 30-second version. Would you use this?`;
    p.ig_reel.hashtags = ["#aiautomation", "#coding", "#python", "#developer", "#buildinpublic"];
    p.linkedin.post_text = `${title}\n\nThe short version, built entirely in code. Full breakdown in the comments.`;
    p.x_thread = [`${title} 🧵`, "Here's how it works, step by step.", "Steal the script — link below."];
    briefs.update(brief.id, { payload: p });
  }

  // 4 — synthetic produce (compile -> scriptJudge -> render -> judges -> thumbnails -> ready)
  console.log(`\nproducing (synthetic lane)...`);
  const { produce } = await import("./orchestrator.js");
  const result = await produce(brief.id, { profiles: "yt_short" });

  // 5 — measure
  const wallMin = (Date.now() - t0) / 6e4;
  const critiques = collection("critiques").find((c) => c.artifactId === brief.id);
  const attempts = critiques.reduce((a, c) => Math.max(a, c.attempt), 0);
  const { costForVideo } = await import("../../shared/src/cost.js");
  const cost = costForVideo(`brief-${brief.id.slice(0, 10)}`);
  globalThis.__factoryVideoId = null;

  console.log(`\n=== DRY RUN REPORT ===`);
  console.log(`  final state:    ${result.state}${result.escalated ? " (escalated — Human Review)" : ""}`);
  console.log(`  wall-clock:     ${wallMin.toFixed(1)} min   (target <45)`);
  console.log(`  est. API cost:  $${cost.toFixed(2)}        (target <$2)`);
  console.log(`  judge attempts: ${attempts} max, ${critiques.length} critiques logged`);
  console.log(`  thumbnails:     ${(collection("thumbnails").get(brief.id)?.variants || []).length} variants`);
  const pass = wallMin < 45 && cost < 2;
  console.log(`\n  ${pass ? "✓ within targets" : "⚠ over a target — investigate"}\n`);
  console.log(`RESULT ${JSON.stringify({ briefId: brief.id, state: result.state, wallMin: Math.round(wallMin * 10) / 10, cost, attempts, escalated: Boolean(result.escalated) })}`);
  return { pass, wallMin, cost, attempts, state: result.state };
}
