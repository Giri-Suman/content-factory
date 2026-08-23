/**
 * Run the local portal with the password gate OFF.
 *
 * The gate opens when FACTORY_PASSWORD is unset - which is the documented,
 * intended state for localhost. The problem is that next.config.mjs loads the
 * monorepo root .env so one file configures everything, and that file has a
 * password in it for the deployed portal. So plain `npm run dev` inherits a
 * gate that only makes sense on a public hostname, and you cannot open any page
 * without signing in to your own laptop.
 *
 * Setting the variable to an empty string (not deleting it) is what does the
 * work: next.config.mjs only fills in values that are `undefined`, so an empty
 * string survives and middleware sees no password.
 *
 * BINDS TO LOCALHOST ONLY. An ungated portal can queue work onto this machine,
 * so it must not be reachable from the network.
 */
import { spawn } from "node:child_process";

const child = spawn("npx", ["next", "dev", "-p", process.env.PORT || "4600", "-H", "127.0.0.1"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, FACTORY_PASSWORD: "" },
});

child.on("exit", (code) => process.exit(code ?? 0));
