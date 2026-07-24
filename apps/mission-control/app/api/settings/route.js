import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { readConfig, writeConfig, readEnvKeys, repoRoot, envSet } from "../../../lib/factory.js";

const MODULE_BUDGETS = {
  watchlist: 800, trending: 200, nicheHeat: 600, keywordGap: 2200,
  discovery: 500, wishlistTracking: 300, myChannel: 100, reserve: 1000,
};
const JOB_MODULE = {
  "yt-watchlist": "watchlist", "yt-trending": "trending", "yt-heat": "nicheHeat",
  "yt-kwgap": "keywordGap", "yt-discover": "discovery", "wishlist-track": "wishlistTracking",
  wishlist: "wishlistTracking", "my-channel": "myChannel", "yt-saturation": "reserve", publish: "reserve",
};

function budgetDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const p = path.join(repoRoot, "data", "os", "quota.json");
  const rows = existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")).rows || []).filter((r) => r.date === today) : [];
  const spent = Object.fromEntries(Object.keys(MODULE_BUDGETS).map((m) => [m, 0]));
  for (const r of rows) spent[JOB_MODULE[r.job] || "reserve"] += r.units;
  return Object.entries(MODULE_BUDGETS).map(([name, budget]) => ({ name, budget, used: spent[name], remaining: budget - spent[name], pct: Math.round((spent[name] / budget) * 100) }));
}

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
      availableHoursPerWeek: config.availableHoursPerWeek || 6,
    },
    env: readEnvKeys(),
    aiTiers: {
      assigned: { score: "free", script: "budget", analysis: "free", ...(config.aiTiers || {}) },
      availability: [
        { tier: "free", options: [
          { label: "Ollama (local)", model: process.env.OLLAMA_MODEL || "llama3.2", ready: envSet("OLLAMA_MODEL") },
          { label: "OpenRouter :free", model: "llama-3.3-70b:free", ready: envSet("OPENROUTER_API_KEY") },
        ] },
        { tier: "budget", options: [
          { label: "OpenRouter budget", model: "gemini-2.0-flash", ready: envSet("OPENROUTER_API_KEY") },
          { label: "Claude Haiku", model: "claude-haiku-4-5", ready: envSet("ANTHROPIC_API_KEY") },
        ] },
        { tier: "premium", options: [
          { label: "Claude Sonnet 5", model: "claude-sonnet-5", ready: envSet("ANTHROPIC_API_KEY") },
          { label: "Sonnet via OpenRouter", model: "anthropic/claude-sonnet-5", ready: envSet("OPENROUTER_API_KEY") },
        ] },
      ].map((t) => ({ ...t, available: t.options.some((o) => o.ready) })),
    },
    quotaToday: os("quota").filter((r) => r.date === today).reduce((a, r) => a + r.units, 0),
    budgets: budgetDashboard(),
    flags: {
      publishMode: envSet("PUBLISH_MODE") ? "auto" : "staged",
      youtubeVerified: envSet("YOUTUBE_APP_VERIFIED"),
      metaReviewed: envSet("META_APP_REVIEWED"),
      autoTune: config.autoTune !== false,
    },
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
  if (typeof body.autoTune === "boolean") config.autoTune = body.autoTune;
  if (body.aiTiers && typeof body.aiTiers === "object") {
    const valid = ["free", "budget", "premium"];
    config.aiTiers = { ...(config.aiTiers || {}) };
    for (const task of ["score", "script", "analysis"]) {
      if (valid.includes(body.aiTiers[task])) config.aiTiers[task] = body.aiTiers[task];
    }
  }
  if (body.availableHoursPerWeek !== undefined) {
    const h = Number(body.availableHoursPerWeek);
    config.availableHoursPerWeek = Number.isFinite(h) ? Math.max(1, Math.min(60, h)) : 6;
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
