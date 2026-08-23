/**
 * Stream a finished video from R2.
 *
 * The disk version read renders/<id>/<file> with createReadStream and
 * reimplemented Range handling by hand — which is where the uncaught
 * ERR_INVALID_STATE crash lived. R2 handles Range natively, so seeking and
 * mobile playback work without any of that code existing.
 *
 * `?download=1` forces a save dialog. Without it the browser plays inline and
 * there is no obvious way to keep the file: fine if you know to right-click,
 * confusing otherwise.
 */

import { getEnv } from "@factory-env";

export const runtime = "edge";

export async function GET(request, { params }) {
  const env = getEnv();
  if (!env?.QUEUE) return new Response("storage not bound", { status: 500 });

  // basename only — a crafted id must not walk out of the renders/ prefix
  const p = await params; // Next 15: params is a Promise
  const id = String(p.id).split("/").pop();
  const file = String(p.file).split("/").pop();
  if (!/\.(mp4|png|jpg|webp)$/i.test(file)) return new Response("not found", { status: 404 });

  const range = request.headers.get("range");
  const obj = await env.QUEUE.get(`renders/${id}/${file}`, range ? { range: request.headers } : undefined);
  if (!obj) return new Response("not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("accept-ranges", "bytes");
  headers.set("etag", obj.httpEtag);
  if (!headers.get("content-type")) {
    headers.set("content-type", file.toLowerCase().endsWith(".mp4") ? "video/mp4" : "image/png");
  }
  if (new URL(request.url).searchParams.get("download") === "1") {
    headers.set("content-disposition", `attachment; filename="${id}-${file}"`);
  }

  // R2 populates `range` on the object only when the request carried one.
  if (obj.range) {
    const end = obj.range.offset + obj.range.length - 1;
    headers.set("content-range", `bytes ${obj.range.offset}-${end}/${obj.size}`);
    return new Response(obj.body, { status: 206, headers });
  }
  return new Response(obj.body, { status: 200, headers });
}
