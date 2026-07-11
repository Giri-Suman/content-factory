import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "../../shared/src/config.js";
import { prepare } from "./prepare.js";

const RENDERER = path.join(repoRoot, "renderers", "code-report");

export async function renderScript(argv) {
  const args = argv.filter((a) => !a.startsWith("--"));
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const scriptPath = args[0];
  if (!scriptPath) {
    console.error("usage: factory render <script.json> [--wide-only | --vertical-only]");
    return false;
  }

  console.log(`\npreparing ${scriptPath}`);
  const { propsPath, props } = await prepare(scriptPath);
  const seconds = (props.timeline.totalFrames / props.timeline.fps).toFixed(1);
  console.log(`  timeline: ${props.scenes.length} scenes, ${props.timeline.totalFrames} frames (${seconds}s)`);

  const outDir = path.join(repoRoot, "renders", props.id);
  mkdirSync(outDir, { recursive: true });

  const targets = [];
  if (!flags.has("--vertical-only")) targets.push(["CodeReport", "wide.mp4"]);
  if (!flags.has("--wide-only")) targets.push(["CodeReportVertical", "short.mp4"]);

  for (const [comp, name] of targets) {
    const out = path.join(outDir, name);
    console.log(`\nrendering ${comp} -> ${out}`);
    const res = spawnSync(`npx remotion render src/index.jsx ${comp} "${out}" --props="${propsPath}"`, {
      cwd: RENDERER,
      shell: true,
      stdio: "inherit",
      timeout: 1000 * 60 * 30,
    });
    if (res.status !== 0) {
      console.error(`\nrender FAILED for ${comp}`);
      return false;
    }
  }

  console.log(`\ndone -> ${outDir}`);
  return true;
}
