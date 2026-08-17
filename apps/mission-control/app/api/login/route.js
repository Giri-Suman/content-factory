import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Exchange the shared password for a session cookie.
 *
 * The cookie holds a hash, never the password, so a stolen cookie cannot be
 * replayed as the password anywhere else. httpOnly keeps it away from any
 * script on the page; sameSite=lax stops another site posting to the portal on
 * your behalf.
 */

const COOKIE = "factory_session";
const tokenFor = (pw) => createHash("sha256").update(`content-factory::${pw}`).digest("hex");

export async function POST(request) {
  const password = process.env.FACTORY_PASSWORD;
  if (!password) {
    return NextResponse.json({ ok: false, error: "no FACTORY_PASSWORD is set — the portal is already open" }, { status: 400 });
  }
  const { password: given } = await request.json().catch(() => ({}));
  if (!given) return NextResponse.json({ ok: false, error: "password required" }, { status: 400 });

  const a = Buffer.from(tokenFor(given));
  const b = Buffer.from(tokenFor(password));
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ ok: false, error: "wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, tokenFor(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

/** Sign out. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
