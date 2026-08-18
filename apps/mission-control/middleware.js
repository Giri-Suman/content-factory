import { NextResponse } from "next/server";

/**
 * Gate for every route.
 *
 * This portal executes shell commands, spends API credit, and reads your
 * content pipeline. On localhost that is fine — it is your machine. Exposed to
 * the internet without this, anyone who finds the URL can run 39 commands on
 * your host and burn your OpenRouter balance.
 *
 * Deliberately simple: one shared password in FACTORY_PASSWORD, exchanged for
 * a signed cookie. A single-operator tool does not need accounts, and a real
 * auth provider would be more moving parts to get wrong.
 *
 * If FACTORY_PASSWORD is unset the portal stays open — that is correct for
 * localhost and is exactly why the deploy guide makes setting it step one. The
 * banner in Settings says which mode you are in, so "open" is never a surprise.
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

export async function middleware(request) {
  const password = process.env.FACTORY_PASSWORD;

  // No password configured → local mode, everything open.
  if (!password) return noRobots(NextResponse.next());

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
  if (got && safeEqual(got, expected)) return noRobots(NextResponse.next());

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
