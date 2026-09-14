/**
 * The portal locally, with its actions actually doing something.
 *
 * THE PROBLEM THIS SOLVES: the portal's routes run on the Workers runtime, and
 * a Worker cannot spawn ffmpeg. So every action button writes a queue record
 * and returns - correct for the deployed portal, which has no machine to run
 * on, and infuriating on the laptop, where the machine is right here. Click
 * "Ingest my channel", get "queued", watch nothing happen, conclude the button
 * is broken. It is not broken; nobody was listening.
 *
 * So running the portal starts the listener too. Two processes, one command:
 *
 *   wrangler pages dev   the real Workers runtime, real R2 binding, real routes
 *   factory queue watch  claims queued work within ~3s and runs it here
 *
 * The queue does not disappear - it is what carries a request from the browser
 * to a process that has ffmpeg - but it stops being something you wait on. From
 * the page it reads as "Starting on the laptop now…" and then runs.
 *
 * Ctrl-C stops both. If the watcher dies the portal stays up, because a portal
 * you can still read is better than no portal, and the reason is printed rather
 * than left as silence.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(app, "..", "..");
const PORT = process.env.PORT || "4700";

const children = [];
/**
 * `shell` is per-child on purpose. npx needs one on Windows (it is a .cmd), but
 * node.exe must NOT have one: its path is "C:\Program Files\nodejs\node.exe" and
 * the shell splits it at the space, so the watcher died on startup with
 * "'C:\Program' is not recognized".
 */
const start = (name, cmd, args, cwd, shell = false) => {
  const c = spawn(cmd, args, { cwd, shell, stdio: ["ignore", "pipe", "pipe"] });
  const tag = (buf) =>
    String(buf)
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => `[${name}] ${l}`)
      .join("\n");
  c.stdout.on("data", (b) => console.log(tag(b)));
  c.stderr.on("data", (b) => console.error(tag(b)));
  c.on("exit", (code) => {
    if (name === "portal") {
      console.log(`\n[portal] exited (${code}) — stopping the watcher too`);
      stopAll();
      process.exit(code ?? 0);
    } else {
      console.error(`\n[watch] exited (${code}). The portal is still up, but queued actions`);
      console.error(`[watch] will NOT run until you restart. Reason should be above.`);
    }
  });
  children.push(c);
  return c;
};

const stopAll = () => {
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* already gone */
    }
  }
};

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log("\nstopping…");
    stopAll();
    process.exit(0);
  });
}

console.log(`
  Mission Control (local)   http://127.0.0.1:${PORT}
  No password here - Pages secrets do not exist locally, so the gate is off.
  Fast actions run here and return their output immediately.
  Long jobs (renders) queue and start within ~3s. Ctrl-C stops everything.
`);

start("portal", "npx", ["wrangler", "pages", "dev", "--port", PORT, "--ip", "127.0.0.1"], app, true);
const cli = path.join(root, "packages", "cli", "bin", "factory.js");
/* The runner is what makes a click feel instant: the portal forwards fast
   commands to it over loopback and answers with the real output, so the page's
   reload shows new data. The watcher stays for the long jobs it refuses, and
   for anything queued from a browser somewhere else. */
start("runner", process.execPath, [cli, "runner"], root);
start("watch", process.execPath, [cli, "queue", "watch", "--every=3"], root);
