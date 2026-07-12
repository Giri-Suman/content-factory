import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, ensureDirs, paths } from "../../shared/src/config.js";
import { findTrendByPrefix, markUsed } from "../../radar/src/db.js";
import { chat, providerStatus } from "../../llm/src/llm.js";
import { STYLE_GUIDE, buildUserPrompt, SCENE_TYPES } from "./style.js";

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "episode";

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("model returned no JSON object");
  return JSON.parse(text.slice(start, end + 1));
}

function validate(script) {
  if (!Array.isArray(script.scenes) || script.scenes.length === 0) {
    throw new Error("script has no scenes");
  }
  script.scenes.forEach((s, i) => {
    if (!SCENE_TYPES.has(s.type)) throw new Error(`scene ${i}: unknown type "${s.type}"`);
    if (!s.voiceover) throw new Error(`scene ${i}: missing voiceover`);
  });
  script.id = slugify(script.id || script.title || "episode");
  return script;
}

function templateScript(context) {
  const id = slugify(context.topic || context.title || "episode");
  return {
    id,
    title: (context.topic || context.title || "Untitled").slice(0, 60),
    outro: { cta: "Subscribe for more." },
    scenes: [
      { type: "kinetic", voiceover: "HOOK: write the bold claim here.", emphasis: ["HOOK:"] },
      { type: "screenshot", voiceover: "What the story is.", src: context.url || "https://news.ycombinator.com", pan: "down" },
      { type: "code", voiceover: "Show the thing in code.", lang: "javascript", code: "// your code here" },
      { type: "kinetic", voiceover: "Why it matters. End on a punchline.", emphasis: ["matters."] },
    ],
  };
}

function writeOut(script, meta, trendId) {
  const dir = path.join(paths.data, "scripts");
  mkdirSync(dir, { recursive: true });
  const scriptPath = path.join(dir, `${script.id}.json`);
  writeFileSync(scriptPath, JSON.stringify(script, null, 2));
  if (meta) writeFileSync(path.join(dir, `${script.id}.meta.json`), JSON.stringify(meta, null, 2));
  if (trendId) markUsed(trendId);
  return scriptPath;
}

/**
 * Core drafting flow, reusable by the CLI and Mission Control.
 * input: a trend-id prefix or a freeform topic string.
 * Returns { scriptPath, script, meta, provider, template }.
 */
export async function draftScript(input, { template = false } = {}) {
  loadEnv();
  ensureDirs();

  let context;
  let trendId = null;
  const trend = /^[a-z0-9]{4,10}$/.test(input) ? findTrendByPrefix(input) : null;
  if (trend) {
    trendId = trend.id;
    context = {
      title: trend.title,
      url: trend.url,
      source: trend.source,
      points: trend.points,
      comments: trend.comments,
      category: trend.category,
    };
  } else {
    context = { topic: input };
  }

  const status = providerStatus();
  if (template || !status.active) {
    const script = templateScript(context);
    const scriptPath = writeOut(script, null, trendId);
    return { scriptPath, script, meta: null, provider: null, template: true, context };
  }

  const result = await chat({
    system: STYLE_GUIDE,
    user: buildUserPrompt(context),
    task: "script",
    maxTokens: 16000,
  });
  const parsed = extractJson(result.text);
  const script = validate(parsed.script || parsed);
  const meta = parsed.meta || null;
  const scriptPath = writeOut(script, meta, trendId);
  return { scriptPath, script, meta, provider: `${result.provider}:${result.model}`, template: false, context };
}

export async function generateScript(argv) {
  const args = argv.filter((a) => !a.startsWith("--"));
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const input = args.join(" ").trim();
  if (!input) {
    console.error('usage: factory script <trend-id | "freeform topic"> [--template]');
    return false;
  }

  loadEnv();
  const status = providerStatus();
  if (!status.active && !flags.has("--template")) {
    console.log("no LLM provider configured (.env: ANTHROPIC_API_KEY / OPENROUTER_API_KEY / OLLAMA_MODEL) — writing a hand-fill template");
  } else if (!flags.has("--template")) {
    console.log(`\ndrafting with ${status.active} (${status.scriptModel})...`);
  }

  const out = await draftScript(input, { template: flags.has("--template") });

  if (out.template) {
    console.log(`template -> ${out.scriptPath}\nfill in the scenes, then: factory render "${out.scriptPath}"\n`);
  } else {
    console.log(`\nscript: ${out.script.title}`);
    console.log(`scenes: ${out.script.scenes.map((s) => s.type).join(" -> ")}`);
    if (out.meta?.titles) console.log(`titles:\n  - ${out.meta.titles.slice(0, 5).join("\n  - ")}`);
    console.log(`\nsaved -> ${out.scriptPath}`);
    console.log(`review the jokes, then: factory render "${out.scriptPath}"\n`);
  }
  // machine-readable line for Mission Control
  console.log(`RESULT ${JSON.stringify({ scriptPath: out.scriptPath, id: out.script.id, template: out.template })}`);
  return true;
}
