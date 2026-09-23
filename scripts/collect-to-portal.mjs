/** Run the scheduled radar against the same R2 state the family portal reads. */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { paths } from "../packages/shared/src/config.js";
import { isConfigured, presignGet } from "../packages/shared/src/r2.js";
import { pullState, pushState } from "../packages/shared/src/stateSync.js";
import { runRadar } from "../packages/radar/src/radar.js";

if (!isConfigured()) throw new Error("R2 credentials are required for scheduled collection");

const pulled = await pullState();
if (pulled.error) throw new Error(pulled.error);
console.log(`Restored ${pulled.written.length} changed portal state file(s)`);

// Trends are deliberately outside the state manifest, so restore the portal's
// current copy explicitly before collecting. Otherwise each fresh GitHub runner
// would rediscover everything from an empty trends.json on every run.
const response = await fetch(presignGet("state/trends.json", 300));
if (response.status !== 404 && !response.ok) {
  throw new Error(`Could not restore portal trends: HTTP ${response.status}`);
}
if (response.ok) {
  const file = path.join(paths.data, "trends.json");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  console.log("Restored portal trends");
} else {
  console.log("No portal trends yet; starting the first collection");
}

await runRadar({ github: true });

// Today reads clusters and jobruns from R2. Publish those before reporting the
// scheduled run as successful, along with the Trend Radar's trends.json copy.
const synced = await pushState();
const essential = new Set(["os/clusters.json", "os/jobruns.json"]);
const blocked = (synced.conflicts || []).filter((file) => essential.has(file));
if (blocked.length) {
  throw new Error(`Scheduled collection could not publish newer portal state: ${blocked.join(", ")}`);
}
console.log(`Published ${synced.pushed.length} changed state file(s) and portal trends`);
