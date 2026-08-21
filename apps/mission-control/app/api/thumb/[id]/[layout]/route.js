/**
 * Serve a generated thumbnail from R2.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

export async function GET(request, { params }) {
  const { env } = getRequestContext();
  if (!env?.QUEUE) return new Response("storage not bound", { status: 500 });
  const id = String(params.id).split("/").pop();
  const layout = String(params.layout).split("/").pop().replace(/[^a-z0-9._-]/gi, "");
  const obj = await env.QUEUE.get(`renders/${id}/${layout}`);
  if (!obj) return new Response("not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.get("content-type")) headers.set("content-type", "image/png");
  headers.set("cache-control", "public, max-age=3600");
  return new Response(obj.body, { headers });
}
