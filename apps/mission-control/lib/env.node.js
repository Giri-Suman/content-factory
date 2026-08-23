/**
 * Bucket + vars under `next dev` / `next start`. Aliased in as `lib/env.js`
 * for every build that is not FACTORY_TARGET=pages.
 *
 * The bucket is the REAL one, reached with the signed S3 client, so the local
 * portal shows the same data as the deployed portal rather than an empty
 * simulated bucket.
 */
import { nodeBucket } from "./bucket.node.js";

let cached = null;

export function getEnv() {
  if (!cached) cached = { ...process.env, QUEUE: nodeBucket() };
  return cached;
}
