import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, ensureDirs, repoRoot } from "../../shared/src/config.js";
import { chat, providerStatus } from "../../llm/src/llm.js";
import { MATH_GUIDE, buildMathPrompt, lintManim } from "../../studio/src/mathStyle.js";
import { synthesize, ffprobeDuration } from "./voice.js";

const FPS = 30;
const RENDERER = path.join(repoRoot, "renderers", "code-report");
const DEMOS_DIR = path.join(repoRoot, "renderers", "math", "demos");
const VENV_PY = path.join(repoRoot, ".venv", "Scripts", "python.exe");

const python = () => (existsSync(VENV_PY) ? VENV_PY : "python");

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "math-short";

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("model returned no JSON object");
  return JSON.parse(text.slice(start, end + 1));
}

function loadDemo(name) {
  const dir = path.join(DEMOS_DIR, name);
  if (!existsSync(dir)) {
    const available = readdirSync(DEMOS_DIR).join(", ");
    throw new Error(`unknown demo "${name}" — available: ${available}`);
  }
  const meta = JSON.parse(readFileSync(path.join(dir, "meta.json"), "utf8"));
  return { ...meta, manim: readFileSync(path.join(dir, "scene.py"), "utf8") };
}

function findManimOutput(mediaDir) {
  // manim writes media/videos/<file>/<quality>/<name>.mp4 — glob for it
  const hits = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "partial_movie_files") walk(full);
      else if (entry.name.endsWith(".mp4")) hits.push(full);
    }
  };
  if (existsSync(mediaDir)) walk(mediaDir);
  return hits[0] || null;
}

export async function mathShort(argv) {
  loadEnv();
  ensureDirs();
  const args = argv.filter((a) => !a.startsWith("--"));
  const flags = argv.filter((a) => a.startsWith("--"));
  const demoFlag = flags.find((f) => f.startsWith("--demo"));
  const demoName = demoFlag ? args[0] || "gauss-sum" : null;
  const topic = demoFlag ? null : args.join(" ").trim();

  if (!demoFlag && !topic) {
    console.error('usage: factory math "<topic>"   or   factory math <demo-name> --demo');
    console.error(`demos: ${readdirSync(DEMOS_DIR).join(", ")}`);
    return false;
  }

  /* 1 — get the spec: bundled demo, or LLM-written scene */
  let spec;
  if (demoName) {
    spec = loadDemo(demoName);
    console.log(`\ndemo scene: ${spec.title}`);
  } else {
    const status = providerStatus();
    if (!status.active) {
      console.error("writing a manim scene needs an LLM provider (.env) — or run a bundled demo:");
      console.error(`  factory math ${readdirSync(DEMOS_DIR)[0]} --demo`);
      return false;
    }
    console.log(`\nwriting manim scene with ${status.active} (${status.scriptModel})...`);
    const result = await chat({ system: MATH_GUIDE, user: buildMathPrompt(topic), task: "script", maxTokens: 16000 });
    spec = extractJson(result.text);
    spec.id = slugify(spec.id || topic);
  }

  const problems = lintManim(spec.manim);
  if (problems.length) {
    console.error(`generated scene failed the safety lint:\n  - ${problems.join("\n  - ")}`);
    return false;
  }

  const id = `math-${slugify(spec.id)}`;
  const buildDir = path.join(repoRoot, "data", "build", id);
  mkdirSync(buildDir, { recursive: true });
  writeFileSync(path.join(buildDir, "scene.py"), spec.manim);
  writeFileSync(path.join(buildDir, "spec.json"), JSON.stringify(spec, null, 2));

  /* 2 — render the manim scene (vertical 1080x1920 @ 30fps) */
  console.log("rendering manim scene (this takes a minute)...");
  const mediaDir = path.join(buildDir, "media");
  const res = spawnSync(
    python(),
    [
      "-m", "manim", "render",
      "-r", "1080,1920", "--fps", String(FPS),
      "--media_dir", mediaDir,
      "--disable_caching",
      "-o", "scene.mp4",
      path.join(buildDir, "scene.py"),
      "MathScene",
    ],
    { cwd: buildDir, encoding: "utf8", timeout: 1000 * 60 * 15, windowsHide: true }
  );
  const manimOut = findManimOutput(mediaDir);
  if (res.status !== 0 || !manimOut) {
    console.error("manim render FAILED:");
    console.error((res.stderr || res.stdout || "").slice(-2500));
    return false;
  }
  const videoSec = ffprobeDuration(manimOut);
  console.log(`  manim scene: ${videoSec.toFixed(1)}s`);

  /* 3 — voiceover */
  process.stdout.write("voice... ");
  const vo = await synthesize(spec.voiceover, path.join(buildDir, "vo"));
  console.log(`${vo.durationSec.toFixed(1)}s (${vo.provider})`);

  /* 4 — overlay: manim video + voice + captions via Remotion */
  const pubDir = path.join(RENDERER, "public", "gen", id);
  mkdirSync(pubDir, { recursive: true });
  copyFileSync(manimOut, path.join(pubDir, "scene.mp4"));
  copyFileSync(vo.file, path.join(pubDir, path.basename(vo.file)));

  const totalFrames = Math.round((vo.durationSec + 0.6) * FPS);
  const props = {
    video: `gen/${id}/scene.mp4`,
    audio: `gen/${id}/${path.basename(vo.file)}`,
    words: vo.words,
    videoFrames: Math.max(1, Math.round(videoSec * FPS)),
    totalFrames,
    hook: spec.hook || null,
    brand: { name: "CONTENT FACTORY" },
  };
  const propsPath = path.join(buildDir, "props.json");
  writeFileSync(propsPath, JSON.stringify(props, null, 2));

  const outDir = path.join(repoRoot, "renders", id);
  mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, "short.mp4");
  console.log(`compositing captions + voice -> ${out}`);
  const render = spawnSync(`npx remotion render src/index.jsx ShortOverlay "${out}" --props="${propsPath}"`, {
    cwd: RENDERER,
    shell: true,
    stdio: "inherit",
    timeout: 1000 * 60 * 30,
  });
  if (render.status !== 0) {
    console.error("overlay render FAILED");
    return false;
  }
  console.log(`\ndone -> ${out}\n`);
  console.log(`RESULT ${JSON.stringify({ out, id, title: spec.title })}`);
  return true;
}
