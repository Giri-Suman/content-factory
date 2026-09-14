/** Import a shared Google Drive video into R2-backed footage storage. */

import { createSign } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { loadEnv, repoRoot } from "../../shared/src/config.js";
import { pushFootage } from "../../shared/src/stateSync.js";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const MEDIA = /\.(mp4|mov|mkv|avi|m4v|webm)$/i;
const b64 = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

export function parseDriveReference(value) {
  const raw = String(value || "").trim();
  if (/^[A-Za-z0-9_-]{10,}$/.test(raw)) return { id: raw, resourceKey: "" };
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("paste a Google Drive file link or file id");
  }
  if (!/(^|\.)drive\.google\.com$/i.test(url.hostname) && !/(^|\.)docs\.google\.com$/i.test(url.hostname)) {
    throw new Error("only Google Drive links are accepted");
  }
  const match = url.pathname.match(/\/(?:file\/d|document\/d|spreadsheets\/d|presentation\/d)\/([A-Za-z0-9_-]+)/i);
  const id = match?.[1] || url.searchParams.get("id");
  if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) throw new Error("could not find a Drive file id in that link");
  return { id, resourceKey: url.searchParams.get("resourcekey") || "" };
}

function driveConfig() {
  loadEnv();
  const email = String(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = String(process.env.GOOGLE_DRIVE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  const missing = [
    ["GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL", email],
    ["GOOGLE_DRIVE_PRIVATE_KEY", privateKey],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Google Drive import is not configured; missing ${missing.join(", ")}`);
  return { email, privateKey };
}

export function serviceAccountAssertion({ email, privateKey }, nowMs = Date.now()) {
  const now = Math.floor(nowMs / 1000);
  const head = b64({ alg: "RS256", typ: "JWT" });
  const body = b64({ iss: email, scope: DRIVE_SCOPE, aud: TOKEN_URL, iat: now - 5, exp: now + 3550 });
  const input = `${head}.${body}`;
  return `${input}.${createSign("RSA-SHA256").update(input).end().sign(privateKey).toString("base64url")}`;
}

async function accessToken(config, fetchImpl) {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: serviceAccountAssertion(config),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(`Google service-account sign-in failed (${response.status}): ${body.error_description || body.error || "unknown error"}`);
  return body.access_token;
}

const safeOutputName = (name, id) => {
  const ext = path.extname(String(name || "")).toLowerCase();
  if (!MEDIA.test(ext)) throw new Error("Drive file must be mp4, mov, mkv, avi, m4v, or webm");
  const stem = path.basename(String(name), ext).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "drive-video";
  return `${stem}-${String(id).slice(-8)}${ext}`;
};

export async function importDriveFile(reference, { fetchImpl = fetch } = {}) {
  const parsed = parseDriveReference(reference);
  const config = driveConfig();
  const token = await accessToken(config, fetchImpl);
  const headers = { authorization: `Bearer ${token}` };
  if (parsed.resourceKey) headers["x-goog-drive-resource-keys"] = `${parsed.id}/${parsed.resourceKey}`;

  const fields = "id,name,mimeType,size,capabilities(canDownload),md5Checksum";
  const metaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(parsed.id)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`;
  const metaResponse = await fetchImpl(metaUrl, { headers });
  const meta = await metaResponse.json().catch(() => ({}));
  if (!metaResponse.ok) throw new Error(`Drive could not read that file (${metaResponse.status}): ${meta.error?.message || "share it with the service-account email"}`);
  if (String(meta.mimeType || "").startsWith("application/vnd.google-apps.")) throw new Error("Google-native Docs/Sheets/Slides cannot be used as footage; share a video file");
  if (meta.capabilities?.canDownload === false) throw new Error("the Drive owner disabled downloads for this file");
  const size = Number(meta.size || 0);
  const max = Math.min(5 * 1024 ** 3, Math.max(1, Number(process.env.R2_UPLOAD_MAX_BYTES) || 5 * 1024 ** 3));
  if (size && size > max) throw new Error(`Drive file is over the ${Math.round(max / 1024 ** 2)}MB workspace limit`);

  const name = safeOutputName(meta.name, parsed.id);
  const folder = path.join(repoRoot, "data", "footage");
  const file = path.join(folder, name);
  mkdirSync(folder, { recursive: true });
  const mediaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(parsed.id)}?alt=media&supportsAllDrives=true`;
  const response = await fetchImpl(mediaUrl, { headers });
  if (!response.ok || !response.body) throw new Error(`Drive download failed (${response.status})`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
  if (!existsSync(file) || !statSync(file).size) throw new Error("Drive returned an empty file");
  if (size && statSync(file).size !== size) throw new Error("Drive download ended before the complete file arrived");

  const uploaded = await pushFootage(name);
  return { id: parsed.id, name, file, bytes: uploaded.bytes, key: uploaded.key, requestedBy: process.env.FACTORY_REQUESTED_BY || "cli" };
}

export async function drive(argv) {
  const [action, ...rest] = argv;
  if (action !== "import" || !rest.length) {
    console.log("\nusage: factory drive import <shared-file-link-or-id>\n");
    return false;
  }
  const result = await importDriveFile(rest.join(" "));
  console.log(`\n  imported ${result.name} (${Math.round(result.bytes / 1024 ** 2)}MB) -> ${result.key}\n`);
  return true;
}
