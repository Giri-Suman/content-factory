import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { repoRoot, runCli } from "../../../lib/factory.js";

const STORE = path.join(repoRoot, "data", "os", "wishlist.json");

const read = () => {
  if (!existsSync(STORE)) return [];
  try {
    return JSON.parse(readFileSync(STORE, "utf8")).rows || [];
  } catch {
    return [];
  }
};

export async function GET() {
  const rows = read().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const envPath = path.join(repoRoot, ".env");
  const env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  return NextResponse.json({
    entries: rows,
    hasYtKey: /^\s*YOUTUBE_API_KEY\s*=\s*\S/m.test(env),
  });
}

// POST {url} (YouTube) | {manual:{...}} | {action:"poll"} — all via the CLI (never import factory packages here)
export async function POST(request) {
  const body = await request.json();

  if (body.action === "poll") {
    const { code, out } = await runCli(["wishlist", "poll"], 180000);
    return NextResponse.json({ ok: code === 0, out: out.slice(-300) });
  }

  if (body.manual) {
    const tmpDir = path.join(repoRoot, "data", "os");
    mkdirSync(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, `manual-${Date.now()}.tmp.json`);
    writeFileSync(tmp, JSON.stringify(body.manual));
    const { code, out } = await runCli(["wishlist", "manual", tmp], 180000);
    return code === 0
      ? NextResponse.json({ ok: true, out })
      : NextResponse.json({ ok: false, error: out.slice(-300) }, { status: 500 });
  }

  if (body.url) {
    const { code, out } = await runCli(["wishlist", "add", body.url], 180000);
    return code === 0
      ? NextResponse.json({ ok: true, out })
      : NextResponse.json({ ok: false, error: out.slice(-300) }, { status: 500 });
  }

  return NextResponse.json({ ok: false, error: "missing url / manual / action" }, { status: 400 });
}

// DELETE — direct JSON rewrite (same convention as writeConfig in lib/factory.js)
export async function DELETE(request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const rows = read().filter((r) => r.id !== id);
  writeFileSync(STORE, JSON.stringify({ updatedAt: new Date().toISOString(), rows }, null, 2));
  return NextResponse.json({ ok: true });
}
