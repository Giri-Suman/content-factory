import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { repoRoot, runCli, envSet } from "../../../lib/factory.js";

const STORE = path.join(repoRoot, "data", "os", "publishitems.json");

const read = () => {
  if (!existsSync(STORE)) return [];
  try {
    return JSON.parse(readFileSync(STORE, "utf8")).rows || [];
  } catch {
    return [];
  }
};

export async function GET() {
  return NextResponse.json({
    items: read().sort((a, b) => (a.scheduledFor || "z").localeCompare(b.scheduledFor || "z")),
    ytOauth: envSet("YT_REFRESH_TOKEN"),
    autoMode: envSet("PUBLISH_MODE") && envSet("YOUTUBE_APP_VERIFIED"),
  });
}

// POST — API-touching actions go through the CLI; pure-state toggles edit JSON directly
export async function POST(request) {
  const { action, briefId, itemId, file, kind, url } = await request.json();

  if (action === "send" && briefId) {
    const { code, out } = await runCli(["center", "send", briefId], 60000);
    return NextResponse.json({ ok: code === 0, out: out.slice(-300) }, { status: code === 0 ? 200 : 500 });
  }
  if (action === "attach" && itemId && file) {
    const args = ["center", "attach", itemId, file];
    if (kind === "thumb") args.push("--thumb");
    const { code, out } = await runCli(args, 60000);
    return NextResponse.json({ ok: code === 0, out: out.slice(-300) }, { status: code === 0 ? 200 : 500 });
  }
  if (action === "publish" && itemId) {
    const { code, out } = await runCli(["center", "publish", itemId], 1000 * 60 * 20);
    return NextResponse.json({ ok: code === 0, out: out.slice(-400) }, { status: code === 0 ? 200 : 500 });
  }
  if (action === "live" && itemId) {
    const args = ["center", "live", itemId];
    if (url) args.push(url);
    const { code, out } = await runCli(args, 60000);
    return NextResponse.json({ ok: code === 0, out: out.slice(-300) }, { status: code === 0 ? 200 : 500 });
  }
  if (action === "golden" && itemId) {
    const rows = read();
    const i = rows.findIndex((r) => r.id === itemId);
    if (i === -1) return NextResponse.json({ ok: false }, { status: 404 });
    rows[i].golden60Done = !rows[i].golden60Done;
    writeFileSync(STORE, JSON.stringify({ updatedAt: new Date().toISOString(), rows }, null, 2));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
