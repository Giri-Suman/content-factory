/**
 * LOCAL RUNNER — the thing that makes the portal feel instant on this machine.
 *
 * The portal's routes run on the Workers runtime whether they are deployed or
 * served by `wrangler pages dev`, and a Worker cannot spawn a process. So every
 * action queued, and the page reloaded its data before the work had happened:
 * press "Refresh now", get "queued", watch the page redraw exactly what it
 * already showed. Correct, and useless.
 *
 * A Worker CAN make an outbound fetch to 127.0.0.1 (measured before building
 * this). So when the portal is being used from this laptop, it forwards the
 * command here, this runs it to completion, and the route answers with the real
 * output - the page then reloads and shows the new data. Remote requests still
 * queue, because there is nothing to forward to.
 *
 * SLOW COMMANDS ARE REFUSED ON PURPOSE. An 11-minute Manim render cannot be an
 * HTTP request anybody waits on. Those keep going through the queue, where the
 * watcher starts them in seconds and the page polls the job. The registry
 * already marks which is which with `slow`.
 *
 * SAFETY: this listens on the loopback interface ONLY and accepts a registry
 * KEY, never a command line - argv is rebuilt here from the key, exactly as the
 * queue drain does. Anything that can reach this port can already run commands
 * on this machine.
 */

import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { repoRoot } from "../../shared/src/config.js";
import { COMMANDS, argvFor, keyOf } from "../../shared/src/commands.js";

const CLI = path.join(repoRoot, "packages", "cli", "bin", "factory.js");
export const RUNNER_PORT = Number(process.env.FACTORY_RUNNER_PORT || 4699);

/** Long enough for the slowest "fast" command, short enough to not hang a tab. */
const TIMEOUT_MS = 1000 * 60 * 4;

function execute(key, input) {
  const row = COMMANDS.find((c) => keyOf(c) === key);
  if (!row) return { ok: false, out: `unknown command "${key}"`, status: 400 };
  if (row.slow) {
    // the caller should queue this one; say so rather than blocking a request
    return { ok: false, slow: true, out: `"${row.label}" is a long job - queued instead`, status: 409 };
  }

  let argv;
  try {
    argv = argvFor(row, input || undefined);
  } catch (e) {
    return { ok: false, out: e.message, status: 400 };
  }

  const started = Date.now();
  const res = spawnSync(process.execPath, [CLI, ...argv], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
  const mins = ((Date.now() - started) / 60000).toFixed(1);
  const text = `${res.stdout || ""}${res.stderr || ""}`.trim();
  process.stdout.write(`  ${key}${input ? ` ${input}` : ""} -> ${res.status === 0 ? "ok" : "FAILED"} in ${mins}m\n`);

  if (res.error) return { ok: false, out: `${res.error.message} (after ${mins}m)`, status: 500 };
  return {
    ok: res.status === 0,
    // the last lines are what a person reads under the button
    out: text.split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean).slice(-25).join("\n") || `done in ${mins}m`,
    ms: Date.now() - started,
    status: res.status === 0 ? 200 : 500,
  };
}

export async function runner(argv = []) {
  const port = Number((argv.find((a) => a.startsWith("--port=")) || "").split("=")[1]) || RUNNER_PORT;

  const server = createServer((req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };

    if (req.method === "GET" && req.url.startsWith("/health")) return send(200, { ok: true, runner: true });
    if (req.method !== "POST" || !req.url.startsWith("/run")) return send(404, { ok: false, out: "not found" });

    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > 10000) req.destroy(); // a command is a key and a short input
    });
    req.on("end", () => {
      let parsed;
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        return send(400, { ok: false, out: "bad json" });
      }
      const result = execute(String(parsed.key || ""), String(parsed.input || "").trim());
      send(result.status || 200, result);
    });
  });

  // loopback ONLY - this executes commands, it must never be reachable off-box
  server.listen(port, "127.0.0.1", () => {
    console.log(`\n  local runner on http://127.0.0.1:${port} — the portal runs fast commands here`);
    console.log(`  long jobs still go through the queue. Ctrl-C to stop.\n`);
  });
  return new Promise(() => {});
}
