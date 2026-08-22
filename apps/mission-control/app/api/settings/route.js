/**
 * Settings.
 *
 * Read-only here. Settings live in data/config.json on the laptop and are the
 * input to every run; a cloud write would be overwritten by the next sync push
 * and the change would vanish without a word.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";
export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

import { readConfig, readEnvFlags } from "../../../lib/cloud.js";

export async function GET() {
  const { env } = getRequestContext();
  const [config, envKeys] = await Promise.all([readConfig(env), readEnvFlags(env)]);
  return json({
    ...config,
    // The Settings page renders nothing until `env` exists, and Math Studio
    // uses env.provider to say whether writing a topic needs an LLM key. The
    // laptop publishes these as booleans; the cloud has no way to read its .env.
    env: envKeys,
    readOnly: true,
    note: "Change settings on the laptop, then run `factory sync push`.",
  });
}

export async function PUT() {
  return json({ ok: false, error: "Settings are read-only from the cloud portal." }, 405);
}
