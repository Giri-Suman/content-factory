import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "../../shared/src/config.js";
import { prepare } from "./prepare.js";
import { noteDegradation } from "../../shared/src/degradations.js";

const RENDERER = path.join(repoRoot, "renderers", "code-report");

/** P17 platform profiles — config, not code. One RenderSpec, any profile. */
export const PROFILES = {
  yt_short: { comp: "CodeReportVertical", file: "short.mp4", w: 1080, h: 1920 },
  ig_reel: { comp: "CodeReportVertical", file: "short.mp4", w: 1080, h: 1920, cover: "cover.png" },
  linkedin: { comp: "CodeReportLinkedIn", file: "linkedin.mp4", w: 1080, h: 1350 },
  x: { comp: "CodeReportSquare", file: "x.mp4", w: 1080, h: 1080 },
  wide: { comp: "CodeReport", file: "wide.mp4", w: 1920, h: 1080 },
};

/**
 * Broadcast loudness on the finished file (audio-only re-encode).
 *
 * Returns null on success or a reason string on failure. It used to return
 * nothing and simply skip the rename when ffmpeg failed, so a video shipped at
 * whatever loudness it happened to have and no log line existed to explain why
 * it was quiet on someone's phone.
 */
function loudnorm(file) {
  const tmp = file.replace(/\.mp4$/, ".ln.mp4");
  const res = spawnSync(
    "ffmpeg",
    ["-y", "-v", "error", "-i", file, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:v", "copy", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "192k", tmp],
    { encoding: "utf8", windowsHide: true, timeout: 300000 }
  );
  if (res.status === 0 && existsSync(tmp)) {
    renameSync(tmp, file);
    return null;
  }
  const raw = res.stderr || res.error?.message || `ffmpeg exited ${res.status}`;
  const why = raw.trim().split(String.fromCharCode(10)).pop().trim();
  console.error(`  loudnorm FAILED on ${path.basename(file)} - shipping un-normalised audio (${String(why).slice(0, 120)})`);
  return String(why).slice(0, 200);
}

/**
 * Silent copy for autoplay feeds.
 *
 * Instagram, Facebook and X autoplay muted, and a viewer who hears nothing on
 * tap-to-unmute has already scrolled. A burned-caption silent cut is the
 * version that works there — and it also gives you something safe to post when
 * the audio has a licensing question mark on it.
 *
 * Stream-copies the video, so it costs a file copy rather than a re-encode.
 */
export function silentVersion(mp4File) {
  if (!existsSync(mp4File)) throw new Error(`no such file: ${mp4File}`);
  const out = mp4File.replace(/\.mp4$/i, ".silent.mp4");
  const res = spawnSync(
    "ffmpeg",
    ["-y", "-v", "error", "-i", mp4File, "-an", "-c:v", "copy", "-movflags", "+faststart", out],
    { encoding: "utf8", windowsHide: true, timeout: 1000 * 60 * 10 }
  );
  if (res.status !== 0) throw new Error(`silent export failed: ${(res.stderr || "").slice(-200)}`);
  return { file: out, note: "no audio track — for muted autoplay feeds; make sure captions are burned in" };
}

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

  /* Storage gate BEFORE any CPU is spent. Finding out you are out of space
     after a ten-minute render is the failure this prevents. Skipped silently
     when R2 is unconfigured, and a network problem must not block a local
     render either — only a real over-ceiling reading stops the run. */
  try {
    const { assertSpace } = await import("../../shared/src/r2.js");
    await assertSpace();
  } catch (e) {
    if (/storage is at/.test(e.message)) {
      console.error(`
  ${e.message}
`);
      return false;
    }
    // anything else (offline, listing failed) is not a reason to refuse to render
  }

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

/**
 * P17: full chain — brief -> compile -> render every requested profile ->
 * loudnorm -> cover png -> attach files onto the brief's PublishItems.
 * Concurrency 1 by construction (profiles render sequentially).
 */
export async function renderBrief(argv) {
  const args = argv.filter((a) => !a.startsWith("--"));
  const briefId = args[0];
  if (!briefId) {
    console.error("usage: factory render brief <briefId> [--profiles=yt_short,ig_reel,linkedin,x]");
    return false;
  }
  const profFlag = argv.find((a) => a.startsWith("--profiles="));
  const wanted = profFlag ? profFlag.split("=")[1].split(",") : ["yt_short", "ig_reel", "linkedin", "x"];
  const invalid = wanted.filter((p) => !PROFILES[p]);
  if (invalid.length) {
    console.error(`unknown profile(s): ${invalid.join(", ")} — valid: ${Object.keys(PROFILES).join(", ")}`);
    return false;
  }

  /* Storage gate FIRST — before compileBrief, which is an AI call that costs
     money, and long before any render CPU. Refusing after paying for the
     compile would be the same mistake as refusing after the render. */
  try {
    const { assertSpace } = await import("../../shared/src/r2.js");
    await assertSpace();
  } catch (e) {
    if (/storage is at/.test(e.message)) {
      console.error(`
  ${e.message}
`);
      return false;
    }
    // offline or a failed listing must not block a local render
  }

  const { compileBrief } = await import("../../studio/src/compileBrief.js");
  console.log(`compiling brief ${briefId}...`);
  const { script, file } = await compileBrief(briefId);
  console.log(`  ${script.scenes.length} scenes -> ${file}`);

  const { propsPath, props } = await prepare(file);
  const seconds = (props.timeline.totalFrames / props.timeline.fps).toFixed(1);
  console.log(`  timeline: ${seconds}s`);

  const outDir = path.join(repoRoot, "renders", props.id);
  mkdirSync(outDir, { recursive: true });

  // dedupe comps (yt_short + ig_reel share one vertical render)
  const jobs = new Map();
  for (const p of wanted) jobs.set(PROFILES[p].comp, PROFILES[p]);

  const made = {};
  for (const prof of jobs.values()) {
    const out = path.join(outDir, prof.file);
    console.log(`\nrendering ${prof.comp} (${prof.w}x${prof.h}) -> ${prof.file}`);
    const res = spawnSync(`npx remotion render src/index.jsx ${prof.comp} "${out}" --props="${propsPath}"`, {
      cwd: RENDERER,
      shell: true,
      stdio: "inherit",
      timeout: 1000 * 60 * 30,
    });
    if (res.status !== 0 || !existsSync(out)) {
      console.error(`render FAILED for ${prof.comp}`);
      return false;
    }
    // an unnormalised ship is a quality drop the judges must be able to see
    const lnFailed = loudnorm(out);
    if (lnFailed) noteDegradation(props.id, `loudnorm-${prof.comp}`, lnFailed);
    made[prof.comp] = out;
  }

  // ig cover frame (t=0 still)
  let cover = null;
  if (wanted.includes("ig_reel")) {
    cover = path.join(outDir, "cover.png");
    const still = spawnSync(`npx remotion still src/index.jsx CodeReportVertical "${cover}" --frame=0 --props="${propsPath}"`, {
      cwd: RENDERER,
      shell: true,
      stdio: "inherit",
      timeout: 1000 * 60 * 10,
    });
    if (still.status !== 0) cover = null;
  }

  /* attach onto the brief's PublishItems */
  const { collection } = await import("../../shared/src/store.js");
  const { attachFile } = await import("../../publish/src/center.js");
  const items = collection("publishitems").find((i) => i.briefId === briefId);
  const attached = [];
  for (const item of items) {
    const prof = PROFILES[item.platform === "youtube" ? "yt_short" : item.platform === "instagram" ? "ig_reel" : item.platform];
    if (!prof || !wanted.includes(item.platform === "youtube" ? "yt_short" : item.platform === "instagram" ? "ig_reel" : item.platform)) continue;
    const video = made[prof.comp];
    if (!video) continue;
    attachFile(item.id, video, "video");
    if (item.platform === "instagram" && cover) attachFile(item.id, cover, "thumb");
    attached.push(`${item.platform}<-${path.basename(video)}`);
  }
  if (!items.length) console.log(`\n(no PublishItems for this brief yet — "Send to Publish Center" first to auto-attach)`);
  else console.log(`\nattached: ${attached.join(", ") || "none (profiles/platforms mismatch)"}`);

  /* Push off-machine so the video is reachable when this laptop sleeps.
     Wrapped and non-throwing on purpose: ~10 minutes of CPU already went into
     this render, and a flaky network must not turn a finished video into a
     failed job. Silent when R2 is unconfigured. */
  const r2Files = [...Object.values(made), ...(cover ? [cover] : [])];
  try {
    const { pushRender, isConfigured } = await import("../../shared/src/r2.js");
    if (isConfigured()) {
      const r = await pushRender(props.id, r2Files);
      for (const u of r.uploaded) console.log(`  ↑ R2  ${path.basename(u.key)}  ${Math.round(u.bytes / 1024)}KB`);
      for (const f of r.failed) console.log(`  ✕ R2  ${f.file} — ${f.error}`);
      if (r.uploaded.length) console.log(`  download links: factory r2 url ${props.id}`);
    }
  } catch (e) {
    console.log(`  R2 push skipped: ${String(e.message).slice(0, 120)}`);
  }

  console.log(`\ndone -> ${outDir}`);
  console.log(`RESULT ${JSON.stringify({ id: props.id, briefId, seconds: Number(seconds), outputs: Object.values(made).map((m) => path.basename(m)), cover: Boolean(cover), attached })}`);
  return true;
}
