/**
 * Serve a generated thumbnail from R2.
 *
 * Thumbnails live at renders/<id>/thumbs/<layout>.png. The first port only
 * looked at renders/<id>/<layout>, so every image on the Packaging page 404'd -
 * 14 of them, all silently, because a broken <img> reports nothing to the
 * server and the page still renders its layout around the holes.
 *
 * The render root is still tried second: cover.png and ig-cover.png sit there
 * rather than in thumbs/, and the disk version had the same two candidates.
 */

import { getEnv } from "@factory-env";

export const runtime = "edge";

export async function GET(request, { params }) {
  const env = getEnv();
  if (!env?.QUEUE) return new Response("storage not bound", { status: 500 });

  const p = await params; // Next 15: params is a Promise
  // basename only, so a crafted id cannot walk out of the renders/ prefix
  const id = String(p.id).split("/").pop();
  const layout = String(p.layout).split("/").pop().replace(/[^a-zA-Z0-9._-]/g, "");
  if (!/\.(png|jpg|jpeg|webp)$/i.test(layout)) return new Response("not found", { status: 404 });

  for (const key of [`renders/${id}/thumbs/${layout}`, `renders/${id}/${layout}`]) {
    const obj = await env.QUEUE.get(key);
    if (!obj) continue;
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    if (!headers.get("content-type")) headers.set("content-type", "image/png");
    headers.set("cache-control", "public, max-age=3600");
    headers.set("etag", obj.httpEtag);
    return new Response(obj.body, { headers });
  }
  return new Response("not found", { status: 404 });
}
