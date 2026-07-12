import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, ensureDirs, paths } from "../../shared/src/config.js";
import { findTrendByPrefix, markUsed } from "../../radar/src/db.js";
import { STYLE_GUIDE, buildUserPrompt, SCENE_TYPES } from "./style.js";

const SCRIPT_MODEL = () => process.env.ANTHROPIC_SCRIPT_MODEL || "claude-opus-4-8";

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

export async function generateScript(argv) {
  loadEnv();
  ensureDirs();
  const args = argv.filter((a) => !a.startsWith("--"));
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const input = args.join(" ").trim();
  if (!input) {
    console.error('usage: factory script <trend-id | "freeform topic"> [--template]');
    return false;
  }

  // trend id prefix, or freeform topic
  let context;
  let trendId = null;
  const trend = /^[a-z0-9]{4,10}$/.test(input) ? findTrendByPrefix(input) : null;
  if (trend) {
    trendId = trend.id;
    context = { title: trend.title, url: trend.url, source: trend.source, points: trend.points, comments: trend.comments };
    console.log(`\ntrend ${trend.id}: ${trend.title.slice(0, 80)}`);
  } else {
    context = { topic: input };
    console.log(`\nfreeform topic: ${input.slice(0, 80)}`);
  }

  if (flags.has("--template") || !process.env.ANTHROPIC_API_KEY) {
    if (!process.env.ANTHROPIC_API_KEY && !flags.has("--template")) {
      console.log("no ANTHROPIC_API_KEY in .env — writing a hand-fill template instead");
    }
    const script = templateScript(context);
    const out = writeOut(script, null, trendId);
    console.log(`template -> ${out}\nfill in the scenes, then: factory render "${out}"\n`);
    return true;
  }

  console.log(`drafting with ${SCRIPT_MODEL()}...`);
  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.create({
      model: SCRIPT_MODEL(),
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: STYLE_GUIDE,
      messages: [{ role: "user", content: buildUserPrompt(context) }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("ANTHROPIC_API_KEY is invalid — check .env");
      return false;
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    console.error("model declined this topic — pick another trend");
    return false;
  }

  const text = response.content.find((b) => b.type === "text")?.text || "";
  const parsed = extractJson(text);
  const script = validate(parsed.script || parsed);
  const meta = parsed.meta || null;

  const out = writeOut(script, meta, trendId);
  console.log(`\nscript: ${script.title}`);
  console.log(`scenes: ${script.scenes.map((s) => s.type).join(" -> ")}`);
  if (meta?.titles) console.log(`titles:\n  - ${meta.titles.slice(0, 5).join("\n  - ")}`);
  console.log(`\nsaved -> ${out}`);
  console.log(`review the jokes, then: factory render "${out}"\n`);
  return true;
}
