import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "../../shared/src/config.js";
import { collection } from "../../shared/src/store.js";

/**
 * P24 CarouselRenderer + DiagramCard. HTML-to-image (system Chrome, zero
 * deps — same path as thumbnails.js). Carousel: 7 branded 1080x1350
 * slides + cover from the brief's ig_carousel payload. DiagramCard:
 * cheat-sheet card exported at 9:16 AND 2:3 (Pinterest).
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

function html(w, h, inner) {
  return `<!doctype html><html><head><meta charset="utf8"><style>
  *{margin:0;box-sizing:border-box;font-family:${FONT}}
  body{width:${w}px;height:${h}px;background:${BG};overflow:hidden;position:relative;color:#fff}
  .bar{position:absolute;top:0;left:0;height:8px;width:36%;background:${ACCENT}}
  .brand{position:absolute;bottom:28px;left:0;right:0;text-align:center;font-size:20px;letter-spacing:6px;color:#8b949e}
  </style></head><body>${inner}<div class="brand">CONTENT FACTORY</div></body></html>`;
}

function shoot(markup, w, h, outFile) {
  const chrome = findChrome();
  const htmlFile = outFile.replace(/\.png$/, ".html");
  writeFileSync(htmlFile, markup);
  if (chrome) {
    spawnSync(
      `"${chrome}" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=${w},${h} --screenshot="${outFile}" "file:///${htmlFile.replace(/\\/g, "/")}"`,
      { shell: true, timeout: 60000, windowsHide: true }
    );
  }
  if (!existsSync(outFile)) {
    spawnSync(`ffmpeg -y -f lavfi -i color=c=0x0d1117:s=${w}x${h} -frames:v 1 "${outFile}"`, { shell: true, timeout: 30000, windowsHide: true });
  }
  return existsSync(outFile);
}

/* ---------------- carousel ---------------- */

export function renderCarousel(briefId) {
  const brief = collection("briefs").get(briefId);
  if (!brief) throw new Error(`no brief ${briefId}`);
  const car = brief.payload?.ig_carousel;
  if (!car?.slides?.length) throw new Error("brief has no ig_carousel payload");

  const outDir = path.join(repoRoot, "renders", `brief-${briefId.slice(0, 10)}`, "carousel");
  mkdirSync(outDir, { recursive: true });
  const W = 1080, H = 1350;
  const files = [];

  // cover
  const cover = path.join(outDir, "00-cover.png");
  shoot(
    html(W, H, `<div class="bar"></div>
      <div style="display:flex;align-items:center;justify-content:center;height:100%;padding:0 80px;text-align:center">
        <div style="font-size:76px;font-weight:900;line-height:1.1">${car.cover_text || brief.topic}</div>
      </div>
      <div style="position:absolute;bottom:90px;right:70px;font-size:30px;color:${ACCENT};font-weight:700">swipe →</div>`),
    W, H, cover
  );
  files.push(cover);

  // 7 slides
  car.slides.slice(0, 7).forEach((slide, i) => {
    const f = path.join(outDir, `${String(i + 1).padStart(2, "0")}.png`);
    shoot(
      html(W, H, `<div class="bar"></div>
        <div style="position:absolute;top:60px;left:70px;font-size:120px;font-weight:900;color:${ACCENT};opacity:.35">${i + 1}</div>
        <div style="display:flex;align-items:center;height:100%;padding:0 80px">
          <div style="font-size:56px;font-weight:800;line-height:1.25">${slide}</div>
        </div>`),
      W, H, f
    );
    files.push(f);
  });

  // attach to the IG PublishItem
  const items = collection("publishitems").find((i) => i.briefId === briefId && i.platform === "instagram");
  for (const item of items) {
    collection("publishitems").update(item.id, { assets: { ...item.assets, carouselDir: outDir, carouselSlides: files.length } });
  }
  return { files, outDir };
}

/* ---------------- diagram card (9:16 + 2:3 Pinterest) ---------------- */

export function renderDiagramCard(briefId) {
  const brief = collection("briefs").get(briefId);
  if (!brief) throw new Error(`no brief ${briefId}`);
  const sections = brief.payload?.blog_outline?.h2_sections || brief.payload?.yt_short?.beats || [brief.topic];
  const outDir = path.join(repoRoot, "renders", `brief-${briefId.slice(0, 10)}`);
  mkdirSync(outDir, { recursive: true });

  const body = (W, H) =>
    html(W, H, `<div class="bar"></div>
      <div style="padding:100px 70px 0">
        <div style="font-size:54px;font-weight:900;margin-bottom:40px">${brief.topic.slice(0, 60)}</div>
        ${sections.slice(0, 6).map((s, i) => `
          <div style="display:flex;gap:20px;align-items:center;margin-bottom:26px">
            <div style="min-width:54px;height:54px;border-radius:12px;background:${ACCENT};color:#0d1117;font-weight:900;font-size:28px;display:flex;align-items:center;justify-content:center">${i + 1}</div>
            <div style="font-size:32px;font-weight:600">${String(s).slice(0, 60)}</div>
          </div>`).join("")}
      </div>`);

  const nine16 = path.join(outDir, "diagram-9x16.png");
  const pin = path.join(outDir, "diagram-pinterest-2x3.png");
  shoot(body(1080, 1920), 1080, 1920, nine16);
  shoot(body(1000, 1500), 1000, 1500, pin);
  return { nine16, pinterest: pin };
}
