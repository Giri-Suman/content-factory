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

export const runtime = "edge";

const ALLOWED = new Set(["mp4", "mov", "mkv", "avi", "m4v", "webm"]);

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

export async function GET() {
  const env = getEnv();
  if (!env?.QUEUE) return json({ ok: false, error: "storage not bound" }, 500);
  const listed = await env.QUEUE.list({ prefix: "footage/", limit: 200 });
  const items = listed.objects.map((o) => ({
    name: o.key.slice("footage/".length),
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

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return json({ ok: false, error: "no file" }, 400);

  const ext = String(file.name || "").split(".").pop()?.toLowerCase();
  if (!ALLOWED.has(ext)) {
    return json({ ok: false, error: `extension not allowed — one of ${[...ALLOWED].join(", ")}` }, 400);
  }

  const label =
    String(form.get("label") || "footage")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 32) || "footage";
  const name = `${label}-${Date.now().toString(36)}.${ext}`;

  await env.QUEUE.put(`footage/${name}`, file.stream(), { httpMetadata: { contentType: "video/mp4" } });
  return json({ ok: true, name, note: "queue an edit against this name" });
}

export async function DELETE(request) {
  const env = getEnv();
  if (!env?.QUEUE) return json({ ok: false, error: "storage not bound" }, 500);
  const name = new URL(request.url).searchParams.get("name");
  if (!name) return json({ ok: false, error: "name required" }, 400);
  // basename only, so a delete cannot reach outside footage/
  await env.QUEUE.delete(`footage/${String(name).split("/").pop()}`);
  return json({ ok: true });
}
