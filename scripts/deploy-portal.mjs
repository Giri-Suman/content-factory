/**
 * Deploy the portal from the bundle CI built.
 *
 *   node scripts/deploy-portal.mjs
 *
 * WHY NOT JUST BUILD HERE: a bundle built on Windows deploys fine and then 500s
 * on every page - the React Server Consumer Manifest does not survive the build,
 * which is what the adapter's "not reliable on Windows" warning means in
 * practice. CI builds on Linux and drops the tarball at builds/portal-latest.tgz
 * in R2; this pulls that exact artifact and ships it with the local wrangler
 * login.
 *
 * This whole script becomes unnecessary once CLOUDFLARE_API_TOKEN is a repo
 * secret, because then the same CI run deploys directly.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { presignGet } from "../packages/shared/src/r2.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "apps", "mission-control");
const staticDir = path.join(app, ".vercel", "output", "static");
const tgz = path.join(app, ".vercel", "portal-latest.tgz");

// shell:true is only needed for npx (a .cmd on Windows). Anything else runs
// without a shell, so paths containing spaces are not re-split into arguments —
// "D:\youtube\automated website\..." became two arguments and tar failed on it.
const run = (cmd, args, cwd, shell = false) => execFileSync(cmd, args, { cwd, stdio: "inherit", shell });

console.log("→ fetching the CI build from R2");
const url = presignGet("builds/portal-latest.tgz", 600);
mkdirSync(path.dirname(tgz), { recursive: true });
const res = await fetch(url);
if (!res.ok) throw new Error(`R2 returned ${res.status} — has the deploy-portal workflow run yet?`);
writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));

console.log("→ replacing the local build output");
rmSync(staticDir, { recursive: true, force: true });
mkdirSync(staticDir, { recursive: true });
// Relative paths from .vercel/, so neither the drive letter nor the space in
// the project path can confuse tar.
run("tar", ["-xzf", "portal-latest.tgz", "-C", "output/static"], path.join(app, ".vercel"));

console.log("→ deploying (wrangler.toml supplies project, nodejs_compat and the R2 binding)");
run("npx", ["wrangler", "pages", "deploy", "--branch=main", "--commit-dirty=true"], app, true);
