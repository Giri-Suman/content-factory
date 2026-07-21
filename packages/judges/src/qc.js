import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot } from "../../shared/src/config.js";
import { collection } from "../../shared/src/store.js";
import { ideaJudge, scriptJudge, metadataJudge, visualJudge, audioJudge } from "./judges.js";
import { judgeAndRegenerate, escalate } from "./runner.js";

/**
 * P18 QC chain for a brief: script -> metadata -> (visual/audio if rendered).
 * Script regeneration has a CODED fix (strip banned opener -> concrete hook)
 * so the loop can fix a sabotaged script even keyless.
 */

const HEURISTIC_HOOKS = [
  "The 30-line script that saved me 6 hours a week",
  "I let AI run my workflow for a week — here's the result",
  "Stop doing this by hand — one command does it all",
];

/** Coded script fix: swap any banned-opener scene for a clean heuristic hook
 *  (REPLACE, not prepend — no stacking), globally strip placeholders. */
function regenerateScript(scriptPath) {
  let used = 0;
  const fn = async () => {
    const script = JSON.parse(readFileSync(scriptPath, "utf8"));
    const banned = /\b(wait for it|you won'?t believe|shocking|insane trick|this one trick|mind[- ]?blown)\b/gi;
    for (const s of script.scenes) {
      if (!s.voiceover) continue;
      if (banned.test(s.voiceover)) {
        // whole voiceover is compromised — replace with a fresh concrete hook
        s.voiceover = HEURISTIC_HOOKS[used++ % HEURISTIC_HOOKS.length] + ".";
        if (s.emphasis) s.emphasis = ["script", "hours"];
      }
      s.voiceover = s.voiceover.replace(/\[fill:[^\]]*\]/g, "the concrete payoff").trim();
    }
    writeFileSync(scriptPath, JSON.stringify(script, null, 2));
  };
  fn.codedFix = true; // signals the runner this is regenerable without an LLM
  return fn;
}

export async function qcBrief(briefId, { rendered = true } = {}) {
  loadEnv();
  const brief = collection("briefs").get(briefId);
  if (!brief) throw new Error(`no brief ${briefId}`);
  const costState = { spent: 0 };
  const results = {};

  // metadata judge (no regeneration wired here — flagged for the human)
  results.metadata = await judgeAndRegenerate({
    artifactType: "metadata",
    artifactId: briefId,
    judgeFn: () => metadataJudge(collection("briefs").get(briefId).payload),
    regenerateFn: null,
    costState,
  });

  // script judge (with coded regeneration) — needs a compiled script
  const scriptPath = path.join(repoRoot, "data", "scripts", `brief-${briefId.slice(0, 10)}.json`);
  if (existsSync(scriptPath)) {
    const regen = regenerateScript(scriptPath);
    results.script = await judgeAndRegenerate({
      artifactType: "script",
      artifactId: briefId,
      judgeFn: () => scriptJudge(JSON.parse(readFileSync(scriptPath, "utf8"))),
      regenerateFn: regen,
      costState,
    });
  }

  // visual + audio judges on the rendered output
  if (rendered) {
    const id = `brief-${briefId.slice(0, 10)}`;
    const propsPath = path.join(repoRoot, "data", "build", id, "props.json");
    const props = existsSync(propsPath) ? JSON.parse(readFileSync(propsPath, "utf8")) : null;
    const short = path.join(repoRoot, "renders", id, "short.mp4");
    const expectedSec = props ? props.timeline.totalFrames / props.timeline.fps : null;
    if (existsSync(short)) {
      results.visual = await judgeAndRegenerate({
        artifactType: "visual",
        artifactId: briefId,
        judgeFn: () => visualJudge(short, props),
        regenerateFn: null, // visual fix = re-render with fixed captionScale; human-triggered
        costState,
      });
      results.audio = await judgeAndRegenerate({
        artifactType: "audio",
        artifactId: briefId,
        judgeFn: async () => audioJudge(short, expectedSec),
        regenerateFn: null,
        costState,
      });
    }
  }

  const escalated = Object.entries(results).filter(([, r]) => r.status === "escalated");
  for (const [type, r] of escalated) escalate(type, briefId, r.reason);

  return { briefId, results, escalated: escalated.map(([t]) => t), costSpent: costState.spent };
}
