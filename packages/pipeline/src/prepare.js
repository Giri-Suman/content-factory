import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHighlighter } from "shiki";
import { loadEnv, repoRoot } from "../../shared/src/config.js";
import { synthesize } from "./voice.js";
import { findChrome } from "../../shared/src/chrome.js";

const FPS = 30;
const RENDERER = path.join(repoRoot, "renderers", "code-report");
const PUBLIC_DIR = path.join(RENDERER, "public");


/* ---------- code highlighting (Shiki, precomputed at prepare time) ---------- */

let highlighterPromise;
const BASE_LANGS = ["javascript", "typescript", "jsx", "tsx", "python", "bash", "json", "html", "css"];

async function highlight(code, lang) {
  highlighterPromise ??= createHighlighter({ themes: ["github-dark-default"], langs: BASE_LANGS });
  const hl = await highlighterPromise;
  let useLang = lang;
  if (!hl.getLoadedLanguages().includes(useLang)) {
    try {
      await hl.loadLanguage(useLang);
    } catch {
      useLang = "text";
    }
  }
  const { tokens } = hl.codeToTokens(code, { lang: useLang, theme: "github-dark-default" });
  return tokens.map((line) => line.map((t) => ({ t: t.content, c: t.color })));
}

/* ---------- screenshots (system Chrome headless — zero extra deps) ---------- */

function screenshot(url, outFile) {
  const chrome = findChrome();
  if (chrome) {
    spawnSync(
      `"${chrome}" --headless=new --disable-gpu --hide-scrollbars --window-size=1600,2200 --virtual-time-budget=9000 --screenshot="${outFile}" "${url}"`,
      { shell: true, timeout: 90000, encoding: "utf8", windowsHide: true }
    );
    if (existsSync(outFile)) return "chrome";
  }
  // offline/failed fallback: flat placeholder so the render never breaks
  spawnSync(`ffmpeg -y -f lavfi -i color=c=0x161b22:s=1600x2200 -frames:v 1 "${outFile}"`, {
    shell: true,
    timeout: 30000,
    windowsHide: true,
  });
  if (!existsSync(outFile)) throw new Error(`could not capture or generate screenshot for ${url}`);
  return "placeholder";
}

/* ---------- main ---------- */

export async function prepare(scriptPath) {
  loadEnv();
  const abs = path.resolve(scriptPath);
  if (!existsSync(abs)) throw new Error(`script not found: ${abs}`);
  const script = JSON.parse(readFileSync(abs, "utf8"));
  if (!script.id || !Array.isArray(script.scenes) || script.scenes.length === 0) {
    throw new Error("script.json needs at least { id, scenes: [...] }");
  }

  const id = script.id;
  const audioDir = path.join(PUBLIC_DIR, "audio", id);
  const shotsDir = path.join(PUBLIC_DIR, "shots", id);
  mkdirSync(audioDir, { recursive: true });
  mkdirSync(shotsDir, { recursive: true });

  const scenes = [];
  for (let i = 0; i < script.scenes.length; i++) {
    const scene = { ...script.scenes[i] };
    if (!scene.voiceover) throw new Error(`scene ${i} is missing "voiceover"`);
    process.stdout.write(`  scene ${i + 1}/${script.scenes.length} [${scene.type}] `);

    const meta = await synthesize(scene.voiceover, path.join(audioDir, `scene-${i}`));
    scene.audio = `audio/${id}/${path.basename(meta.file)}`;
    scene.words = meta.words;
    scene.durationSec = meta.durationSec;

    if (scene.type === "code") {
      scene.tokens = await highlight(scene.code || "", scene.lang || "javascript");
    }
    if (scene.type === "screenshot") {
      const out = path.join(shotsDir, `scene-${i}.png`);
      if (/^https?:/i.test(scene.src || "")) {
        const how = screenshot(scene.src, out);
        process.stdout.write(`shot:${how} `);
      } else {
        const local = path.resolve(path.dirname(abs), scene.src || "");
        if (!existsSync(local)) throw new Error(`scene ${i}: screenshot file not found: ${local}`);
        copyFileSync(local, out);
      }
      scene.img = `shots/${id}/scene-${i}.png`;
    }

    console.log(`voice ${meta.durationSec.toFixed(1)}s (${meta.provider})`);
    scenes.push(scene);
  }

  const intro = script.intro === false ? 0 : 75;
  const outroFrames = 90;
  let cursor = intro;
  const sceneTimeline = scenes.map((s) => {
    const frames = Math.max(45, Math.round((s.durationSec + 0.35) * FPS));
    const item = { start: cursor, frames };
    cursor += frames;
    return item;
  });
  const totalFrames = cursor + outroFrames;

  const props = {
    id,
    title: script.title || id,
    brand: { name: "CONTENT FACTORY", accent: "#ffb224", ...(script.brand || {}) },
    date: new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    outro: script.outro || {},
    captionScale: script.captionScale ?? 1, // P18: <1 = sabotage/red-flag for the VisualJudge
    scenes,
    timeline: { fps: FPS, intro, outro: outroFrames, scenes: sceneTimeline, totalFrames },
  };

  const buildDir = path.join(repoRoot, "data", "build", id);
  mkdirSync(buildDir, { recursive: true });
  const propsPath = path.join(buildDir, "props.json");
  writeFileSync(propsPath, JSON.stringify(props, null, 2));
  return { propsPath, props };
}
