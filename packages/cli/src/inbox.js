/**
 * `factory inbox` — drop big footage on disk instead of uploading it.
 *
 * WHY: the portal's upload path streams through a browser, and a 300MB+ capture
 * over a home connection takes longer than the edit itself. Copying the file
 * into a folder — over the network, from a USB stick, or straight off the
 * camera — moves the same bytes without a browser in the middle, and the laptop
 * already has to be awake to do the work anyway.
 *
 * This is deliberately the SAME folder the portal uploads into, so both routes
 * converge and nothing has to know which was used.
 *
 * SAFETY: queueing takes a BASENAME, never a path. It is resolved inside the
 * inbox and the result must still be inside the inbox — otherwise "../../.env"
 * becomes a way to point the pipeline at anything on disk.
 */

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { repoRoot } from "../../shared/src/config.js";
import { enqueue } from "../../shared/src/queue.js";

export const INBOX = path.join(repoRoot, "data", "footage");
const MEDIA = /\.(mp4|mov|mkv|avi|m4v|webm)$/i;

const mb = (n) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)}GB` : `${(n / 1048576).toFixed(0)}MB`);
const pad = (s, n) => String(s).padEnd(n);

/** Resolve a user-supplied name safely inside the inbox. Throws on escape. */
export function resolveInInbox(name) {
  const base = path.basename(String(name || ""));
  if (!base || base !== String(name)) throw new Error(`give just the file name, not a path: "${name}"`);
  if (!MEDIA.test(base)) throw new Error(`not a video file: ${base}`);
  const full = path.join(INBOX, base);
  const rel = path.relative(INBOX, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("refusing to leave the inbox folder");
  if (!existsSync(full)) throw new Error(`no such file in the inbox: ${base}`);
  return full;
}

function duration(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
  });
  const s = parseFloat((r.stdout || "").trim());
  return Number.isFinite(s) ? s : null;
}

function listFiles() {
  mkdirSync(INBOX, { recursive: true });
  return readdirSync(INBOX)
    .filter((f) => MEDIA.test(f))
    .map((f) => {
      const full = path.join(INBOX, f);
      const st = statSync(full);
      return { name: f, size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export async function inbox(argv) {
  const [action = "list", ...rest] = argv;
  const targs = rest.filter((a) => !a.startsWith("--"));

  switch (action) {
    case "list":
    case "where": {
      const files = listFiles();
      console.log(`\n  DROP FOOTAGE HERE:\n`);
      console.log(`    ${INBOX}\n`);
      console.log(`  Copy files in over the network, from a USB stick, or straight off the`);
      console.log(`  camera. No upload, no browser, no size limit beyond the disk.\n`);
      if (!files.length) {
        console.log(`  (empty)\n`);
        return true;
      }
      console.log(`  ${files.length} file(s):\n`);
      const withDur = rest.includes("--slow");
      for (const f of files) {
        let extra = "";
        if (withDur) {
          const d = duration(path.join(INBOX, f.name));
          extra = d ? `  ${Math.round(d / 60)}m${String(Math.round(d % 60)).padStart(2, "0")}s` : "";
        }
        console.log(`    ${pad(mb(f.size), 8)} ${pad(new Date(f.mtime).toISOString().slice(0, 16).replace("T", " "), 18)} ${f.name}${extra}`);
      }
      console.log(`\n  edit one:   factory inbox edit "<file name>"`);
      console.log(`  add --slow to this command to also read durations (spawns ffprobe per file)\n`);
      return true;
    }

    /* Queue an edit for a file already sitting in the inbox. */
    case "edit": {
      const name = targs.join(" ");
      if (!name) {
        console.log(`\nusage: factory inbox edit "<file name>"`);
        console.log(`  the name as shown by: factory inbox list\n`);
        return false;
      }
      let full;
      try {
        full = resolveInInbox(name);
      } catch (e) {
        console.log(`\n  ${e.message}\n`);
        return false;
      }
      const size = statSync(full).size;
      const d = duration(full);
      try {
        const vertical = rest.includes("--coding") ? "coding" : "beauty";
        const j = await enqueue({ kind: "edit", input: path.basename(full), requestedBy: "inbox", vertical });
        console.log(`\n  queued ${j.id} — edit ${path.basename(full)} (${mb(size)}${d ? `, ${Math.round(d / 60)} min` : ""})`);
        if (d) {
          // Measured on this machine: whisper ~3.4x realtime, x264 ~1.9x on the
          // trimmed output. Saying "about 29 min" beats saying nothing.
          const est = d / 60 / 3.38 + ((d / 60) * 0.7) / 1.88;
          console.log(`  rough estimate: ${est < 1 ? "under a minute" : `~${Math.round(est)} min`} of laptop time`);
        }
        console.log(`\n  it runs at the next wake window — or now with: factory queue drain\n`);
        return true;
      } catch (e) {
        console.log(`\n  ${e.message}\n`);
        return false;
      }
    }

    default:
      console.log(`unknown: inbox ${action}\n  list · where · edit`);
      return false;
  }
}
