/**
 * CLOUDFLARE R2 — off-machine storage for finished renders.
 *
 * WHY: renders live on the laptop's disk and the portal streams them from
 * there, so a finished video is unreachable the moment the machine sleeps.
 * Pushing each render to R2 makes it downloadable from anywhere, forever,
 * without this machine being awake. R2 charges ZERO egress, which is the whole
 * reason it is the right store here rather than S3.
 *
 * SAFETY — this file deliberately uses only R2's S3-compatible API:
 *   - no wrangler config, no Workers, no Pages deploy
 *   - no DNS records, no custom domain, no public bucket
 * R2 is a separate product from Workers. Nothing here can reach the `coderfact`
 * Worker that serves the portfolio site, and there is no code path in this repo
 * that deploys a Worker. Downloads use time-limited presigned URLs instead of a
 * public bucket, so the bucket needs no domain at all.
 *
 * Zero dependencies: SigV4 is ~60 lines of node:crypto, and adding the AWS SDK
 * to sign a PUT would be the largest dependency in the repo.
 *
 * Config (.env):
 *   R2_ACCOUNT_ID=…
 *   R2_ACCESS_KEY_ID=…
 *   R2_SECRET_ACCESS_KEY=…
 *   R2_BUCKET=content-factory-renders
 * Unconfigured is a supported state: isConfigured() is false and every caller
 * skips silently. Uploading must never be able to fail a render.
 */

import { createHash, createHmac } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "./config.js";

const ALGO = "AWS4-HMAC-SHA256";
const REGION = "auto"; // R2 ignores region but SigV4 requires one in the scope
const SERVICE = "s3";

const sha256hex = (b) => createHash("sha256").update(b).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

/**
 * AWS requires !'()* percent-encoded; encodeURIComponent leaves them alone.
 * Getting this wrong produces a SignatureDoesNotMatch only for keys that happen
 * to contain those characters, which is the kind of bug that shows up months
 * later on one file.
 */
const rfc3986 = (s) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Path segments are encoded individually so "/" stays a separator. */
const encodeKey = (key) => key.split("/").map(rfc3986).join("/");

/**
 * .env is loaded lazily here rather than by each caller.
 *
 * This repo's convention is that every entry point calls loadEnv() itself, and
 * relying on that meant R2 silently reported "not configured" with a perfectly
 * good .env — the CLI command had simply not called it. Doing it here makes R2
 * work identically from the CLI, the render hook and the portal route without
 * auditing each one. loadEnv() never overwrites an already-set variable, so
 * real environment variables (CI) still win over the file.
 */
let envLoaded = false;
function ensureEnv() {
  if (envLoaded) return;
  envLoaded = true;
  try {
    loadEnv();
  } catch {
    /* no .env is a supported state */
  }
}

export function r2Config() {
  ensureEnv();
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, host: `${accountId}.r2.cloudflarestorage.com` };
}

export const isConfigured = () => Boolean(r2Config());

/** Which env vars are missing — for `factory r2 status` and the settings tab. */
export function missingConfig() {
  ensureEnv();
  return ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter((k) => !process.env[k]);
}

/**
 * region/service are parameters rather than constants so this can be checked
 * against AWS's published SigV4 test vectors, which are all us-east-1. An
 * untestable signing function is one you find out is wrong from a 403.
 * See test/r2-sigv4.mjs.
 */
export function signingKey(secret, date, region = REGION, service = SERVICE) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), service), "aws4_request");
}

/** Exported for the same test. */
export const _internals = { sha256hex, rfc3986, encodeKey, ALGO };

const stamps = () => {
  const amz = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { amzDate: amz, date: amz.slice(0, 8) };
};

/* ------------------------------------------------------------------ PUT --- */

/**
 * Upload one object. Body is read into memory and hashed: correct, and fine for
 * the 3MB shorts this produces. A file over the cap is refused rather than
 * silently truncated or streamed with an unsigned payload.
 */
export async function putObject(key, body, { contentType = "application/octet-stream" } = {}) {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2 is not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET");

  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const { amzDate, date } = stamps();
  const canonicalUri = `/${cfg.bucket}/${encodeKey(key)}`;
  const payloadHash = sha256hex(buf);

  const headers = {
    host: cfg.host,
    "content-length": String(buf.length),
    "content-type": contentType,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((h) => `${h}:${String(headers[h]).trim()}\n`)
    .join("");

  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [ALGO, amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(cfg.secretAccessKey, date)).update(stringToSign).digest("hex");

  const res = await fetch(`https://${cfg.host}${canonicalUri}`, {
    method: "PUT",
    headers: {
      ...headers,
      Authorization: `${ALGO} Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: buf,
  });
  if (!res.ok) {
    throw new Error(`R2 PUT ${key} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  return { key, bytes: buf.length, etag: res.headers.get("etag") || null };
}

/* -------------------------------------------------------------- presign --- */

/**
 * A time-limited download URL. Used instead of making the bucket public: a
 * public bucket needs a domain, and this project must not create DNS records.
 * Default 7 days, which is R2's maximum for presigned URLs.
 */
export function presignGet(key, expiresSec = 604800) {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2 is not configured");
  if (expiresSec > 604800) throw new Error("presigned URLs cannot exceed 7 days (604800s)");

  const { amzDate, date } = stamps();
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const canonicalUri = `/${cfg.bucket}/${encodeKey(key)}`;

  // Query params must be sorted by key, and each value encoded.
  const params = {
    "X-Amz-Algorithm": ALGO,
    "X-Amz-Credential": `${cfg.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSec),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(params[k])}`)
    .join("&");

  const canonicalRequest = ["GET", canonicalUri, canonicalQuery, `host:${cfg.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = [ALGO, amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(cfg.secretAccessKey, date)).update(stringToSign).digest("hex");

  return `https://${cfg.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/* ----------------------------------------------------------------- list --- */

export async function listObjects(prefix = "") {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2 is not configured");
  const { amzDate, date } = stamps();
  const emptyHash = sha256hex("");
  const canonicalUri = `/${cfg.bucket}`;
  const params = { "list-type": "2", ...(prefix ? { prefix } : {}) };
  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(params[k])}`)
    .join("&");

  const headers = { host: cfg.host, "x-amz-content-sha256": emptyHash, "x-amz-date": amzDate };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((h) => `${h}:${headers[h]}\n`)
    .join("");
  const canonicalRequest = ["GET", canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, emptyHash].join("\n");
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [ALGO, amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(cfg.secretAccessKey, date)).update(stringToSign).digest("hex");

  const res = await fetch(`https://${cfg.host}${canonicalUri}?${canonicalQuery}`, {
    headers: {
      ...headers,
      Authorization: `${ALGO} Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  });
  if (!res.ok) throw new Error(`R2 list failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const xml = await res.text();

  // Minimal XML pull rather than a parser dependency: S3 list output is a flat
  // repeated <Contents> shape, so a regex is honest here.
  const out = [];
  for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const chunk = m[1];
    const pick = (tag) => (chunk.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] || "";
    out.push({ key: pick("Key"), size: Number(pick("Size")) || 0, modified: pick("LastModified") });
  }
  return out;
}

/* ------------------------------------------------------- render helpers --- */

const CONTENT_TYPES = { ".mp4": "video/mp4", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".wav": "audio/wav", ".mp3": "audio/mpeg" };
const MAX_BYTES = 200 * 1024 * 1024;

/** Upload one local file under `renders/<id>/`. Key mirrors the local layout. */
export async function pushFile(id, filePath) {
  const size = statSync(filePath).size;
  if (size > MAX_BYTES) {
    throw new Error(`${path.basename(filePath)} is ${Math.round(size / 1048576)}MB — over the ${MAX_BYTES / 1048576}MB single-PUT cap (multipart not implemented)`);
  }
  const ext = path.extname(filePath).toLowerCase();
  const key = `renders/${id}/${path.basename(filePath)}`;
  const r = await putObject(key, readFileSync(filePath), { contentType: CONTENT_TYPES[ext] || "application/octet-stream" });
  return { ...r, url: presignGet(key) };
}

/**
 * Best-effort push of a finished render's files.
 *
 * NEVER THROWS. A render that succeeded locally must not be reported as failed
 * because a network upload did not work — the video exists either way, and the
 * caller has already spent ~10 minutes of CPU on it.
 */
export async function pushRender(id, files) {
  if (!isConfigured()) return { skipped: "not configured", uploaded: [], failed: [] };
  const uploaded = [];
  const failed = [];
  for (const f of files) {
    try {
      uploaded.push(await pushFile(id, f));
    } catch (e) {
      failed.push({ file: path.basename(f), error: String(e.message).slice(0, 160) });
    }
  }
  return { uploaded, failed };
}

/* ------------------------------------------------------ retention --- */

/**
 * Storage policy.
 *
 * FREE_TIER is R2's free allowance. RENDER_CEILING is deliberately below it: a
 * render that starts at 9.4GB must still have room to finish, and discovering
 * you are over the limit *after* spending ten minutes of CPU is the failure this
 * exists to prevent.
 *
 * RETAIN_HOURS is enforced two ways on purpose:
 *   - a bucket lifecycle rule, which Cloudflare applies even with this laptop
 *     off — the durable guarantee
 *   - `factory r2 prune`, which is exact and immediate for when you want the
 *     space back now
 * Lifecycle alone is not enough because S3-style rules have day granularity and
 * run asynchronously; prune alone is not enough because it needs this machine
 * awake. Together they cover both.
 */
export const FREE_TIER_BYTES = 10 * 1024 ** 3;
// Overridable so the policy can be tuned without a code change — and so the
// guard can be tested without actually storing 9.5GB.
export const RENDER_CEILING_BYTES = Math.round(Number(process.env.R2_CEILING_GB || 9.5) * 1024 ** 3);
export const RETAIN_HOURS = Number(process.env.R2_RETAIN_HOURS || 48);

/** Total bytes stored, plus what is already past its retention window. */
export async function usage() {
  const objects = await listObjects("renders/");
  const now = Date.now();
  const cutoff = now - RETAIN_HOURS * 3600 * 1000;
  let bytes = 0;
  let expiredBytes = 0;
  const expired = [];
  for (const o of objects) {
    bytes += o.size;
    const t = Date.parse(o.modified || "");
    if (Number.isFinite(t) && t < cutoff) {
      expiredBytes += o.size;
      expired.push(o);
    }
  }
  return {
    bytes,
    objects: objects.length,
    expired,
    expiredBytes,
    freeTier: FREE_TIER_BYTES,
    ceiling: RENDER_CEILING_BYTES,
    pctOfFree: bytes / FREE_TIER_BYTES,
    overCeiling: bytes >= RENDER_CEILING_BYTES,
    headroom: Math.max(0, RENDER_CEILING_BYTES - bytes),
  };
}

/**
 * Refuse to start work that would push storage past the ceiling.
 *
 * THROWS by design, before the render rather than after. Reclaimable space is
 * reported in the message because "you are full" without "here is how to fix it"
 * is a dead end. Returns usage when there is room.
 */
export async function assertSpace() {
  if (!isConfigured()) return null;
  const u = await usage();
  if (!u.overCeiling) return u;
  // Scale-aware: "0.00GB of 0.00GB" is a useless message when the numbers are
  // small, which they are whenever someone lowers the ceiling to test it.
  const gb = (n) =>
    n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)}GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`;
  const reclaim = u.expiredBytes
    ? `${gb(u.expiredBytes)} is already past ${RETAIN_HOURS}h and can be freed now: factory r2 prune`
    : `nothing is past ${RETAIN_HOURS}h yet — delete something manually: factory r2 rm <renderId>`;
  throw new Error(
    `R2 storage is at ${gb(u.bytes)} of the ${gb(RENDER_CEILING_BYTES)} render ceiling ` +
      `(free tier is ${gb(FREE_TIER_BYTES)}). Not starting a new render.\n  ${reclaim}`
  );
}

/* --------------------------------------------------------- delete --- */

export async function deleteObject(key) {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2 is not configured");
  const { amzDate, date } = stamps();
  const emptyHash = sha256hex("");
  const canonicalUri = `/${cfg.bucket}/${encodeKey(key)}`;
  const headers = { host: cfg.host, "x-amz-content-sha256": emptyHash, "x-amz-date": amzDate };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((h) => `${h}:${headers[h]}\n`)
    .join("");
  const canonicalRequest = ["DELETE", canonicalUri, "", canonicalHeaders, signedHeaders, emptyHash].join("\n");
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [ALGO, amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(cfg.secretAccessKey, date)).update(stringToSign).digest("hex");

  const res = await fetch(`https://${cfg.host}${canonicalUri}`, {
    method: "DELETE",
    headers: {
      ...headers,
      Authorization: `${ALGO} Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  });
  // S3 DELETE is idempotent: 204 on success, 404 is also "it is gone".
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 DELETE ${key} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return { key, deleted: true };
}

/** Delete everything older than the retention window. Returns what went. */
export async function pruneExpired({ dryRun = false } = {}) {
  const u = await usage();
  const removed = [];
  const failed = [];
  for (const o of u.expired) {
    if (dryRun) {
      removed.push(o);
      continue;
    }
    try {
      await deleteObject(o.key);
      removed.push(o);
    } catch (e) {
      failed.push({ key: o.key, error: String(e.message).slice(0, 140) });
    }
  }
  return { removed, failed, freed: removed.reduce((a, o) => a + o.size, 0), dryRun, before: u };
}

/* ------------------------------------------------------ lifecycle --- */

/**
 * Ask Cloudflare to expire objects itself.
 *
 * This is the half of retention that survives the laptop being off — Cloudflare
 * applies it server-side whether or not anything of ours is running.
 *
 * Honest limitation: the S3 lifecycle schema expresses age in DAYS, and
 * deletion is asynchronous, so this is "about 2 days", not "exactly 48 hours".
 * `factory r2 prune` is the exact enforcement; this is the backstop that cannot
 * be forgotten. Both are wired up because neither alone is sufficient.
 */
export async function putLifecycle({ days = 2, prefix = "renders/" } = {}) {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2 is not configured");

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<LifecycleConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
    `<Rule>` +
    `<ID>factory-retention</ID>` +
    `<Filter><Prefix>${prefix}</Prefix></Filter>` +
    `<Status>Enabled</Status>` +
    `<Expiration><Days>${days}</Days></Expiration>` +
    `</Rule>` +
    `</LifecycleConfiguration>`;

  const buf = Buffer.from(body, "utf8");
  const { amzDate, date } = stamps();
  const payloadHash = sha256hex(buf);
  const canonicalUri = `/${cfg.bucket}`;
  const canonicalQuery = "lifecycle=";

  // R2 requires Content-MD5 on this call, as S3 does.
  const md5 = createHash("md5").update(buf).digest("base64");
  const headers = {
    host: cfg.host,
    "content-md5": md5,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((h) => `${h}:${String(headers[h]).trim()}\n`)
    .join("");
  const canonicalRequest = ["PUT", canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [ALGO, amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(cfg.secretAccessKey, date)).update(stringToSign).digest("hex");

  const res = await fetch(`https://${cfg.host}${canonicalUri}?${canonicalQuery}`, {
    method: "PUT",
    headers: {
      ...headers,
      Authorization: `${ALGO} Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: buf,
  });
  if (res.status === 403) {
    // Lifecycle is a BUCKET-level operation; an "Object Read & Write" token
    // cannot set it. Broadening the token to Admin would widen the blast radius
    // on an account that also serves a live website, which is a bad trade for a
    // setting you configure once. The dashboard does it with the same effect.
    const e = new Error(
      `this API token cannot set bucket lifecycle (it is scoped to objects, which is the safer scope).
` +
        `  Set it once in the dashboard instead — same result, no broader token:
` +
        `    R2 -> your bucket -> Settings -> Object lifecycle rules -> Add rule
` +
        `    "Delete objects" after ${days} day(s), prefix "${prefix}"
` +
        `  Until then \`factory r2 prune\` enforces retention whenever this PC is on.`
    );
    e.code = "LIFECYCLE_FORBIDDEN";
    throw e;
  }
  if (!res.ok) throw new Error(`R2 lifecycle PUT failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return { days, prefix };
}

/** Read back the rule, so `r2 status` can prove it is actually in place. */
export async function getLifecycle() {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2 is not configured");
  const { amzDate, date } = stamps();
  const emptyHash = sha256hex("");
  const canonicalUri = `/${cfg.bucket}`;
  const canonicalQuery = "lifecycle=";
  const headers = { host: cfg.host, "x-amz-content-sha256": emptyHash, "x-amz-date": amzDate };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((h) => `${h}:${headers[h]}\n`)
    .join("");
  const canonicalRequest = ["GET", canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, emptyHash].join("\n");
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [ALGO, amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(cfg.secretAccessKey, date)).update(stringToSign).digest("hex");

  const res = await fetch(`https://${cfg.host}${canonicalUri}?${canonicalQuery}`, {
    headers: {
      ...headers,
      Authorization: `${ALGO} Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  });
  if (res.status === 404) return null; // no rule set
  // Not an error worth throwing on: an object-scoped token simply cannot see
  // bucket config, and `r2 status` must still work for everything else.
  if (res.status === 403) return { unknown: true, reason: "token is object-scoped; check the rule in the dashboard" };
  if (!res.ok) throw new Error(`R2 lifecycle GET failed: ${res.status}`);
  const xml = await res.text();
  const days = (xml.match(/<Days>(\d+)<\/Days>/) || [])[1];
  const status = (xml.match(/<Status>(\w+)<\/Status>/) || [])[1];
  return days ? { days: Number(days), status: status || "unknown" } : null;
}
