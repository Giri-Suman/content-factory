/**
 * Password gate for the whole portal.
 *
 * WHY: factory.coderfact.com can queue work onto a real laptop and shows the
 * brief pipeline. It was reachable by anyone with the URL. This is the same
 * shape as the local portal's gate - one shared password exchanged for a cookie
 * holding a hash - because a single-operator tool does not need accounts and a
 * real identity provider is more moving parts to get wrong.
 *
 * THE PASSWORD IS NEVER IN THIS FILE. The repo is public. It comes from the
 * `PORTAL_PASSWORD` environment variable set on the Pages project, and if that
 * is unset the portal stays OPEN - stated plainly on the page rather than
 * failing shut, because a gate that silently blocks everything is
 * indistinguishable from a broken deploy.
 *
 * `/api/login` MUST stay reachable, or the gate locks you out of itself: the
 * login request needs a session to succeed, and a session requires logging in.
 * That exact bug bit the local portal, and it is why this is a comment and not a
 * thing to rediscover.
 */

const COOKIE = "factory_portal";

/** Hash the password so the cookie never carries it. */
async function tokenFor(password) {
  const data = new TextEncoder().encode(`content-factory-portal::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time-ish compare so response timing does not leak the password. */
function safeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

const LOGIN_PAGE = (msg) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Content Factory</title>
<style>
  :root{--bg:#0d1117;--panel:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#ffb224}
  @media (prefers-color-scheme:light){:root{--bg:#fff;--panel:#f6f8fa;--border:#d0d7de;--text:#1f2328;--muted:#656d76}}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);
    font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
  form{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:26px 28px;width:min(92vw,340px)}
  h1{font-size:17px;margin:0 0 4px}
  p{color:var(--muted);font-size:12.5px;margin:0 0 16px}
  input{width:100%;box-sizing:border-box;background:var(--bg);color:var(--text);border:1px solid var(--border);
    border-radius:8px;padding:10px 12px;font:inherit;margin-bottom:10px}
  button{width:100%;background:var(--accent);color:#0d1117;border:0;border-radius:8px;padding:10px;
    font:inherit;font-weight:600;cursor:pointer}
  .err{color:#f85149;font-size:12.5px;margin-bottom:10px}
</style></head><body>
<form method="POST" action="/api/login">
  <h1>Content Factory</h1>
  <p>Queues work onto a real machine. Password required.</p>
  ${msg ? `<div class="err">${msg}</div>` : ""}
  <input type="password" name="password" placeholder="Password" autofocus required>
  <button>Enter</button>
</form>
</body></html>`;

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // No password configured -> open. Correct for a fresh deploy, and the page
  // says so rather than pretending to be secure.
  if (!env.PORTAL_PASSWORD) return next();

  const expected = await tokenFor(env.PORTAL_PASSWORD);

  /* The login endpoint itself. Must be handled BEFORE the cookie check. */
  if (url.pathname === "/api/login") {
    if (request.method !== "POST") {
      return new Response(LOGIN_PAGE(""), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    const form = await request.formData().catch(() => null);
    const given = form?.get("password") ?? "";
    if (String(given) !== String(env.PORTAL_PASSWORD)) {
      return new Response(LOGIN_PAGE("Wrong password."), {
        status: 401,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/",
        // 30 days so this is not a daily chore. httpOnly so script cannot read
        // it; Secure because Pages is always HTTPS.
        "Set-Cookie": `${COOKIE}=${expected}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  const cookie = request.headers.get("cookie") || "";
  const got = cookie.match(new RegExp(`${COOKIE}=([a-f0-9]+)`))?.[1];
  if (got && safeEqual(got, expected)) return next();

  /* An API call gets JSON, not an HTML login page - a fetch that receives a
     login form fails in a way nobody can read. */
  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ ok: false, error: "not signed in" }), {
      status: 401,
      headers: { "content-type": "application/json", "x-robots-tag": "noindex" },
    });
  }
  return new Response(LOGIN_PAGE(""), { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
}
