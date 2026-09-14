import { NextResponse } from "next/server";
import { getEnv } from "@factory-env";
import { accessConfig, verifyAccessToken } from "./lib/access.js";
import { AUTH_MODE_HEADER, USER_EMAIL_HEADER, USER_ROLE_HEADER } from "./lib/identity.js";

/**
 * Gate for every route.
 *
 * This portal executes shell commands, spends API credit, and reads your
 * content pipeline. On localhost that is fine — it is your machine. Exposed to
 * the internet without this, anyone who finds the URL can run 39 commands on
 * your host and burn your OpenRouter balance.
 *
 * Remote deployments use Cloudflare Access identities. A shared-password mode
 * remains available for local/LAN use, and an entirely unconfigured portal is
 * open only on loopback. That last rule matters: a missed Pages variable must
 * fail closed instead of silently exposing the command surface.
 */

const COOKIE = "factory_session";

/**
 * Keep this host out of search results entirely.
 *
 * The gate already stops crawlers reaching anything real — they get a 307. But
 * /login itself answers 200 and is crawlable, so without this the portal can be
 * indexed under its own subdomain. That does not affect the root domain's
 * ranking (search engines judge subdomains separately, and a subdomain being
 * offline while this laptop sleeps costs the root nothing), it is simply not a
 * page anyone should be able to find.
 *
 * Set on EVERY response, including redirects and 401s — a header only on the
 * protected routes would miss the one page that is actually reachable.
 */
function noRobots(res) {
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return res;
}

function requestWithIdentity(request, { email, role, mode }) {
  const headers = new Headers(request.headers);
  // These values are trusted only when set here. Delete anything supplied by
  // the browser before inserting the verified identity.
  headers.delete(USER_EMAIL_HEADER);
  headers.delete(USER_ROLE_HEADER);
  headers.delete(AUTH_MODE_HEADER);
  headers.set(USER_EMAIL_HEADER, email);
  headers.set(USER_ROLE_HEADER, role);
  headers.set(AUTH_MODE_HEADER, mode);
  return noRobots(NextResponse.next({ request: { headers } }));
}

function denied(request, message, status = 401) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return noRobots(NextResponse.json({ ok: false, error: message }, { status }));
  }
  return noRobots(new NextResponse(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } }));
}

/** Constant-time-ish compare so the response time does not leak the password. */
function safeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

async function tokenFor(password) {
  // HMAC-ish: the cookie value is a hash of the password + a fixed salt, so the
  // password itself is never stored in the browser.
  const data = new TextEncoder().encode(`content-factory::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Pages bindings live on getRequestContext().env, while local Next builds read
 * process.env. Keep the lookup in one place so Access cannot accidentally look
 * configured in one runtime and absent in the other.
 */
function runtimeEnv() {
  const local = typeof process !== "undefined" ? process.env : {};
  try {
    return { ...local, ...(getEnv() || {}) };
  } catch {
    return local;
  }
}

const isLoopback = (hostname) => {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
};

export async function middleware(request) {
  const env = runtimeEnv();
  const password = env.FACTORY_PASSWORD;

  let cfAccess;
  try {
    cfAccess = accessConfig(env);
  } catch (e) {
    return denied(request, e.message, 503);
  }

  if (cfAccess) {
    const token = request.headers.get("cf-access-jwt-assertion");
    if (!token) return denied(request, "Cloudflare Access authentication required");
    try {
      const claims = await verifyAccessToken(token, cfAccess);
      const owner = String(env.FACTORY_OWNER_EMAIL || "").trim().toLowerCase();
      const role = owner && claims.email === owner ? "owner" : "member";
      if (request.nextUrl.pathname === "/login") {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.search = "";
        return noRobots(NextResponse.redirect(url));
      }
      return requestWithIdentity(request, { email: claims.email, role, mode: "cloudflare-access" });
    } catch (e) {
      return denied(request, e.message || "Cloudflare Access authentication failed");
    }
  }

  // An unconfigured deployment is safe only on this machine. Pages must have
  // Access or a password before it serves any page or API route.
  if (!password) {
    if (!isLoopback(request.nextUrl.hostname)) {
      return denied(request, "Family access is not configured for this deployment.", 503);
    }
    const email = String(env.FACTORY_OWNER_EMAIL || "local-owner").trim().toLowerCase();
    return requestWithIdentity(request, { email, role: "owner", mode: "local" });
  }

  const { pathname } = request.nextUrl;
  /**
   * `/api/login` MUST be exempt or the gate locks you out of itself: the login
   * request needs a session to succeed, and you cannot get a session without
   * logging in. The first auth test hit exactly this — a wrong-password attempt
   * came back "not signed in" instead of "wrong password".
   */
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    // robots.txt must be readable WITHOUT a session or no crawler can obey it —
    // a gated robots.txt is the same as having none.
    pathname === "/robots.txt" ||
    pathname === "/login" ||
    pathname === "/api/login"
  ) {
    return noRobots(NextResponse.next());
  }

  const expected = await tokenFor(password);
  const got = request.cookies.get(COOKIE)?.value;
  if (got && safeEqual(got, expected)) {
    const email = String(env.FACTORY_OWNER_EMAIL || "owner").trim().toLowerCase();
    return requestWithIdentity(request, { email, role: "owner", mode: "password" });
  }

  // API calls get a 401 rather than an HTML redirect, so a fetch fails loudly
  if (pathname.startsWith("/api/")) {
    return noRobots(NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 }));
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return noRobots(NextResponse.redirect(url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
