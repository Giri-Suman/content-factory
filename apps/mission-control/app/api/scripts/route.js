/**
 * Drafted scripts, read from R2.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";
import { listScripts } from "../../../lib/cloud.js";

export const runtime = "edge";

export async function GET() {
  const { env } = getRequestContext();
  return new Response(JSON.stringify({ scripts: await listScripts(env) }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
