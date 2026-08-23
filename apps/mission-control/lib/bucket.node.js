/**
 * The R2 binding's surface, implemented over the signed S3 client, for Node.
 *
 * WHY THIS EXISTS: every route reads its bucket through `env.QUEUE`, which only
 * exists inside a Cloudflare Worker. Under `next dev` there is no request
 * context, so after the Pages port the local portal answered 500 on every API
 * route. next-on-pages ships `setupDevPlatform`, but that backs the binding with
 * a LOCAL simulated bucket - an empty one - so the portal would render perfectly
 * and show nothing.
 *
 * This talks to the real bucket instead, so the local portal and the deployed
 * one read identical data and a bug found in one is a bug in the other.
 *
 * Only the methods the routes actually use are implemented, shaped exactly like
 * the binding so nothing downstream needs to know which runtime it is on.
 * NEVER imported by the Pages build - next.config.mjs aliases lib/env.js to the
 * Workers version there, so packages/shared/src/r2.js (node:crypto, Buffer)
 * cannot reach the edge bundle.
 */

import { deleteObject, listObjects, presignGet, putObject } from "../../../packages/shared/src/r2.js";

/** Mirrors R2ObjectBody closely enough for the routes that consume it. */
function toObject(key, res, buf) {
  const etag = res.headers.get("etag") || "";
  return {
    key,
    size: buf.byteLength,
    uploaded: new Date(res.headers.get("last-modified") || Date.now()),
    httpEtag: etag,
    body: buf,
    text: async () => new TextDecoder().decode(buf),
    arrayBuffer: async () => buf,
    writeHttpMetadata(headers) {
      const ct = res.headers.get("content-type");
      if (ct) headers.set("content-type", ct);
    },
    range: null,
  };
}

export function nodeBucket() {
  return {
    async get(key, options) {
      const headers = {};
      // the video route forwards the incoming Range header straight through
      const range = options?.range;
      if (range && typeof range.get === "function") {
        const r = range.get("range");
        if (r) headers.range = r;
      }
      const res = await fetch(presignGet(key, 300), { headers });
      if (res.status === 404 || res.status === 403) return null;
      if (!res.ok && res.status !== 206) return null;
      const buf = await res.arrayBuffer();
      const obj = toObject(key, res, buf);
      if (res.status === 206) {
        const cr = res.headers.get("content-range") || "";
        const m = cr.match(/bytes (\d+)-(\d+)\/(\d+)/);
        if (m) {
          obj.range = { offset: Number(m[1]), length: Number(m[2]) - Number(m[1]) + 1 };
          obj.size = Number(m[3]);
        }
      }
      return obj;
    },

    async put(key, value, options) {
      /* onlyIf is the queue's atomic identity claim. R2's S3 API accepts
         If-None-Match and writes anyway (measured), so it cannot be honoured
         here. Local dev is single-user, so a best-effort check is enough - and
         returning null on an existing key keeps the caller's logic identical. */
      if (options?.onlyIf?.etagDoesNotMatch === "*") {
        const existing = await listObjects(key);
        if (existing.some((o) => o.key === key)) return null;
      }
      const body = value instanceof ArrayBuffer ? Buffer.from(value) : value;
      await putObject(key, body, { contentType: options?.httpMetadata?.contentType || "application/octet-stream" });
      return { key };
    },

    async list({ prefix = "", limit = 1000 } = {}) {
      const objects = await listObjects(prefix);
      return {
        objects: objects.slice(0, limit).map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded })),
        truncated: objects.length > limit,
      };
    },

    async delete(key) {
      await deleteObject(key);
    },
  };
}
