import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Server-side bridge between Mission Control and the factory. Reads the data
 * files directly and shells out to the tested CLI for actions — the dashboard
 * never reimplements pipeline logic.
 */

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const dataDir = path.join(repoRoot, "data");
export const scriptsDir = path.join(dataDir, "scripts");
export const rendersDir = path.join(repoRoot, "renders");
export const jobsDir = path.join(dataDir, "jobs");
const CLI = path.join(repoRoot, "packages", "cli", "bin", "factory.js");
const CONFIG_PATH = path.join(dataDir, "config.json");

const DEFAULT_CONFIG = { categories: { coding: true, ai: true, math: false, makeup: false } };

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function readTrends() {
  const store = readJson(path.join(dataDir, "trends.json"), { trends: {} });
  return Object.values(store.trends || {});
}

export function readConfig() {
  const cfg = readJson(CONFIG_PATH, null);
  if (!cfg) return structuredClone(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG, ...cfg, categories: { ...DEFAULT_CONFIG.categories, ...(cfg.categories || {}) } };
}

export function writeConfig(cfg) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  return cfg;
}

export function readEnvKeys() {
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
  };
}

/** Compliance report for a rendered id (delegates to the tested CLI). */
export async function compliance(id) {
  const safe = path.basename(String(id)).replace(/[^a-z0-9-]/gi, "");
  const { code, out } = await runCli(["compliance", safe, "--json"], 30000);
  const line = out.split(/\r?\n/).reverse().find((l) => l.startsWith("RESULT "));
  if (code !== 0 || !line) return { pass: false, checks: [{ id: "error", level: "fail", msg: out.slice(-300) || "compliance check failed" }] };
  return JSON.parse(line.slice(7));
}

/** Analytics performance snapshot (perf.json). */
export function readPerf() {
  return readJson(path.join(dataDir, "perf.json"), { weights: { coding: 1, ai: 1, math: 1, makeup: 1 }, updatedAt: null, videos: [] });
}

export function listScripts() {
  if (!existsSync(scriptsDir)) return [];
  return readdirSync(scriptsDir)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".meta.json"))
    .map((f) => {
      const id = f.replace(/\.json$/, "");
      const script = readJson(path.join(scriptsDir, f), {});
      const stat = statSync(path.join(scriptsDir, f));
      return {
        id,
        title: script.title || id,
        sceneTypes: (script.scenes || []).map((s) => s.type),
        mtime: stat.mtimeMs,
        rendered: existsSync(path.join(rendersDir, id)),
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export function listRenders() {
  if (!existsSync(rendersDir)) return [];
  return readdirSync(rendersDir)
    .filter((d) => statSync(path.join(rendersDir, d)).isDirectory())
    .map((id) => {
      const dir = path.join(rendersDir, id);
      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".mp4"))
        .map((f) => {
          const s = statSync(path.join(dir, f));
          return { name: f, size: s.size, mtime: s.mtimeMs };
        });
      return { id, files, mtime: Math.max(0, ...files.map((f) => f.mtime)) };
    })
    .filter((r) => r.files.length > 0)
    .sort((a, b) => b.mtime - a.mtime);
}

/* ---------- jobs: long-running CLI actions with live logs ---------- */

export function readJob(jobId) {
  return readJson(path.join(jobsDir, `${path.basename(jobId)}.json`), null);
}

export function listJobs() {
  if (!existsSync(jobsDir)) return [];
  return readdirSync(jobsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson(path.join(jobsDir, f), null))
    .filter(Boolean)
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    .slice(0, 20);
}

function saveJob(job) {
  mkdirSync(jobsDir, { recursive: true });
  writeFileSync(path.join(jobsDir, `${job.id}.json`), JSON.stringify(job, null, 2));
}

/** Spawn a factory CLI command as a tracked background job. */
export function startJob(type, args) {
  const id = `${type}-${Date.now().toString(36)}`;
  const job = { id, type, args, status: "running", startedAt: Date.now(), log: "" };
  saveJob(job);

  const child = spawn("node", [CLI, ...args], { cwd: repoRoot, windowsHide: true });
  const append = (chunk) => {
    job.log = (job.log + chunk.toString()).slice(-20000);
    saveJob(job);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("close", (code) => {
    job.status = code === 0 ? "done" : "failed";
    job.endedAt = Date.now();
    saveJob(job);
  });
  child.on("error", (err) => {
    job.status = "failed";
    job.log += `\nspawn error: ${err.message}`;
    job.endedAt = Date.now();
    saveJob(job);
  });
  return job;
}

/** Run a factory CLI command to completion (for fast actions). */
export function runCli(args, timeoutMs = 240000) {
  return new Promise((resolve) => {
    const child = spawn("node", [CLI, ...args], { cwd: repoRoot, windowsHide: true });
    let out = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (c) => (out += c.toString()));
    child.stderr.on("data", (c) => (out += c.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, out: `spawn error: ${err.message}` });
    });
  });
}
