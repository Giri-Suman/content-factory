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

export async function GET() {
  // ranked list comes from the CLI so the ranking math lives in ONE place (ideaBank.js)
  const { code, out } = await runCli(["ideabank", "rank", "--json"], 60000);
  const line = out.split(/\r?\n/).reverse().find((l) => l.startsWith("RESULT "));
  const ranked = code === 0 && line ? JSON.parse(line.slice(7)) : os("ideabank");
  return NextResponse.json({
    ideas: ranked,
    series: os("series"),
    recentPillars: os("myposts")
      .filter((m) => m.pillar && m.postedAt && Date.now() - new Date(m.postedAt).getTime() < 14 * 864e5)
      .map((m) => m.pillar),
  });
}

// POST {action:"sync"} | {action:"brief", ideaId} | {action:"seriesCreate", name} | {action:"seriesAdd", seriesId, ideaId}
export async function POST(request) {
  const { action, ideaId, seriesId, name } = await request.json();
  if (action === "sync") {
    const { code, out } = await runCli(["ideabank", "sync"], 240000);
    return NextResponse.json({ ok: code === 0, out: out.slice(-300) });
  }
  if (action === "brief" && ideaId) {
    const { code, out } = await runCli(["ideabank", "brief", ideaId], 240000);
    return NextResponse.json({ ok: code === 0, out: out.slice(-400) }, { status: code === 0 ? 200 : 500 });
  }
  if (action === "seriesCreate" && name) {
    const { code, out } = await runCli(["ideabank", "series", "create", name], 60000);
    return NextResponse.json({ ok: code === 0, out: out.slice(-200) });
  }
  if (action === "seriesAdd" && seriesId && ideaId) {
    const { code, out } = await runCli(["ideabank", "series", "add", seriesId, ideaId], 60000);
    return NextResponse.json({ ok: code === 0, out: out.slice(-200) });
  }
  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
