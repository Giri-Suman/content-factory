import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { repoRoot, runCli } from "../../../lib/factory.js";

const os = (name) => {
  const p = path.join(repoRoot, "data", "os", `${name}.json`);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8")).rows || [];
  } catch {
    return [];
  }
};

export function GET() {
  const thumbs = os("thumbnails").map((t) => ({
    briefId: t.briefId,
    renderId: `brief-${t.briefId.slice(0, 10)}`,
    variants: (t.variants || []).map((v) => v.layout),
    judged: t.judged || [],
    copy: t.copy,
    at: t.at,
  }));
  return NextResponse.json({ thumbnails: thumbs.sort((a, b) => (b.at || "").localeCompare(a.at || "")) });
}

// POST {briefId} -> (re)generate + judge thumbnails
export async function POST(request) {
  const { briefId } = await request.json();
  if (!briefId) return NextResponse.json({ ok: false, error: "missing briefId" }, { status: 400 });
  const { code, out } = await runCli(["thumbnails", briefId], 120000);
  return NextResponse.json({ ok: code === 0, out: out.slice(-300) }, { status: code === 0 ? 200 : 500 });
}
