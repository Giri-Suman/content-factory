import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { readConfig, writeConfig, readEnvKeys, repoRoot } from "../../../lib/factory.js";

const os = (name) => {
  const p = path.join(repoRoot, "data", "os", `${name}.json`);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8")).rows || [];
  } catch {
    return [];
  }
};

export const DEFAULT_WEIGHTS = { velocity: 1, crossSource: 1, nicheFit: 1, saturationGap: 1 };

export async function GET() {
  const config = readConfig();
  const today = new Date().toISOString().slice(0, 10);
  return NextResponse.json({
    config: {
      ...config,
      youtubeKeywords: config.youtubeKeywords || ["ai automation", "claude code", "cursor ai", "n8n workflow", "python automation", "ai agents"],
      scoreWeights: { ...DEFAULT_WEIGHTS, ...(config.scoreWeights || {}) },
    },
    env: readEnvKeys(),
    quotaToday: os("quota").filter((r) => r.date === today).reduce((a, r) => a + r.units, 0),
    jobruns: os("jobruns").slice(-30).reverse(),
    dailyProjection: (() => {
      // mirrors packages/radar estimateDailyUnits (routes never import factory packages)
      const kw = (config.youtubeKeywords || ["a", "b", "c", "d", "e", "f"]).length;
      const channels = os("watchchannels").length;
      const t = 96 + kw * 100 + Math.ceil((kw * 10) / 50) + channels * 2 + 15 * 101;
      return { total: t, channels, at300: t - channels * 2 + 600 };
    })(),
  });
}

export async function PUT(request) {
  const body = await request.json();
  const config = readConfig();
  if (body.categories && typeof body.categories === "object") {
    for (const key of Object.keys(config.categories)) {
      if (typeof body.categories[key] === "boolean") config.categories[key] = body.categories[key];
    }
  }
  if (Array.isArray(body.youtubeKeywords)) {
    config.youtubeKeywords = body.youtubeKeywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean).slice(0, 12);
  }
  if (body.scoreWeights && typeof body.scoreWeights === "object") {
    config.scoreWeights = {};
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
      const v = Number(body.scoreWeights[k]);
      config.scoreWeights[k] = Number.isFinite(v) ? Math.max(0.5, Math.min(1.5, v)) : 1;
    }
  }
  writeConfig(config);
  return NextResponse.json({ ok: true, config });
}
