/**
 * Upload footage straight to R2, so either machine can use it.
 *
 * The disk version wrote into data/footage on the laptop, which only worked
 * while that machine was awake and serving. This puts the file where both sides
 * reach it: the laptop pulls it with `factory sync footage pull`, and a GitHub
 * Actions edit pulls the same object.
 *
 * The uploaded name is REPLACED, not sanitised, and only an allowlisted
 * extension survives. A name like "../../.env" would otherwise escape the
 * prefix, and "clip.mp4.exe" would sit in storage as an executable.
 */

import { getEnv } from "@factory-env";
import { identityFromRequest, ownerRequired } from "../../../lib/identity.js";
import { presignR2Put } from "../../../lib/r2-sign.js";

export const runtime = "edge";

const ALLOWED = new Set(["mp4", "mov", "mkv", "avi", "m4v", "webm"]);
const MIME = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  m4v: "video/x-m4v",
  webm: "video/webm",
};
const R2_SINGLE_PUT_MAX = 5 * 1024 ** 3;

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

const uploadLimit = (env) => Math.min(R2_SINGLE_PUT_MAX, Math.max(1, Number(env.R2_UPLOAD_MAX_BYTES) || R2_SINGLE_PUT_MAX));

function cleanUpload({ name, label = "footage" }) {
  const ext = String(name || "").split(".").pop()?.toLowerCase();
  if (!ALLOWED.has(ext)) throw new Error(`extension not allowed — one of ${[...ALLOWED].join(", ")}`);
  const stem = String(label || name || "footage")
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "footage";
  return { ext, mime: MIME[ext], stem };
}

function exactName(value) {
  const name = String(value || "");
  if (!/^[a-z0-9][a-z0-9._-]{0,180}\.(mp4|mov|mkv|avi|m4v|webm)$/i.test(name)) return null;
  if (name.includes("/") || name.includes("\\")) return null;
  return name;
}

export async function GET() {
  const env = getEnv();
  if (!env?.QUEUE) return json({ ok: false, error: "storage not bound" }, 500);
  const listed = await env.QUEUE.list({ prefix: "footage/", limit: 200 });
  const items = listed.objects.map((o) => ({
    name: o.key.slice("footage/".length),
    path: o.key.slice("footage/".length),
    bytes: o.size,
    size: o.size,
    uploaded: o.uploaded,
  }));
  // Studio reads `files`; the first port named it `footage`, so the uploads list
  // was always empty. Both are returned so neither name is a trap.
  return json({ ok: true, files: items, footage: items });
}

export async function POST(request) {
  const env = getEnv();
  if (!env?.QUEUE) return json({ ok: false, error: "storage not bound" }, 500);

  if (request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    const body = await request.json().catch(() => null);
    if (!body) return json({ ok: false, error: "invalid upload request" }, 400);
    let parsed;
    try {
      parsed = cleanUpload({ name: body.name, label: body.label });
    } catch (error) {
      return json({ ok: false, error: error.message }, 400);
    }
    const size = Number(body.size);
    const maxBytes = uploadLimit(env);
    if (!Number.isSafeInteger(size) || size < 1) return json({ ok: false, error: "file size is required" }, 400);
    if (size > maxBytes) return json({ ok: false, error: `file is over the ${Math.round(maxBytes / 1024 ** 2)}MB upload limit` }, 413);

    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    const name = `${parsed.stem}-${Date.now().toString(36)}-${suffix}.${parsed.ext}`;
    const key = `footage/${name}`;
    let signed;
    try {
      signed = await presignR2Put(
        {
          accountId: env.R2_ACCOUNT_ID,
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
          bucket: env.R2_BUCKET,
        },
        { key, contentType: parsed.mime, expiresSec: 900 }
      );
    } catch (error) {
      return json({ ok: false, error: error.message }, 503);
    }

    const identity = identityFromRequest(request);
    const audit = {
      name,
      key,
      originalName: String(body.name || "").slice(0, 200),
      expectedBytes: size,
      contentType: parsed.mime,
      requestedBy: identity.email,
      requestedRole: identity.role,
      state: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: signed.expiresAt,
    };
    await env.QUEUE.put(`uploads/${name}.json`, JSON.stringify(audit, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
    return json({ ok: true, upload: { name, path: name, key, ...signed }, maxBytes });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return json({ ok: false, error: "no file" }, 400);

  let parsed;
  try {
    parsed = cleanUpload({ name: file.name, label: form.get("label") });
  } catch (error) {
    return json({ ok: false, error: error.message }, 400);
  }
  if (file.size > uploadLimit(env)) return json({ ok: false, error: "file is over the upload limit" }, 413);

  const name = `${parsed.stem}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${parsed.ext}`;

  await env.QUEUE.put(`footage/${name}`, file.stream(), { httpMetadata: { contentType: parsed.mime } });
  const identity = identityFromRequest(request);
  await env.QUEUE.put(`uploads/${name}.json`, JSON.stringify({
    name,
    key: `footage/${name}`,
    originalName: String(file.name || "").slice(0, 200),
    bytes: file.size,
    contentType: parsed.mime,
    requestedBy: identity.email,
    requestedRole: identity.role,
    state: "ready",
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  }, null, 2), { httpMetadata: { contentType: "application/json" } });
  return json({ ok: true, name, path: name, bytes: file.size, note: "ready for a cloud edit" });
}

export async function PATCH(request) {
  const env = getEnv();
  if (!env?.QUEUE) return json({ ok: false, error: "storage not bound" }, 500);
  const body = await request.json().catch(() => ({}));
  const name = exactName(body.name);
  if (!name) return json({ ok: false, error: "valid upload name required" }, 400);
  const key = `footage/${name}`;
  const object = await env.QUEUE.head(key);
  if (!object) return json({ ok: false, error: "R2 has not received this upload" }, 404);
  const maxBytes = uploadLimit(env);
  if (object.size > maxBytes) {
    await env.QUEUE.delete(key);
    return json({ ok: false, error: "uploaded object exceeded the workspace limit and was removed" }, 413);
  }
  const pending = await env.QUEUE.get(`uploads/${name}.json`);
  const audit = pending ? await pending.json().catch(() => ({})) : {};
  if (audit.expectedBytes && Number(audit.expectedBytes) !== object.size) {
    await env.QUEUE.delete(key);
    return json({ ok: false, error: "uploaded byte count did not match the selected file" }, 400);
  }
  const completed = { ...audit, name, key, bytes: object.size, state: "ready", completedAt: new Date().toISOString() };
  await env.QUEUE.put(`uploads/${name}.json`, JSON.stringify(completed, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
  return json({ ok: true, name, path: name, bytes: object.size, uploaded: object.uploaded });
}

export async function DELETE(request) {
  const gate = ownerRequired(request);
  if (gate.response) return gate.response;
  const env = getEnv();
  if (!env?.QUEUE) return json({ ok: false, error: "storage not bound" }, 500);
  const name = exactName(new URL(request.url).searchParams.get("name"));
  if (!name) return json({ ok: false, error: "valid name required" }, 400);
  await Promise.all([env.QUEUE.delete(`footage/${name}`), env.QUEUE.delete(`uploads/${name}.json`)]);
  return json({ ok: true });
}
