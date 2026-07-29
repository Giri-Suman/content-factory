import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection, validateShape } from "../../shared/src/store.js";
import { chat, providerStatus } from "../../llm/src/llm.js";

/**
 * P17: Brief -> RenderSpec compiler. The repo's RenderSpec is the
 * code-report script.json (scene types: kinetic/code/terminal/screenshot/
 * stat/quote/meme; timing is computed from real voice durations, which
 * beats fixed startSec/endSec). Output is validateShape-checked before it
 * ever reaches the renderer. LLM maps beats->scenes when a key exists;
 * a deterministic mapping otherwise.
 */

const SCRIPT_SHAPE = { id: "string", title: "string", scenes: "array" };
const SCENE_TYPES = new Set(["kinetic", "code", "terminal", "screenshot", "stat", "quote", "meme"]);

function heuristicScenes(brief) {
  const p = brief.payload;
  const hook = p.yt_short?.hook_variants?.[0] || brief.topic;
  const beats = p.yt_short?.beats || [];
  return [
    {
      type: "kinetic",
      voiceover: hook,
      emphasis: hook.split(/\s+/).filter((w) => w.length > 6).slice(0, 3),
    },
    {
      type: "terminal",
      voiceover: beats.join(". ") || p.core_idea || brief.topic,
      lines: ["$ " + brief.topic.toLowerCase().slice(0, 44), ...beats.map((b, i) => `beat ${i + 1}.... ${b.slice(0, 40)}`), "done."],
    },
    {
      type: "quote",
      voiceover: p.core_idea || brief.topic,
      quote: (p.core_idea || brief.topic).slice(0, 120),
      attribution: "the brief",
    },
  ];
}

async function llmScenes(brief, lessonBlock = "") {
  if (!providerStatus().active) return null;
  const p = brief.payload;
  try {
    const res = await chat({
      task: "script",
      maxTokens: 4000,
      system:
        `You compile a video brief into renderer scenes for: ${NICHE_CONTEXT}.${lessonBlock} Scene types: ` +
        'kinetic {voiceover, emphasis[]}, code {voiceover, lang, code, focus[2]}, terminal {voiceover, lines[]}, ' +
        "stat {voiceover, label, stats[{name,value,suffix}]}, quote {voiceover, quote, attribution}, meme {voiceover, emoji, text}. " +
        'Open with a kinetic hook; 3-5 scenes total; voiceover conversational, ~8s each. Reply ONLY JSON: {"scenes":[...]}',
      user: `topic: ${brief.topic}\nhook: ${p.yt_short?.hook_variants?.[0]}\nbeats: ${(p.yt_short?.beats || []).join(" | ")}\ncore idea: ${p.core_idea}`,
    });
    const parsed = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
    const scenes = (parsed.scenes || []).filter((s) => SCENE_TYPES.has(s.type) && s.voiceover);
    return scenes.length >= 2 ? scenes : null;
  } catch {
    return null;
  }
}

export async function compileBrief(briefId) {
  loadEnv();
  const brief = collection("briefs").get(briefId);
  if (!brief) throw new Error(`no brief ${briefId}`);

  // P19: inject the top lessons for the "script" scope into generation
  const { lessonsFor } = await import("./lessons.js");
  const injected = lessonsFor("script");
  if (injected.lessons.length) console.log(`  injecting ${injected.lessons.length} script lesson(s) into generation`);

  const scenes = (await llmScenes(brief, injected.block)) || heuristicScenes(brief);

  // Motion Lab: recommend an effect per scene. Additive only — `effect` is a
  // hint the renderer may honour, and it makes the effect->retention join
  // automatic instead of relying on `factory motion tag` by hand. A failure
  // here must never block a compile, so it's best-effort.
  try {
    const { suggestEffects } = await import("./motionLab.js");
    const { activeNiches } = await import("./nichePacks.js");
    // same resolution order the orchestrator's packForBrief uses
    const niche = brief.niche || activeNiches()[0] || "coding";
    for (const [i, s] of scenes.entries()) {
      const picks = suggestEffects({ sceneType: i === 0 ? "hook" : s.type, niche, limit: 1 });
      if (picks[0]) s.effect = picks[0].id;
    }
  } catch (e) {
    console.log(`  (effect suggestion skipped: ${e.message.slice(0, 60)})`);
  }

  const script = {
    id: `brief-${briefId.slice(0, 10)}`,
    title: brief.payload?.yt_short?.title || brief.topic,
    brand: { name: "CONTENT FACTORY", accent: "#ffb224" },
    outro: { cta: brief.payload?.ig_reel?.caption?.slice(0, 90) || "Follow for more." },
    scenes,
  };

  const check = validateShape(script, SCRIPT_SHAPE);
  if (!check.ok) throw new Error(`compiled script invalid: ${check.errors.join(", ")}`);
  for (const s of scenes) {
    if (!SCENE_TYPES.has(s.type) || typeof s.voiceover !== "string") {
      throw new Error(`invalid scene: ${JSON.stringify(s).slice(0, 80)}`);
    }
  }

  const dir = path.join(repoRoot, "data", "scripts");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${script.id}.json`);
  writeFileSync(file, JSON.stringify(script, null, 2));
  return { script, file, briefId };
}
