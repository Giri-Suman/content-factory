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
 * Writes stay refused. The laptop owns data/config.json, and a cloud write
 * would be silently overwritten by the next `sync push`.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";
import { readCollection, readConfig, readEnvFlags, readUiMeta } from "../../../lib/cloud.js";

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

export async function GET() {
  const { env } = getRequestContext();
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
      availability: ui.aiTiers?.availability || {},
    },
    serviceTiers: {
      assigned: { ...(ui.serviceTiers?.defaults || {}), ...(config.serviceTiers || {}) },
      tierNames: ui.serviceTiers?.tierNames || {},
      services: ui.serviceTiers?.services || {},
    },
    language: config.language || "",
    edit: { ...(ui.editDefaults || {}), ...(config.edit || {}) },
    editOptions: ui.editOptions || {},
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
    readOnly: true,
    note: "Change settings on the laptop, then run `factory sync push`.",
  });
}

export async function PUT() {
  return json({ ok: false, error: "Settings are read-only from the cloud portal." }, 405);
}
