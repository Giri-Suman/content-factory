import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Next only auto-loads `.env` from its OWN directory. Every other part of this
 * project reads the monorepo root `.env`, so without this a password put in the
 * root file would be invisible to middleware and the portal would stay OPEN —
 * silently, which is the worst way for an auth control to fail.
 *
 * Loading it here means one `.env` for the whole project, as everything else
 * already assumes. Existing process env always wins, so a real deployment can
 * still inject secrets the normal way.
 */
const ROOT_ENV = path.resolve(process.cwd(), "../../.env");
if (existsSync(ROOT_ENV)) {
  for (const line of readFileSync(ROOT_ENV, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2].replace(/^(['"])([\s\S]*)\1$/, "$2"); // strip quotes, same as loadEnv
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // the portal executes local binaries and reads the project's own files, so it
  // must run as a Node server — never as a static export
  output: "standalone",
  env: {
    // surfaced read-only to the client so the UI can warn when it is unlocked
    FACTORY_AUTH_ON: process.env.FACTORY_PASSWORD ? "1" : "",
  },
};
