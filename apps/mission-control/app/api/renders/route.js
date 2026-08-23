/**
 * Finished videos — listed from R2 instead of a local directory.
 *
 * This is why renders are visible from anywhere: the list no longer describes
 * one machine's disk, it describes the bucket both machines push to.
 */

import { getEnv } from "@factory-env";
import { listRenders } from "../../../lib/cloud.js";

export const runtime = process.env.FACTORY_TARGET === "pages" ? "edge" : "nodejs";

export async function GET() {
  const env = getEnv();
  return new Response(JSON.stringify({ renders: await listRenders(env) }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
