/**
 * Drafted scripts, read from R2.
 */

import { getEnv } from "@factory-env";
import { listScripts } from "../../../lib/cloud.js";

export const runtime = "edge";

export async function GET() {
  const env = getEnv();
  return new Response(JSON.stringify({ scripts: await listScripts(env) }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
