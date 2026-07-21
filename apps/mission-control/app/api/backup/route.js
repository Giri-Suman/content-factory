import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { repoRoot } from "../../../lib/factory.js";

// GET -> one JSON bundle of all OS state + config (the "SQLite export" analog)
export async function GET() {
  const bundle = { exportedAt: new Date().toISOString(), config: null, collections: {} };

  const cfg = path.join(repoRoot, "data", "config.json");
  if (existsSync(cfg)) {
    try {
      bundle.config = JSON.parse(readFileSync(cfg, "utf8"));
    } catch {
      /* skip */
    }
  }

  const osDir = path.join(repoRoot, "data", "os");
  if (existsSync(osDir)) {
    for (const f of readdirSync(osDir).filter((f) => f.endsWith(".json"))) {
      try {
        bundle.collections[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(path.join(osDir, f), "utf8")).rows || [];
      } catch {
        /* skip corrupt */
      }
    }
  }

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="content-os-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
