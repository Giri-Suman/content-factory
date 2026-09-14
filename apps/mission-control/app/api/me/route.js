import { identityFromRequest } from "../../../lib/identity.js";

export const runtime = "edge";

export async function GET(request) {
  const identity = identityFromRequest(request);
  return new Response(JSON.stringify({ ok: true, user: identity }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
