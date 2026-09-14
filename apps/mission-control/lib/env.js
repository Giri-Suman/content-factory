/**
 * Bucket + vars on Cloudflare Pages. Aliased in as `lib/env.js` for the Pages
 * build only (next.config.mjs, FACTORY_TARGET=pages).
 */
import { getRequestContext } from "@cloudflare/next-on-pages";

export function getEnv() {
  return getRequestContext().env;
}
