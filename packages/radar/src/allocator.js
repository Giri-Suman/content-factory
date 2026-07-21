import { collection } from "../../shared/src/store.js";

/**
 * P16 central quota allocator. Every YouTube call is tagged with a job
 * name; each job maps to a module with a daily unit budget. A call is
 * granted only if the module's spend-so-far + cost stays within budget;
 * publishing/uploads and anything unmapped draw from a shared reserve.
 * Jobs degrade gracefully (skip + warn) when a module is exhausted —
 * they never silently fail.
 */

export const MODULE_BUDGETS = {
  watchlist: 800,
  trending: 200,
  nicheHeat: 600,
  keywordGap: 2200,
  discovery: 500,
  wishlistTracking: 300,
  myChannel: 100,
  reserve: 1000, // publishing (1600/upload) + saturation + anything unmapped
};

/** job tag -> module. Unmapped jobs fall through to reserve. */
const JOB_MODULE = {
  "yt-watchlist": "watchlist",
  "yt-trending": "trending",
  "yt-heat": "nicheHeat",
  "yt-kwgap": "keywordGap",
  "yt-discover": "discovery",
  "wishlist-track": "wishlistTracking",
  "wishlist": "wishlistTracking",
  "my-channel": "myChannel",
  "yt-saturation": "reserve",
  publish: "reserve",
};

export const moduleForJob = (job) => JOB_MODULE[job] || "reserve";

const today = () => new Date().toISOString().slice(0, 10);

/** Units already spent per module today, from the quota ledger. */
export function spentByModule() {
  const rows = collection("quota").find((r) => r.date === today());
  const out = Object.fromEntries(Object.keys(MODULE_BUDGETS).map((m) => [m, 0]));
  for (const r of rows) out[moduleForJob(r.job)] += r.units;
  return out;
}

/**
 * Can `job` spend `units` right now? Honors a per-run global cap too
 * (YT_DAILY_UNIT_CAP) as a backstop. Returns {ok, module, remaining, reason?}.
 */
export function canSpend(job, units) {
  const module = moduleForJob(job);
  const spent = spentByModule();
  const budget = MODULE_BUDGETS[module];
  const remaining = budget - spent[module];

  const totalSpent = Object.values(spent).reduce((a, b) => a + b, 0);
  const globalCap = parseInt(process.env.YT_DAILY_UNIT_CAP || "8000", 10);

  if (totalSpent + units > globalCap) {
    return { ok: false, module, remaining, reason: `global daily cap ${globalCap} reached` };
  }
  if (units > remaining) {
    return { ok: false, module, remaining, reason: `${module} budget exhausted (${remaining}/${budget} left)` };
  }
  return { ok: true, module, remaining: remaining - units };
}

/** Dashboard view: used / budget / remaining per module. */
export function budgetDashboard() {
  const spent = spentByModule();
  const modules = Object.entries(MODULE_BUDGETS).map(([name, budget]) => ({
    name,
    budget,
    used: spent[name],
    remaining: budget - spent[name],
    pct: Math.round((spent[name] / budget) * 100),
  }));
  const totalBudget = Object.values(MODULE_BUDGETS).reduce((a, b) => a + b, 0);
  const totalUsed = Object.values(spent).reduce((a, b) => a + b, 0);
  return { modules, totalBudget, totalUsed, globalCap: parseInt(process.env.YT_DAILY_UNIT_CAP || "8000", 10) };
}
