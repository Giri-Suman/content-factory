import http from "node:http";
import { spawn } from "node:child_process";
import { loadEnv } from "../../shared/src/config.js";

/**
 * One-time YouTube OAuth via the loopback flow: YOU approve in your browser,
 * Google redirects to localhost with a code, we exchange it for a refresh
 * token and print it. We never see or handle your Google password.
 *
 * Prereqs (your homework): a Google Cloud project with YouTube Data API v3
 * enabled and a Desktop OAuth client -> put YT_CLIENT_ID + YT_CLIENT_SECRET
 * in .env, add http://localhost:4711 as an authorized redirect URI.
 */

const PORT = 4711;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
].join(" ");

const openBrowser = (url) => {
  // start "" so the URL isn't parsed as a window title on Windows
  spawn("cmd", ["/c", "start", "", url], { windowsHide: true, detached: true }).unref();
};

export async function authYoutube() {
  loadEnv();
  const { YT_CLIENT_ID, YT_CLIENT_SECRET } = process.env;
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET) {
    console.error("set YT_CLIENT_ID and YT_CLIENT_SECRET in .env first.");
    console.error("Google Cloud Console -> APIs & Services -> Credentials -> Create OAuth client (Desktop).");
    console.error(`Add ${REDIRECT} as an authorized redirect URI.`);
    return false;
  }

  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: YT_CLIENT_ID,
      redirect_uri: REDIRECT,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
    });

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT);
      const c = url.searchParams.get("code");
      const err = url.searchParams.get("error");
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        `<body style="font-family:sans-serif;background:#0d1117;color:#e6edf3;padding:60px;text-align:center"><h2>${
          c ? "Authorized — you can close this tab." : "Auth failed: " + err
        }</h2></body>`
      );
      server.close();
      c ? resolve(c) : reject(new Error(err || "no code"));
    });
    server.listen(PORT, () => {
      console.log(`\nopening your browser to approve access...`);
      console.log(`if it doesn't open, visit:\n${authUrl}\n`);
      openBrowser(authUrl);
    });
    setTimeout(() => {
      server.close();
      reject(new Error("timed out waiting for authorization (5 min)"));
    }, 300000);
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: YT_CLIENT_ID,
      client_secret: YT_CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    console.error(`token exchange failed ${tokenRes.status}: ${(await tokenRes.text()).slice(0, 300)}`);
    return false;
  }
  const tokens = await tokenRes.json();
  if (!tokens.refresh_token) {
    console.error("no refresh_token returned — revoke prior access at myaccount.google.com/permissions and retry");
    return false;
  }
  console.log("\n✓ authorized. Add this line to .env:\n");
  console.log(`YT_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  return true;
}
