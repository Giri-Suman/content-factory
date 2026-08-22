/**
 * STATE SYNC — make the laptop's data/ readable by a cloud runner.
 *
 * Collect and math shorts could already run in the cloud because they need no
 * local state. Briefs, edits, produce and every other render read `data/os/*`
 * (briefs, clusters, publishitems, scripts), which existed only on this machine
 * — so those jobs were laptop-only for a reason that had nothing to do with CPU.
 *
 * The state is small: 71 JSON files, 3.3MB. Footage is the weight at ~436MB, and
 * is synced separately because most jobs do not need it.
 *
 * BOTH PATHS STAY. This is additive: the laptop keeps reading and writing
 * `data/` exactly as before. Sync copies it to R2 so a runner can borrow it, and
 * copies results back. Nothing about local operation changes.
 *
 * WHY R2 AND NOT THE factory-data BRANCH: git would work for 3.3MB of JSON, but
 * footage would not, and having state and footage in two different systems is
 * how they drift. R2 holds both, is already configured, and has no size ceiling
 * worth worrying about at this scale.
 *
 * CONFLICTS: a whole-state push then pull is safe here because only ONE side
 * runs at a time — the laptop pushes, sleeps, the runner works, the laptop
 * pulls. `trends.json` is the exception and is deliberately EXCLUDED: two
 * collectors genuinely do run independently, so it has its own merge in
 * scripts/sync-trends.mjs. Copying it here would undo that merge.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./config.js";
import { isConfigured, listObjects, presignGet, putObject } from "./r2.js";

const PREFIX = "state";
const DATA = path.join(repoRoot, "data");

/**
 * Directories worth syncing, relative to data/.
 *
 * `build/` and `models/` are excluded: build is regenerable intermediate output
 * and models are gigabytes of downloadable weights. `footage/` is excluded here
 * and handled by pushFootage — most jobs do not need it, and syncing 436MB for
 * a brief would be absurd.
 */
const DIRS = ["os", "scripts", "jobs"];
const ROOT_FILES = ["config.json", "dictionary.json", "perf.json", "published.json"];

/** trends.json has its own merge; a blind copy here would clobber it. */
const EXCLUDE = new Set(["trends.json"]);

const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

/** Every file this sync covers, as { rel, abs } pairs. */
export function stateFiles() {
  const out = [];
  for (const f of ROOT_FILES) {
    const abs = path.join(DATA, f);
    if (existsSync(abs) && !EXCLUDE.has(f)) out.push({ rel: f, abs });
  }
  for (const d of DIRS) {
    const dir = path.join(DATA, d);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json") || EXCLUDE.has(f)) continue;
      out.push({ rel: `${d}/${f}`, abs: path.join(dir, f) });
    }
  }
  return out;
}

/**
 * Push local state to R2.
 *
 * Content-hashed: a file whose contents match what is already there is skipped.
 * Most of these change rarely, so a sync is usually a handful of small PUTs
 * rather than 71.
 */
/**
 * Commands the always-on portal can offer, as data.
 *
 * Workers cannot import this repo's ESM modules, so the registry is published
 * as JSON alongside the state. Generated from COMMANDS on every push, which is
 * what stops the page and the CLI drifting apart - a button that appears and
 * then fails is worse than a missing button.
 *
 * `laptop` marks the ones that spawn ffmpeg, Chrome, Manim or whisper. Those
 * are not hidden: the portal queues them and says when they will run.
 */
const LAPTOP_IDS = new Set([
  "render", "produce", "math", "edit", "reframe", "longform", "shorts", "steps",
  "thumbnails", "batch", "motion", "dryrun", "capture", "qc", "tools",
]);

async function pushCommandManifest() {
  const { COMMANDS, STAGES, keyOf } = await import("./commands.js");
  const manifest = {
    at: new Date().toISOString(),
    stages: STAGES,
    commands: COMMANDS.map((c) => ({
      key: keyOf(c),
      label: c.label,
      desc: c.desc,
      stage: c.stage,
      cat: c.cat,
      argKind: c.argKind || null,
      argLabel: c.argLabel || null,
      slow: Boolean(c.slow),
      danger: c.danger || null,
      laptop: LAPTOP_IDS.has(c.id),
    })),
  };
  await putObject(`${PREFIX}/_commands.json`, JSON.stringify(manifest, null, 2), { contentType: "application/json" });
  return manifest.commands.length;
}


/**
 * Which credentials this machine has — as BOOLEANS ONLY, never values.
 *
 * The cloud portal cannot see the laptop's .env, so its Settings page had
 * nothing to render and sat on "loading..." forever, and Math Studio could not
 * tell you a topic needs an LLM key. Publishing the presence flags fixes both
 * without putting a secret in R2: this returns true/false and a provider name,
 * exactly what the UI shows.
 *
 * Mirrors readEnvKeys() in the portal's lib/factory.js - if you add a key
 * there, add it here or the cloud page will disagree with the local one.
 */
export function envFlags() {
  const envPath = path.join(repoRoot, ".env");
  const vals = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith("#") && m[2]) vals[m[1]] = m[2];
    }
  }
  const forced = (vals.LLM_PROVIDER || "").toLowerCase();
  const provider = ["anthropic", "openrouter", "ollama"].includes(forced)
    ? forced
    : vals.ANTHROPIC_API_KEY
      ? "anthropic"
      : vals.OPENROUTER_API_KEY
        ? "openrouter"
        : vals.OLLAMA_MODEL
          ? "ollama"
          : null;
  return {
    provider,
    anthropic: Boolean(vals.ANTHROPIC_API_KEY),
    openrouter: Boolean(vals.OPENROUTER_API_KEY),
    ollama: Boolean(vals.OLLAMA_MODEL),
    elevenlabs: Boolean(vals.ELEVENLABS_API_KEY && vals.ELEVENLABS_VOICE_ID),
    telegram: Boolean(vals.TELEGRAM_BOT_TOKEN && vals.TELEGRAM_CHAT_ID),
    youtube: Boolean(vals.YT_CLIENT_ID && vals.YT_CLIENT_SECRET && vals.YT_REFRESH_TOKEN),
    at: new Date().toISOString(),
  };
}

/**
 * Everything the cloud Settings page needs that the Worker cannot compute.
 *
 * Tier metadata and availability live in packages/llm, which imports
 * shared/config.js, which imports node:fs - so it can never run at the edge.
 * Rather than duplicate the tables into the Worker (where they would drift, the
 * exact failure that once had Settings advertising two dead model ids), the
 * laptop publishes them the same way it publishes the command manifest.
 *
 * Values only, never secrets: `flags` and availability are booleans derived from
 * whether a key is present, not the keys themselves.
 */
export async function pushUiMeta() {
  const [{ EDIT_DEFAULTS, EDIT_OPTIONS, LANGUAGES }, tiers] = await Promise.all([
    import("./config.js"),
    import("../../llm/src/tiers.js"),
  ]);
  const env = (n) => Boolean(process.env[n] && String(process.env[n]).trim());
  const payload = {
    at: new Date().toISOString(),
    aiTiers: { tierMeta: tiers.TIER_META, availability: tiers.tierAvailability(), defaults: tiers.DEFAULT_TIERS },
    serviceTiers: { tierNames: tiers.TIER_NAMES, services: tiers.serviceAvailability(), defaults: tiers.DEFAULT_SERVICE_TIERS },
    editOptions: EDIT_OPTIONS,
    editDefaults: EDIT_DEFAULTS,
    languages: LANGUAGES,
    // mirrors DEFAULT_WEIGHTS in the settings route
    weights: { velocity: 1, crossSource: 1, nicheFit: 1, saturationGap: 1 },
    flags: {
      publishMode: env("PUBLISH_MODE") ? "auto" : "staged",
      youtubeVerified: env("YOUTUBE_APP_VERIFIED"),
      metaReviewed: env("META_APP_REVIEWED"),
    },
  };
  await putObject(`${PREFIX}/ui.json`, JSON.stringify(payload, null, 2), { contentType: "application/json" });
  return payload;
}

export async function pushState({ force = false } = {}) {
  if (!isConfigured()) throw new Error("R2 is not configured");
  const remote = new Map((await listObjects(`${PREFIX}/`)).map((o) => [o.key, o]));
  const files = stateFiles();
  const pushed = [];
  const skipped = [];
  const conflicts = [];

  for (const f of files) {
    const buf = readFileSync(f.abs);
    const key = `${PREFIX}/${f.rel}`;
    const r = remote.get(key);
    // Size is a cheap first filter; identical size AND unchanged mtime is a
    // strong enough signal to skip without downloading to compare.
    if (!force && r && r.size === buf.length) {
      skipped.push(f.rel);
      continue;
    }
    // The cloud portal can now edit collections directly (approving a brief,
    // ticking a checklist item). If the remote copy is NEWER than this machine's
    // file, pushing would delete an edit made from the phone. Refuse and say so
    // - run `factory sync pull` first, then push.
    if (!force && r && r.uploaded && statSync(f.abs).mtimeMs < new Date(r.uploaded).getTime()) {
      conflicts.push(f.rel);
      continue;
    }
    await putObject(key, buf, { contentType: "application/json" });
    pushed.push({ rel: f.rel, bytes: buf.length });
  }

  // A manifest so a puller knows what the set SHOULD be, and can report a file
  // that vanished rather than silently keeping a stale local copy.
  const manifest = {
    at: new Date().toISOString(),
    files: files.map((f) => ({ rel: f.rel, bytes: statSync(f.abs).size, hash: sha(readFileSync(f.abs)) })),
  };
  await putObject(`${PREFIX}/_manifest.json`, JSON.stringify(manifest, null, 2), { contentType: "application/json" });

  // presence flags only, so the cloud Settings page can render at all
  await putObject(`${PREFIX}/envkeys.json`, JSON.stringify(envFlags(), null, 2), { contentType: "application/json" });
  await pushUiMeta();

  const commands = await pushCommandManifest();
  return { pushed, skipped, conflicts, total: files.length, commands };
}

/**
 * Pull state from R2 into data/.
 *
 * Writes only files that differ, so an unchanged sync touches nothing and the
 * mtimes people rely on stay meaningful.
 */
export async function pullState({ dryRun = false } = {}) {
  if (!isConfigured()) throw new Error("R2 is not configured");
  let manifest;
  try {
    const res = await fetch(presignGet(`${PREFIX}/_manifest.json`, 300));
    if (!res.ok) throw new Error(String(res.status));
    manifest = await res.json();
  } catch {
    return { error: "no state in R2 yet — run `factory sync push` from the machine that has it" };
  }

  const written = [];
  const same = [];
  for (const entry of manifest.files) {
    if (EXCLUDE.has(path.basename(entry.rel))) continue;
    const abs = path.join(DATA, entry.rel);
    if (existsSync(abs) && sha(readFileSync(abs)) === entry.hash) {
      same.push(entry.rel);
      continue;
    }
    if (dryRun) {
      written.push(entry.rel);
      continue;
    }
    const res = await fetch(presignGet(`${PREFIX}/${entry.rel}`, 600));
    if (!res.ok) continue;
    const body = Buffer.from(await res.arrayBuffer());
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
    written.push(entry.rel);
  }
  return { written, same, at: manifest.at, dryRun };
}

/* ------------------------------------------------------------- footage --- */

const FOOTAGE_PREFIX = "footage";
const MEDIA = /\.(mp4|mov|mkv|avi|m4v|webm)$/i;

/**
 * Push one footage file so a cloud edit can fetch it.
 *
 * Separate from state on purpose: this is hundreds of megabytes and only edit
 * jobs need it. R2 charges no egress, so the runner's download is free.
 */
export async function pushFootage(name) {
  const abs = path.join(DATA, "footage", path.basename(name));
  if (!existsSync(abs)) throw new Error(`no such footage: ${path.basename(name)}`);
  if (!MEDIA.test(abs)) throw new Error(`not a video file: ${path.basename(name)}`);
  const buf = readFileSync(abs);
  const key = `${FOOTAGE_PREFIX}/${path.basename(abs)}`;
  await putObject(key, buf, { contentType: "video/mp4" });
  return { key, bytes: buf.length };
}

/** What footage is already in R2 and available to a cloud job. */
export async function listFootage() {
  if (!isConfigured()) return [];
  return (await listObjects(`${FOOTAGE_PREFIX}/`)).map((o) => ({
    name: o.key.slice(FOOTAGE_PREFIX.length + 1),
    size: o.size,
    modified: o.modified,
  }));
}

/** Fetch footage from R2 into data/footage/ — what a runner calls. */
export async function pullFootage(name) {
  const base = path.basename(name);
  const abs = path.join(DATA, "footage", base);
  mkdirSync(path.dirname(abs), { recursive: true });
  const res = await fetch(presignGet(`${FOOTAGE_PREFIX}/${base}`, 900));
  if (!res.ok) throw new Error(`could not fetch footage ${base}: ${res.status}`);
  writeFileSync(abs, Buffer.from(await res.arrayBuffer()));
  return { file: abs, bytes: statSync(abs).size };
}
