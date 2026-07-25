import { loadEnv } from "../../shared/src/config.js";
import { collection } from "../../shared/src/store.js";

/**
 * Batch produce — run N approved briefs through the synthetic lane in one
 * command. Strictly sequential (renders are CPU-bound; parallel would just
 * thrash), fault-isolated per brief, and it stops early on a cost ceiling
 * so an overnight batch can't surprise you with a bill.
 */

export async function batchProduce(argv = []) {
  loadEnv();
  const args = argv.filter((a) => !a.startsWith("--"));
  const limit = Number(args[0]) > 0 ? Number(args[0]) : 3;
  // explicit --max-cost=0 must mean ZERO, not "unset" — Number(x)||default eats it
  const rawCost = (argv.find((a) => a.startsWith("--max-cost=")) || "").split("=")[1];
  const maxCost = rawCost !== undefined && rawCost !== "" && Number.isFinite(Number(rawCost)) ? Number(rawCost) : 5;
  const dryRun = argv.includes("--list");

  const briefs = collection("briefs");
  const queue = briefs
    .find(
      (b) =>
        b.status === "approved" &&
        b.lane !== "capture" &&
        (!b.pipeline || ["approved", "scripted"].includes(b.pipeline.state))
    )
    .slice(0, limit);

  if (!queue.length) {
    console.log("nothing queued — approve some synthetic briefs first (Briefs page)");
    return { produced: 0, queue: 0 };
  }

  console.log(`\nbatch: ${queue.length} brief(s), sequential, cost ceiling $${maxCost}\n`);
  for (const b of queue) console.log(`  · ${b.topic.slice(0, 60)}`);
  if (dryRun) return { produced: 0, queue: queue.length, listed: true };

  const { produce } = await import("./orchestrator.js");
  const { costForVideo } = await import("../../shared/src/cost.js");
  const results = [];
  let spent = 0;

  for (const [i, brief] of queue.entries()) {
    if (spent >= maxCost) {
      console.log(`\nstopping: $${spent.toFixed(2)} spent hits the $${maxCost} ceiling (${queue.length - i} left in queue)`);
      break;
    }
    console.log(`\n[${i + 1}/${queue.length}] ${brief.topic.slice(0, 55)}`);
    globalThis.__factoryVideoId = `brief-${brief.id.slice(0, 10)}`;
    try {
      const r = await produce(brief.id, { profiles: "yt_short" });
      const cost = costForVideo(`brief-${brief.id.slice(0, 10)}`);
      spent += cost;
      results.push({ id: brief.id, topic: brief.topic, state: r.state, escalated: Boolean(r.escalated), cost });
      console.log(`  -> ${r.state}${r.escalated ? " (escalated)" : ""}  $${cost.toFixed(2)}`);
    } catch (e) {
      results.push({ id: brief.id, topic: brief.topic, state: "failed", error: String(e.message).slice(0, 120) });
      console.error(`  -> FAILED: ${String(e.message).slice(0, 120)}`);
    } finally {
      globalThis.__factoryVideoId = null;
    }
  }

  const ready = results.filter((r) => r.state === "ready").length;
  const escalated = results.filter((r) => r.escalated).length;
  const failed = results.filter((r) => r.state === "failed").length;
  console.log(`\nbatch done: ${ready} ready · ${escalated} escalated · ${failed} failed · $${spent.toFixed(2)} spent\n`);
  console.log(`RESULT ${JSON.stringify({ produced: results.length, ready, escalated, failed, spent: Math.round(spent * 100) / 100 })}`);
  return { produced: results.length, ready, escalated, failed, spent, results };
}
