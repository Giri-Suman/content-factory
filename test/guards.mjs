/**
 * The guards that stop the factory lying to itself.
 *
 * Run: node test/guards.mjs
 *
 * Each block here corresponds to a defect that shipped: learning from seeded
 * fixtures, a substituted voice reported as the paid one, and a quota allocator
 * nothing consults. They are cheap checks on expensive mistakes.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0;
let fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " — " + detail : ""}`);
  }
};

/* ------------------------------------------------ no learning from seeds --- */
/**
 * `factory seed myposts` writes 25 synthetic posts with fabricated stats and a
 * predictedTier built to correlate with them. Anything that LEARNS from
 * myposts must exclude them, or it measures its own fixtures and reports that
 * its predictions are excellent.
 */
{
  const learners = [
    "packages/publish/src/calibration.js",
    "packages/studio/src/ideaBank.js",
    "packages/studio/src/playbooks.js",
    "packages/studio/src/lessons.js",
    "packages/studio/src/motionLab.js",
    "packages/studio/src/composers.js",
    "packages/studio/src/growthTools.js",
    "packages/studio/src/originality.js",
  ];
  const offenders = [];
  for (const rel of learners) {
    const src = readFileSync(path.join(root, rel), "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      if (!line.includes('collection("myposts")')) return;
      // by-id access and writes are not learning
      if (/\.(get|upsert|update|remove)\(/.test(line)) return;
      /* A bare `const posts = collection("myposts")` handle is only a learner
         if it is then queried in bulk; tagPostEffects grabs one by id. Look a
         few lines ahead for both the seed guard and the by-id giveaway. */
      const window = lines.slice(i, i + 4).join(" ");
      if (/\.(get|upsert|update|remove)\(/.test(window)) return;
      if (!window.includes(".seed")) offenders.push(`${rel}:${i + 1}`);
    });
  }
  ok("no learner reads myposts without excluding seeds", offenders.length === 0, offenders.join(", "));
}

/* --------------------------------------- degradations are recorded, not logged --- */
{
  const voice = readFileSync(path.join(root, "packages/pipeline/src/voice.js"), "utf8");
  ok(
    "voice records the tier it DELIVERED, not the one requested",
    /meta\.tier = degraded \? "free" : opt\.tier/.test(voice),
    "a failed paid voice must not be labelled with the paid tier"
  );
  ok("voice marks the fallback on the meta", /meta\.degraded = degraded/.test(voice));

  const render = readFileSync(path.join(root, "packages/pipeline/src/render.js"), "utf8");
  ok("loudnorm failure is returned rather than swallowed", /return String\(why\)/.test(render));
  ok("loudnorm failure is recorded against the render", /noteDegradation\(props\.id, `loudnorm-/.test(render));

  const judges = readFileSync(path.join(root, "packages/judges/src/judges.js"), "utf8");
  ok("the AudioJudge reads the degradation ledger", /degradationsFor\(renderId\)/.test(judges));
}

/* ------------------------------------------------------------- allocator --- */
{
  const { MODULE_BUDGETS, moduleForJob, canSpend } = await import("../packages/radar/src/allocator.js");

  const total = Object.values(MODULE_BUDGETS).reduce((a, b) => a + b, 0);
  ok("module budgets stay inside the 10,000/day YouTube quota", total <= 10000, `budgets total ${total}`);
  ok("an unmapped job falls back to the reserve bucket", moduleForJob("something-new") === "reserve");
  ok("a known job maps to its own bucket", moduleForJob("yt-trending") === "trending");

  const small = canSpend("yt-trending", 1);
  ok("canSpend answers with a decision", typeof small === "object" && "ok" in small, JSON.stringify(small).slice(0, 80));
  const huge = canSpend("yt-trending", 999999);
  ok("canSpend refuses a request larger than the budget", huge.ok === false, JSON.stringify(huge).slice(0, 80));
}

/* ----------------------------------------------------------------- tiers --- */
{
  const tiers = await import("../packages/llm/src/tiers.js");
  const names = tiers.TIER_NAMES;
  ok("tier order is cheapest-first", names[0] === "free" && names[names.length - 1] === "best");

  const avail = tiers.tierAvailability();
  ok("availability is a list the Settings page can map over", Array.isArray(avail) && avail.length === names.length);
  ok("every tier reports whether it is usable", avail.every((t) => typeof t.available === "boolean"));

  /* Falling back must never cost MORE than what was asked for. A chain that
     escalates on failure turns an outage into a surprise bill. */
  const resolved = tiers.resolveChain ? tiers.resolveChain("script", "cheap") : null;
  const chain = Array.isArray(resolved?.chain) ? resolved.chain : null;
  if (chain && chain.length) {
    const idx = chain.map((o) => names.indexOf(o.tier));
    ok("a fallback chain never escalates to a pricier tier", idx.every((n, i) => i === 0 || n <= idx[i - 1]), JSON.stringify(idx));
  } else {
    ok("a fallback chain never escalates to a pricier tier", true, `no chain configured for this machine (${JSON.stringify(resolved)}) — nothing to escalate`);
  }
}

/* ------------------------------------------------------------ compliance --- */
{
  const mod = await import("../packages/publish/src/compliance.js").catch(() => null);
  if (!mod) {
    ok("compliance module loads", false, "packages/publish/src/compliance.js not found");
  } else {
    const fn = mod.checkCompliance || mod.compliance || mod.default;
    ok("compliance exposes a checker", typeof fn === "function", `exports: ${Object.keys(mod).join(",")}`);
  }
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
