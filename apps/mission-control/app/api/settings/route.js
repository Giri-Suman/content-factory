/**
 * Settings, composed for the cloud portal.
 *
 * THE FIRST PORT BROKE THIS PAGE COMPLETELY. It returned `{ ...config }` -
 * config's fields spread at the top level - but the page reads `d.config` and
 * bails with `if (!config || !env) return "loading…"`. So Settings sat on
 * "loading…" forever behind a 200, which is indistinguishable from a slow
 * network and shows up in no log.
 *
 * The shape below is the disk version's, rebuilt from three sources:
 *   config + collections   R2, pushed by `factory sync push`
 *   env                    state/envkeys.json - booleans, never key values
 *   tier tables            state/ui.json - packages/llm imports node:fs and so
 *                          cannot run at the edge; the laptop publishes it
 *
 * Remote writes go to the canonical R2 copy and carry the verified Access
 * identity. The sync layer refuses to overwrite a newer cloud edit.
 */

import { getEnv } from "@factory-env";
import { readCollection, readConfig, readEnvFlags, readUiMeta, writeConfig } from "../../../lib/cloud.js";
import { identityFromRequest } from "../../../lib/identity.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const MODULE_BUDGETS = {
  watchlist: 800, trending: 200, nicheHeat: 600, keywordGap: 2200,
  discovery: 500, wishlistTracking: 300, myChannel: 100, reserve: 1000,
};
const JOB_MODULE = {
  "yt-watchlist": "watchlist", "yt-trending": "trending", "yt-heat": "nicheHeat",
  "yt-kwgap": "keywordGap", "yt-discover": "discovery", "wishlist-track": "wishlistTracking",
  wishlist: "wishlistTracking", "my-channel": "myChannel", "yt-saturation": "reserve", publish: "reserve",
};

export const DEFAULT_WEIGHTS = { velocity: 1, crossSource: 1, nicheFit: 1, saturationGap: 1 };

function budgetDashboard(quotaRows) {
  const spent = Object.fromEntries(Object.keys(MODULE_BUDGETS).map((m) => [m, 0]));
  for (const r of quotaRows) spent[JOB_MODULE[r.job] || "reserve"] += Number(r.units) || 0;
  return Object.entries(MODULE_BUDGETS).map(([name, budget]) => ({
    name,
    budget,
    used: spent[name],
    remaining: budget - spent[name],
    pct: Math.round((spent[name] / budget) * 100),
  }));
}

export async function GET(request) {
  const env = getEnv();
  const [config, envKeys, ui, quota, jobruns, watchchannels] = await Promise.all([
    readConfig(env),
    readEnvFlags(env),
    readUiMeta(env),
    readCollection(env, "quota"),
    readCollection(env, "jobruns"),
    readCollection(env, "watchchannels"),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const todaysQuota = quota.filter((r) => r.date === today);

  return json({
    config: {
      ...config,
      youtubeKeywords: config.youtubeKeywords || [
        "ai automation", "claude code", "cursor ai", "n8n workflow", "python automation", "ai agents",
      ],
      scoreWeights: { ...(ui.weights || DEFAULT_WEIGHTS), ...(config.scoreWeights || {}) },
      availableHoursPerWeek: config.availableHoursPerWeek || 6,
    },
    env: envKeys,
    aiTiers: {
      assigned: { ...(ui.aiTiers?.defaults || {}), ...(config.aiTiers || {}) },
      tierMeta: ui.aiTiers?.tierMeta || {},
      availability: ui.aiTiers?.availability || [],
    },
    serviceTiers: {
      assigned: { ...(ui.serviceTiers?.defaults || {}), ...(config.serviceTiers || {}) },
      tierNames: ui.serviceTiers?.tierNames || [],
      services: ui.serviceTiers?.services || [],
    },
    language: config.language || "",
    edit: { ...(ui.editDefaults || {}), ...(config.edit || {}) },
    editOptions: ui.editOptions || [],
    languages: ui.languages || [],
    quotaToday: todaysQuota.reduce((a, r) => a + (Number(r.units) || 0), 0),
    budgets: budgetDashboard(todaysQuota),
    flags: { ...(ui.flags || {}), autoTune: config.autoTune !== false },
    jobruns: jobruns.slice(-30).reverse(),
    dailyProjection: (() => {
      // mirrors packages/radar estimateDailyUnits (routes never import factory packages)
      const kw = (config.youtubeKeywords || ["a", "b", "c", "d", "e", "f"]).length;
      const channels = watchchannels.length;
      const t = 96 + kw * 100 + Math.ceil((kw * 10) / 50) + channels * 2 + 15 * 101;
      return { total: t, channels, at300: t - channels * 2 + 600 };
    })(),
    readOnly: false,
    note: `Changes are saved to cloud state as ${identityFromRequest(request).email}.`,
  });
}

const boolMap = (value, allowed) => Object.fromEntries(
  Object.entries(value || {}).filter(([key, item]) => allowed.includes(key) && typeof item === "boolean")
);

function validatedPatch(body) {
  const out = {};
  if (body.categories) out.categories = boolMap(body.categories, ["coding", "ai", "math", "makeup"]);
  if (body.edit) out.edit = boolMap(body.edit, ["transitions", "punch", "denoise", "captions", "fillers", "retakes", "transcript"]);
  if (Array.isArray(body.youtubeKeywords)) {
    out.youtubeKeywords = body.youtubeKeywords.map((item) => String(item).trim().slice(0, 80)).filter(Boolean).slice(0, 12);
  }
  if (body.scoreWeights && typeof body.scoreWeights === "object") {
    out.scoreWeights = {};
    for (const key of ["velocity", "crossSource", "nicheFit", "saturationGap"]) {
      const value = Number(body.scoreWeights[key]);
      if (Number.isFinite(value)) out.scoreWeights[key] = Math.min(1.5, Math.max(0.5, value));
    }
  }
  if (body.availableHoursPerWeek !== undefined) {
    out.availableHoursPerWeek = Math.min(60, Math.max(1, Number(body.availableHoursPerWeek) || 1));
  }
  const tiers = new Set(["free", "cheap", "medium", "best"]);
  for (const field of ["aiTiers", "serviceTiers"]) {
    if (!body[field] || typeof body[field] !== "object") continue;
    out[field] = Object.fromEntries(Object.entries(body[field]).filter(([, value]) => tiers.has(String(value))));
  }
  if (body.language !== undefined) {
    const language = String(body.language).trim().toLowerCase();
    if (!/^[a-z]{0,8}(?:-[a-z0-9]{1,8})?$/.test(language)) throw new Error("invalid language code");
    out.language = language;
  }
  if (typeof body.autoTune === "boolean") out.autoTune = body.autoTune;
  if (typeof body.thumbnailTimedSwap === "boolean") out.thumbnailTimedSwap = body.thumbnailTimedSwap;
  if (!Object.keys(out).length) throw new Error("no supported settings supplied");
  return out;
}

export async function PUT(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  try {
    const patch = validatedPatch(body);
    const config = await writeConfig(env, patch, identityFromRequest(request).email);
    return json({ ok: true, config });
  } catch (error) {
    return json({ ok: false, error: error.message }, 400);
  }
}
