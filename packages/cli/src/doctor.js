import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnv, ensureDirs, paths, repoRoot } from "../../shared/src/config.js";
import { c } from "./colors.js";

/* ---------- probes ---------- */

function run(command) {
  try {
    const res = spawnSync(command, {
      shell: true,
      encoding: "utf8",
      timeout: 20000,
      windowsHide: true,
    });
    if (res.status === 0) {
      const firstLine = `${res.stdout || ""}\n${res.stderr || ""}`
        .trim()
        .split(/\r?\n/)[0]
        .slice(0, 70);
      return { ok: true, detail: firstLine };
    }
  } catch {
    /* fall through */
  }
  return { ok: false };
}

function binary(commands) {
  for (const cmd of commands) {
    const res = run(cmd);
    if (res.ok) return res;
  }
  return { ok: false };
}

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

/* ---------- check definitions ----------
   status: ok | fail (blocks P0 gate) | todo (user action, later phase)
           | pending (built by a later phase, nothing to do yet)          */

function nodeCheck() {
  const major = Number(process.versions.node.split(".")[0]);
  return major >= 20
    ? { status: "ok", detail: `v${process.versions.node}` }
    : { status: "fail", detail: `v${process.versions.node} — need >= 20`, hint: "winget install OpenJS.NodeJS.LTS" };
}

function binCheck(commands, hint, { later = false } = {}) {
  const res = binary(commands);
  if (res.ok) return { status: "ok", detail: res.detail };
  return { status: later ? "todo" : "fail", hint };
}

function pythonCheck() {
  for (const cmd of ["python --version", "py --version"]) {
    const res = run(cmd);
    if (res.ok) {
      const m = res.detail.match(/(\d+)\.(\d+)/);
      if (m && (Number(m[1]) > 3 || (Number(m[1]) === 3 && Number(m[2]) >= 10)))
        return { status: "ok", detail: res.detail };
      return { status: "todo", detail: `${res.detail} — need >= 3.10`, hint: "install from python.org (check 'Add to PATH')" };
    }
  }
  return { status: "todo", hint: "install Python 3.10+ from python.org (check 'Add to PATH')" };
}

function envCheck(key, { optional = false } = {}) {
  if (process.env[key]) return { status: "ok", detail: "set" };
  return {
    status: "todo",
    detail: optional ? "not set (optional)" : "not set",
    hint: `add ${key}= to .env`,
  };
}

function envFileCheck() {
  return existsSync(paths.env)
    ? { status: "ok", detail: ".env present" }
    : { status: "todo", hint: "copy .env.example to .env and fill keys as phases come online" };
}

function chromeCheck() {
  const found = CHROME_PATHS.find((p) => p && existsSync(p));
  return found
    ? { status: "ok", detail: path.basename(found) }
    : { status: "todo", hint: "install Chrome or Edge (Playwright captures + screenshots)" };
}

function pendingCheck(dir, phase) {
  return existsSync(path.join(repoRoot, dir))
    ? { status: "ok", detail: "present" }
    : { status: "pending", detail: `built in ${phase}` };
}

/* ---------- the report ---------- */

const GROUPS = [
  {
    phase: "P0",
    title: "Foundation gate (required now)",
    checks: [
      ["Node.js >= 20", nodeCheck],
      ["git", () => binCheck(["git --version"], "winget install Git.Git")],
      ["ffmpeg", () => binCheck(["ffmpeg -version"], "winget install Gyan.FFmpeg  (then reopen the terminal)")],
      ["ffprobe", () => binCheck(["ffprobe -version"], "ships with ffmpeg — same install")],
      [".env file", envFileCheck],
    ],
  },
  {
    phase: "P1",
    title: "Code Report renderer",
    checks: [
      ["Chrome / Edge", chromeCheck],
      ["ELEVENLABS_API_KEY", () => envCheck("ELEVENLABS_API_KEY")],
      ["ELEVENLABS_VOICE_ID (your clone)", () => envCheck("ELEVENLABS_VOICE_ID")],
      ["renderers/code-report (Remotion)", () => pendingCheck("renderers/code-report", "P1")],
    ],
  },
  {
    phase: "P2",
    title: "Trend Radar + Script Studio",
    checks: [
      ["ANTHROPIC_API_KEY", () => envCheck("ANTHROPIC_API_KEY")],
      ["TELEGRAM_BOT_TOKEN", () => envCheck("TELEGRAM_BOT_TOKEN", { optional: true })],
      ["TELEGRAM_CHAT_ID", () => envCheck("TELEGRAM_CHAT_ID", { optional: true })],
    ],
  },
  {
    phase: "P4",
    title: "Math engine + Shorts factory",
    checks: [
      ["Python >= 3.10", pythonCheck],
      ["Manim CE", () =>
        binCheck(
          [`"${path.join(repoRoot, ".venv", "Scripts", "python.exe")}" -m manim --version`, "manim --version", "python -m manim --version"],
          "node packages/cli/bin/factory.js math needs it — see README (installs into .venv)",
          { later: true }
        )],
    ],
  },
  {
    phase: "P6",
    title: "Auto-Editor (filmed footage — makeup channel)",
    checks: [
      ["whisper (footage captions)", () =>
        binCheck(
          [`"${path.join(repoRoot, ".venv", "Scripts", "whisper-ctranslate2.exe")}" --version`, "whisper-cli --help", "whisper --help"],
          ".venv\\Scripts\\pip install whisper-ctranslate2 (light, no torch)",
          { later: true }
        )],
    ],
  },
  {
    phase: "P5",
    title: "Publisher",
    checks: [
      ["YT_CLIENT_ID", () => envCheck("YT_CLIENT_ID")],
      ["YT_CLIENT_SECRET", () => envCheck("YT_CLIENT_SECRET")],
      ["YT_REFRESH_TOKEN", () => envCheck("YT_REFRESH_TOKEN")],
      ["FAL_KEY (thumbnails)", () => envCheck("FAL_KEY", { optional: true })],
    ],
  },
];

const ICON = {
  ok: c.green("+"),
  fail: c.red("x"),
  todo: c.yellow("o"),
  pending: c.dim("~"),
};

export async function doctor() {
  loadEnv();
  ensureDirs();

  console.log("");
  console.log(c.bold("content-factory doctor"));
  console.log(c.dim(`repo: ${repoRoot}`));

  let p0Failures = 0;
  let todos = 0;

  for (const group of GROUPS) {
    console.log("");
    console.log(`${c.cyan(group.phase)} ${c.bold(group.title)}`);
    for (const [label, fn] of group.checks) {
      const res = fn();
      if (res.status === "fail") p0Failures += 1;
      if (res.status === "todo") todos += 1;
      const detail = res.detail ? c.dim(` ${res.detail}`) : "";
      console.log(`  ${ICON[res.status]} ${label}${detail}`);
      if (res.hint && res.status !== "ok") {
        console.log(`      ${c.dim("->")} ${c.dim(res.hint)}`);
      }
    }
  }

  console.log("");
  if (p0Failures > 0) {
    console.log(c.red(c.bold(`P0 GATE: FAIL — ${p0Failures} required item(s) missing`)));
  } else {
    console.log(c.green(c.bold("P0 GATE: PASS")) + c.dim(` — ${todos} item(s) queued for later phases`));
  }
  console.log("");
  return p0Failures === 0;
}
