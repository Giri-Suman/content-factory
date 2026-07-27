import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot } from "../../shared/src/config.js";

/**
 * Step callouts ("Step 2 of 5 — blend the crease") burned onto real footage.
 *
 * Design note: these are PNG overlays composited with ffmpeg, NOT a new
 * Remotion composition. Two reasons that's the better call:
 *   1. zero risk to the existing render path — nothing in Remotion changes.
 *   2. it works on CAPTURED footage, which Remotion never touches — and
 *      captured tutorials (makeup, nails, cooking, fitness) are exactly
 *      where step callouts earn their keep.
 *
 * Also emits a product/tool list card, the other thing every tutorial needs.
 */

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const findChrome = () => CHROME_PATHS.find((p) => p && existsSync(p));

const ACCENT = "#ffb224";
const FONT = "'Segoe UI', system-ui, sans-serif";

/** Transparent PNG so it can sit over footage without a background box. */
function cardHtml(inner, w, h) {
  return `<!doctype html><html><head><meta charset="utf8"><style>
  *{margin:0;box-sizing:border-box;font-family:${FONT}}
  html,body{width:${w}px;height:${h}px;background:transparent;overflow:hidden}
  </style></head><body>${inner}</body></html>`;
}

function shoot(html, w, h, out) {
  const chrome = findChrome();
  const htmlFile = out.replace(/\.png$/, ".html");
  writeFileSync(htmlFile, html);
  if (chrome) {
    spawnSync(
      `"${chrome}" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 --force-device-scale-factor=1 --window-size=${w},${h} --screenshot="${out}" "file:///${htmlFile.replace(/\\/g, "/")}"`,
      { shell: true, timeout: 60000, windowsHide: true }
    );
  }
  return existsSync(out);
}

/** One step chip: "STEP 2/5" + the instruction. Sized for 1080-wide vertical. */
export function stepCard(n, total, text, out, { w = 1080, h = 260 } = {}) {
  const html = cardHtml(
    `<div style="display:flex;flex-direction:column;justify-content:flex-end;height:100%;padding:0 60px 40px">
      <div style="display:inline-flex;align-items:center;gap:14px;margin-bottom:14px">
        <span style="background:${ACCENT};color:#0d1117;font-weight:900;font-size:30px;padding:8px 18px;border-radius:10px;letter-spacing:1px">STEP ${n}/${total}</span>
      </div>
      <div style="font-size:52px;font-weight:800;color:#fff;line-height:1.15;text-shadow:0 3px 18px rgba(0,0,0,.95),0 0 4px rgba(0,0,0,.9)">${text}</div>
    </div>`,
    w,
    h
  );
  return shoot(html, w, h, out);
}

/** The product / tool / ingredient list card. */
export function listCard(title, items, out, { w = 1080, h = 1200 } = {}) {
  const html = cardHtml(
    `<div style="height:100%;padding:80px 70px;display:flex;flex-direction:column;justify-content:center">
      <div style="font-size:46px;font-weight:900;color:${ACCENT};margin-bottom:34px">${title}</div>
      ${items
        .slice(0, 8)
        .map(
          (it) =>
            `<div style="display:flex;gap:18px;align-items:center;margin-bottom:22px">
          <div style="width:14px;height:14px;border-radius:4px;background:${ACCENT};flex:none"></div>
          <div style="font-size:40px;font-weight:700;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.9)">${it}</div>
        </div>`
        )
        .join("")}
    </div>`,
    w,
    h
  );
  return shoot(html, w, h, out);
}

/**
 * Burn step callouts onto a video. `steps` = [{ at, dur, text }] in seconds.
 * One ffmpeg pass with a chained overlay per step, each gated by `enable`
 * so they appear and disappear on schedule.
 */
export async function burnSteps(argv = []) {
  loadEnv();
  const args = argv.filter((a) => !a.startsWith("--"));
  const file = args[0];
  if (!file || !existsSync(file)) {
    console.error('usage: factory steps <video.mp4> "at:text" "at:text" ...');
    console.error('  e.g. factory steps clip.mp4 "0:prep the lid" "6:blend the crease" "14:set with powder"');
    return false;
  }
  const specs = args.slice(1).map((s) => {
    const i = s.indexOf(":");
    return { at: Number(s.slice(0, i)) || 0, text: s.slice(i + 1).trim() };
  }).filter((s) => s.text);
  if (!specs.length) {
    console.error("no steps given — pass at least one \"seconds:text\"");
    return false;
  }
  // each step runs until the next one starts (or 4s for the last)
  const steps = specs.map((s, i) => ({ ...s, n: i + 1, dur: specs[i + 1] ? specs[i + 1].at - s.at : 4 }));

  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8", windowsHide: true });
  const [vw, vh] = (probe.stdout || "1080,1920").trim().split(",").map(Number);
  if (!vw) {
    console.error(`can't read video dimensions of ${file}`);
    return false;
  }

  const workDir = path.join(repoRoot, "data", "build", "stepcards");
  mkdirSync(workDir, { recursive: true });
  const cardH = Math.round(vh * 0.16);

  console.log(`\nrendering ${steps.length} step card(s) at ${vw}x${cardH}...`);
  const cards = [];
  for (const s of steps) {
    const out = path.join(workDir, `step-${s.n}.png`);
    if (!stepCard(s.n, steps.length, s.text, out, { w: vw, h: cardH })) {
      console.error(`  card ${s.n} failed — is Chrome installed? (needed for HTML->PNG)`);
      return false;
    }
    cards.push({ ...s, file: out });
  }

  // build the overlay chain: [base][card1] -> ... each enabled in its window
  const inputs = ["-i", file, ...cards.flatMap((c) => ["-i", c.file])];
  const chain = cards
    .map((c, i) => {
      const src = i === 0 ? "[0:v]" : `[v${i}]`;
      const dst = i === cards.length - 1 ? "[out]" : `[v${i + 1}]`;
      const y = vh - cardH;
      return `${src}[${i + 1}:v]overlay=0:${y}:enable='between(t,${c.at},${c.at + c.dur})'${dst}`;
    })
    .join(";");

  const outFile = path.join(repoRoot, "renders", "stepped", `${path.basename(file, path.extname(file))}-steps.mp4`);
  mkdirSync(path.dirname(outFile), { recursive: true });

  console.log(`burning onto ${path.basename(file)}...`);
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-v", "error", ...inputs, "-filter_complex", chain, "-map", "[out]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-c:a", "copy", outFile],
    { encoding: "utf8", windowsHide: true, timeout: 1000 * 60 * 20 }
  );
  if (r.status !== 0 || !existsSync(outFile)) {
    console.error(`burn FAILED: ${(r.stderr || "").slice(-300)}`);
    return false;
  }
  for (const s of steps) console.log(`  ${String(s.at).padStart(4)}s-${s.at + s.dur}s  step ${s.n}/${steps.length}: ${s.text}`);
  console.log(`\ndone -> ${path.relative(repoRoot, outFile)}\n`);
  console.log(`RESULT ${JSON.stringify({ out: outFile, steps: steps.length })}`);
  return true;
}
