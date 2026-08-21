/**
 * Spend so far, from the cost ledger.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";
export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

import { readCollection, readConfig } from "../../../lib/cloud.js";

export async function GET() {
  const { env } = getRequestContext();
  const [rows, config] = await Promise.all([readCollection(env, "costledger"), readConfig(env)]);
  const total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  return json({ entries: rows.slice(-200).reverse(), total, budgets: config.budgets || [] });
}
