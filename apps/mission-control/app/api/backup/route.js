/**
 * Export the factory state as one JSON document.
 *
 * The disk version zipped data/. Workers has neither zip nor disk, so this
 * streams the collections that matter as a single JSON file - which is what the
 * backup was for: briefs, clusters and publish items, not regenerable build
 * artifacts.
 */

import { getEnv } from "@factory-env";
import { readCollection, readConfig } from "../../../lib/cloud.js";

export const runtime = "edge";

const COLLECTIONS = ["briefs", "clusters", "publishitems", "wishlist", "ideabank", "escalations", "costledger", "lessons"];

export async function GET() {
  const env = getEnv();
  const out = { exportedAt: new Date().toISOString(), config: await readConfig(env), collections: {} };
  for (const c of COLLECTIONS) out.collections[c] = await readCollection(env, c);
  return new Response(JSON.stringify(out, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="content-factory-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
