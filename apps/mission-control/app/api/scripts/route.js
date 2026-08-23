/**
 * Drafted scripts, read from R2.
 */

import { getEnv } from "@factory-env";
import { listScripts } from "../../../lib/cloud.js";

export const runtime = process.env.FACTORY_TARGET === "pages" ? "edge" : "nodejs";

export async function GET() {
  const env = getEnv();
  return new Response(JSON.stringify({ scripts: await listScripts(env) }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
