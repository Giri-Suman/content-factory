/**
 * Serve a generated thumbnail from R2.
 */

import { getEnv } from "@factory-env";

export const runtime = process.env.FACTORY_TARGET === "pages" ? "edge" : "nodejs";

export async function GET(request, { params }) {
  const env = getEnv();
  if (!env?.QUEUE) return new Response("storage not bound", { status: 500 });
  const p = await params; // Next 15: params is a Promise
  const id = String(p.id).split("/").pop();
  const layout = String(p.layout).split("/").pop().replace(/[^a-z0-9._-]/gi, "");
  const obj = await env.QUEUE.get(`renders/${id}/${layout}`);
  if (!obj) return new Response("not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.get("content-type")) headers.set("content-type", "image/png");
  headers.set("cache-control", "public, max-age=3600");
  return new Response(obj.body, { headers });
}
