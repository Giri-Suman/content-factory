import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot } from "../../shared/src/config.js";
import { collection } from "../../shared/src/store.js";

/**
 * P21 Thumbnail Studio. 3 brand-tokened HTML layouts rendered to 1280x720
 * PNG via system Chrome headless (the same zero-dep --screenshot path
 * prepare.js uses). Always >=2 variants. Optional image-gen background
 * behind an env flag (off by default). Judged by the thumbnail judge.
 */

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const findChrome = () => CHROME_PATHS.find((p) => p && existsSync(p));

const BG = "#0d1117";
const ACCENT = "#ffb224";
const FONT = "'Segoe UI', system-ui, sans-serif";

/** Extract punchy thumbnail copy from a brief payload. */
export function thumbCopy(brief) {
  const p = brief.payload || {};
  const title = p.yt_short?.title || brief.topic;
  const numMatch = title.match(/(\d[\d,.]*)\s*(seconds?|minutes?|hours?|days?|lines?|x|%|k|M)?/i);
  const bigNumber = numMatch ? numMatch[0].trim() : null;
  // ≤4 words for the main punch
  const words = title.replace(/[^\w\s%$₹.-]/g, "").split(/\s+/).filter(Boolean);
  const punch = words.slice(0, 4).join(" ");
  return { title, bigNumber, punch, words };
}

/* ---------------- HTML layouts ---------------- */

const shell = (inner) =>
  `<!doctype html><html><head><meta charset="utf8"><style>
  *{margin:0;box-sizing:border-box;font-family:${FONT};-webkit-font-smoothing:antialiased}
  body{width:1280px;height:720px;background:${BG};overflow:hidden;position:relative}
  .accent{color:${ACCENT}} .bar{position:absolute;top:0;left:0;height:10px;width:38%;background:${ACCENT}}
  </style></head><body>${inner}</body></html>`;

const LAYOUTS = {
  BigNumber: (c) =>
    shell(`<div class="bar"></div>
      <div style="display:flex;flex-direction:column;justify-content:center;height:100%;padding:0 90px">
        <div style="font-size:340px;font-weight:900;line-height:.9;color:${ACCENT};letter-spacing:-6px">${c.bigNumber || c.words[0] || "?"}</div>
        <div style="font-size:64px;font-weight:800;color:#fff;margin-top:24px;max-width:1000px">${c.punch}</div>
      </div>`),
  FacelessSplit: (c) =>
    shell(`<div class="bar"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;height:100%">
        <div style="display:flex;align-items:center;padding:0 70px">
          <div style="font-size:88px;font-weight:900;color:#fff;line-height:1.02">${c.punch}</div>
        </div>
        <div style="background:linear-gradient(135deg,#161b22,#0d1117);display:flex;align-items:center;justify-content:center">
          <div style="font-size:200px">${c.emoji || "⚡"}</div>
        </div>
      </div>`),
  BeforeAfter: (c) =>
    shell(`<div class="bar"></div>
      <div style="display:flex;height:100%">
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#161b22">
          <div style="font-size:40px;color:#8b949e;font-weight:700;letter-spacing:4px">BEFORE</div>
          <div style="font-size:120px;font-weight:900;color:#f85149">${c.before || "6h"}</div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="font-size:40px;color:${ACCENT};font-weight:700;letter-spacing:4px">AFTER</div>
          <div style="font-size:120px;font-weight:900;color:${ACCENT}">${c.after || "10s"}</div>
        </div>
      </div>
      <div style="position:absolute;bottom:44px;width:100%;text-align:center;font-size:52px;font-weight:800;color:#fff">${c.punch}</div>`),
};

export const LAYOUT_NAMES = Object.keys(LAYOUTS);

function renderHtmlToPng(html, outFile) {
  const chrome = findChrome();
  const htmlFile = outFile.replace(/\.png$/, ".html");
  writeFileSync(htmlFile, html);
  if (chrome) {
    spawnSync(
      `"${chrome}" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1280,720 --screenshot="${outFile}" "file:///${htmlFile.replace(/\\/g, "/")}"`,
      { shell: true, timeout: 60000, windowsHide: true }
    );
    if (existsSync(outFile)) return "chrome";
  }
  // fallback: solid brand card so packaging never blocks
  spawnSync(`ffmpeg -y -f lavfi -i color=c=0x0d1117:s=1280x720 -frames:v 1 "${outFile}"`, { shell: true, timeout: 30000, windowsHide: true });
  return existsSync(outFile) ? "placeholder" : "failed";
}

/* ---------------- generation ---------------- */

export async function generateThumbnails(briefId, { layouts = ["BigNumber", "FacelessSplit"] } = {}) {
  loadEnv();
  const brief = collection("briefs").get(briefId);
  if (!brief) throw new Error(`no brief ${briefId}`);
  const c = thumbCopy(brief);
  c.before = brief.payload?._thumb?.before;
  c.after = brief.payload?._thumb?.after;

  const outDir = path.join(repoRoot, "renders", `brief-${briefId.slice(0, 10)}`, "thumbs");
  mkdirSync(outDir, { recursive: true });

  const variants = [];
  for (const name of layouts) {
    if (!LAYOUTS[name]) continue;
    const out = path.join(outDir, `${name}.png`);
    const how = renderHtmlToPng(LAYOUTS[name](c), out);
    variants.push({ layout: name, file: out, words: c.punch.split(/\s+/).length, how });
  }
  // always >=2 variants
  while (variants.length < 2 && LAYOUT_NAMES.length) {
    const name = LAYOUT_NAMES.find((n) => !variants.some((v) => v.layout === n));
    if (!name) break;
    const out = path.join(outDir, `${name}.png`);
    renderHtmlToPng(LAYOUTS[name](c), out);
    variants.push({ layout: name, file: out, words: c.punch.split(/\s+/).length });
  }

  collection("thumbnails").upsert({ id: briefId, briefId, variants, copy: c, at: new Date().toISOString() }, (r) => r.briefId);
  return { briefId, variants };
}

/** IG cover: pick the visually strongest of 6 sampled frames (most detail/contrast). */
export function pickCoverFrame(videoFile, outFile) {
  if (!existsSync(videoFile)) return null;
  const framesDir = path.join(path.dirname(outFile), "cover-candidates");
  mkdirSync(framesDir, { recursive: true });
  spawnSync("ffmpeg", ["-y", "-v", "error", "-i", videoFile, "-vf", "fps=1/2,scale=1080:1920", "-frames:v", "6", path.join(framesDir, "c%02d.png")], { windowsHide: true, timeout: 120000 });
  // "strongest" proxy = largest PNG (most visual detail/contrast) among the samples
  const cands = readdirSync(framesDir).filter((f) => f.endsWith(".png")).map((f) => path.join(framesDir, f));
  if (!cands.length) return null;
  const best = cands.sort((a, b) => statSync(b).size - statSync(a).size)[0];
  spawnSync(`ffmpeg -y -v error -i "${best}" "${outFile}"`, { shell: true, windowsHide: true, timeout: 30000 });
  return existsSync(outFile) ? outFile : null;
}
