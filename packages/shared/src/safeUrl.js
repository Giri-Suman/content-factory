import { lookup } from "node:dns/promises";
import net from "node:net";
import path from "node:path";
import { repoRoot } from "./config.js";

/**
 * SSRF guard for anything that fetches a user-supplied URL.
 *
 * Verified before this existed: `capture url http://169.254.169.254/…`
 * screenshotted the cloud instance-metadata endpoint. On most providers that
 * endpoint serves credentials, so a public deployment of this portal would
 * have handed them to anyone who found the URL.
 *
 * The check has to happen AFTER DNS resolution, not on the hostname string —
 * an attacker controls their own DNS, so `evil.com` can simply resolve to
 * 169.254.169.254. Checking the literal host would catch nothing.
 *
 * (A determined attacker can still race DNS between this check and the fetch.
 * Closing that fully needs a proxy that pins the resolved IP; blocking the
 * whole private space removes the realistic attack, and the portal is
 * authenticated on top.)
 */

const BLOCKED_V4 = [
  [0, 8], // 0.0.0.0/8 "this network"
  [10, 8], // private
  [127, 8], // loopback
  [169, 16, 254], // 169.254/16 link-local — cloud metadata lives here
  [172, 12], // 172.16/12 private
  [192, 16, 168], // 192.168/16 private
  [100, 10], // 100.64/10 carrier NAT
];

function isBlockedV4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
  if (p[0] === 169 && p[1] === 254) return true; // metadata
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
  if (p[0] >= 224) return true; // multicast / reserved
  return false;
}

const isBlockedV6 = (ip) => {
  const s = ip.toLowerCase();
  return (
    s === "::1" || // loopback
    s.startsWith("fe80") || // link-local
    s.startsWith("fc") || s.startsWith("fd") || // unique-local
    s.startsWith("::ffff:") // v4-mapped — check the embedded v4 instead
  );
};

/**
 * @returns the URL, or throws with a reason.
 * Only http/https are allowed off-machine. file:// is permitted but confined to
 * this repo, so a deployed portal cannot read arbitrary host files.
 */
export async function assertSafeUrl(raw) {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    throw new Error(`not a valid URL: ${String(raw).slice(0, 80)}`);
  }

  if (u.protocol === "file:") {
    const p = path.resolve(decodeURIComponent(u.pathname.replace(/^\//, "")));
    if (!p.startsWith(path.resolve(repoRoot))) {
      throw new Error("file:// is limited to this project's own folder");
    }
    return u.href;
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`blocked protocol "${u.protocol}" — only http(s) and project-local file:// are allowed`);
  }

  const host = u.hostname;
  if (/^(localhost|.*\.localhost|.*\.internal|.*\.local)$/i.test(host)) {
    throw new Error(`blocked host "${host}" — internal names are not fetchable`);
  }

  // literal IP in the URL
  if (net.isIP(host)) {
    const bad = net.isIP(host) === 4 ? isBlockedV4(host) : isBlockedV6(host);
    if (bad) throw new Error(`blocked address ${host} — private, loopback or link-local`);
    return u.href;
  }

  // resolve, then judge the ADDRESS — an attacker controls their own DNS
  let addrs;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error(`could not resolve "${host}"`);
  }
  for (const a of addrs) {
    const bad = a.family === 4 ? isBlockedV4(a.address) : isBlockedV6(a.address);
    if (bad) {
      throw new Error(
        `"${host}" resolves to ${a.address}, which is private/link-local. ` +
          `Blocked — this is how a public portal gets tricked into reading cloud instance metadata.`
      );
    }
  }
  return u.href;
}
