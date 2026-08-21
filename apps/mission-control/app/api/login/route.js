/**
 * Exchange the shared password for a session cookie.
 *
 * The cookie holds a hash, never the password, so a stolen cookie cannot be
 * replayed as the password anywhere else. httpOnly keeps it away from any script
 * on the page; sameSite=lax stops another site posting to the portal on your
 * behalf.
 *
 * PORTED TO THE EDGE: node:crypto's createHash/timingSafeEqual became Web Crypto
 * and a manual compare. The salt string is unchanged — `middleware.js` derives
 * the expected cookie the same way, and if these two ever disagree the symptom
 * is a login that "succeeds" and then bounces you straight back to /login.
 */

export const runtime = "edge";

const COOKIE = "factory_session";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function tokenFor(pw) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`content-factory::${pw}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time-ish compare, replacing timingSafeEqual. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(request) {
  const password = process.env.FACTORY_PASSWORD;
  if (!password) {
    return json({ ok: false, error: "no FACTORY_PASSWORD is set — the portal is already open" }, 400);
  }
  const { password: given } = await request.json().catch(() => ({}));
  if (!given) return json({ ok: false, error: "password required" }, 400);

  const expected = await tokenFor(password);
  if (!safeEqual(await tokenFor(given), expected)) {
    return json({ ok: false, error: "wrong password" }, 401);
  }
  // Pages is always HTTPS, so Secure is unconditional here — unlike the local
  // portal, which runs on http://localhost and would have the cookie dropped.
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "set-cookie": `${COOKIE}=${expected}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

/** Sign out. */
export async function DELETE() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json",
      "set-cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}
