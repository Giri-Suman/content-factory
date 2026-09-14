/**
 * Cloudflare Access token verification for the Edge runtime.
 *
 * There are deliberately no Node imports here. Mission Control's middleware
 * and API routes are bundled for Cloudflare Pages, so verification uses Web
 * Crypto and Cloudflare's published JWK set.
 */

const CLOCK_SKEW_SEC = 30;
const CERT_CACHE_MS = 5 * 60 * 1000;

let certCache = { issuer: "", until: 0, keys: [] };

function base64UrlBytes(value) {
  const base64 = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function decodeJson(value, label) {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlBytes(value)));
  } catch {
    throw new Error(`invalid Access ${label}`);
  }
}

export function accessIssuer(teamDomain) {
  const raw = String(teamDomain || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (/^https:\/\//i.test(raw)) return raw;
  if (raw.includes(".")) return `https://${raw}`;
  return `https://${raw}.cloudflareaccess.com`;
}

export function accessConfig(env = typeof process !== "undefined" ? process.env : {}) {
  const teamDomain = String(env.CF_ACCESS_TEAM_DOMAIN || "").trim();
  const audience = String(env.CF_ACCESS_AUD || "").trim();
  if (!teamDomain && !audience) return null;
  if (!teamDomain || !audience) {
    throw new Error("Cloudflare Access is only partly configured; set both CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD");
  }
  return {
    issuer: accessIssuer(teamDomain),
    audiences: audience.split(",").map((x) => x.trim()).filter(Boolean),
  };
}

export function parseAccessToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) throw new Error("missing or malformed Cloudflare Access token");
  return {
    header: decodeJson(parts[0], "header"),
    payload: decodeJson(parts[1], "payload"),
    signingInput: new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    signature: base64UrlBytes(parts[2]),
  };
}

export function validateAccessClaims(payload, config, nowMs = Date.now()) {
  const now = Math.floor(nowMs / 1000);
  if (!payload || typeof payload !== "object") throw new Error("invalid Access claims");
  if (!payload.exp || Number(payload.exp) < now - CLOCK_SKEW_SEC) throw new Error("Cloudflare Access session expired");
  if (payload.nbf && Number(payload.nbf) > now + CLOCK_SKEW_SEC) throw new Error("Cloudflare Access session is not active yet");
  if (String(payload.iss || "").replace(/\/+$/, "") !== config.issuer) throw new Error("wrong Cloudflare Access issuer");

  const tokenAudiences = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud || "")];
  if (!config.audiences.some((aud) => tokenAudiences.includes(aud))) throw new Error("wrong Cloudflare Access audience");
  if (payload.type && payload.type !== "app") throw new Error("wrong Cloudflare Access token type");

  const email = String(payload.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Cloudflare Access token has no verified email");
  return { ...payload, email };
}

async function accessKeys(config, fetchImpl) {
  const now = Date.now();
  if (certCache.issuer === config.issuer && certCache.until > now && certCache.keys.length) return certCache.keys;

  const res = await fetchImpl(`${config.issuer}/cdn-cgi/access/certs`, {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`could not load Cloudflare Access certificates (${res.status})`);
  const body = await res.json();
  if (!Array.isArray(body?.keys) || !body.keys.length) throw new Error("Cloudflare Access returned no signing keys");
  certCache = { issuer: config.issuer, until: now + CERT_CACHE_MS, keys: body.keys };
  return body.keys;
}

export async function verifyAccessToken(token, config, { fetchImpl = fetch, nowMs = Date.now() } = {}) {
  const parsed = parseAccessToken(token);
  if (parsed.header.alg !== "RS256" || !parsed.header.kid) throw new Error("unsupported Cloudflare Access signing key");

  const keys = await accessKeys(config, fetchImpl);
  const jwk = keys.find((key) => key.kid === parsed.header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("Cloudflare Access signing key was not found");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, parsed.signature, parsed.signingInput);
  if (!valid) throw new Error("invalid Cloudflare Access signature");
  return validateAccessClaims(parsed.payload, config, nowMs);
}

export function _resetAccessCertCache() {
  certCache = { issuer: "", until: 0, keys: [] };
}
