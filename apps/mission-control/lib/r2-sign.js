/**
 * Edge-safe AWS Signature V4 presigning for direct browser uploads to R2.
 *
 * Keep this module free of Node built-ins: Mission Control API routes are
 * bundled for Cloudflare's Edge runtime, where the Node-only shared R2 client
 * cannot be imported.
 */

const ALGORITHM = "AWS4-HMAC-SHA256";
const REGION = "auto";
const SERVICE = "s3";
const encoder = new TextEncoder();

const bytes = (value) => (value instanceof Uint8Array ? value : encoder.encode(String(value)));
const hex = (value) => [...new Uint8Array(value)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sha256(value) {
  return crypto.subtle.digest("SHA-256", bytes(value));
}

async function hmac(key, value) {
  const imported = await crypto.subtle.importKey("raw", bytes(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, bytes(value)));
}

async function signingKey(secret, date) {
  const dateKey = await hmac(`AWS4${secret}`, date);
  const regionKey = await hmac(dateKey, REGION);
  const serviceKey = await hmac(regionKey, SERVICE);
  return hmac(serviceKey, "aws4_request");
}

/** AWS requires these five characters to be percent encoded too. */
export const rfc3986 = (value) =>
  encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/** Encode key segments while retaining slash separators. */
export const encodeR2Key = (key) => String(key).split("/").map(rfc3986).join("/");

const requireValue = (value, label) => {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required for direct R2 uploads`);
  return text;
};

/**
 * Create a short-lived, content-type-bound PUT URL for R2's S3 endpoint.
 * The access-key id appears in SigV4's Credential query field, as required;
 * the secret key stays server-side and is never returned.
 */
export async function presignR2Put(
  { accountId, accessKeyId, secretAccessKey, bucket },
  { key, contentType, expiresSec = 600, now = new Date() }
) {
  const account = requireValue(accountId, "R2_ACCOUNT_ID");
  const access = requireValue(accessKeyId, "R2_ACCESS_KEY_ID");
  const secret = requireValue(secretAccessKey, "R2_SECRET_ACCESS_KEY");
  const bucketName = requireValue(bucket, "R2_BUCKET");
  const objectKey = requireValue(key, "object key");
  const mime = requireValue(contentType, "content type").toLowerCase();
  const ttl = Number(expiresSec);
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 604800) {
    throw new Error("presigned URL expiry must be between 1 and 604800 seconds");
  }

  const instant = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(instant.getTime())) throw new Error("invalid signing time");
  const amzDate = instant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const date = amzDate.slice(0, 8);
  const host = `${account}.r2.cloudflarestorage.com`;
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const canonicalUri = `/${rfc3986(bucketName)}/${encodeR2Key(objectKey)}`;
  const signedHeaders = "content-type;host";
  const params = {
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": `${access}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(ttl),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(params)
    .sort()
    .map((name) => `${rfc3986(name)}=${rfc3986(params[name])}`)
    .join("&");
  const canonicalHeaders = `content-type:${mime}\nhost:${host}\n`;
  const canonicalRequest = ["PUT", canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = [ALGORITHM, amzDate, scope, hex(await sha256(canonicalRequest))].join("\n");
  const signature = hex(await hmac(await signingKey(secret, date), stringToSign));

  return {
    url: `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    headers: { "content-type": mime },
    expiresAt: new Date(instant.getTime() + ttl * 1000).toISOString(),
  };
}
