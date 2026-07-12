import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { scriptsDir, readJson } from "../../../../lib/factory.js";

const safe = (id) => path.basename(id).replace(/[^a-z0-9-]/gi, "");

export async function GET(_req, { params }) {
  const id = safe(params.id);
  const file = path.join(scriptsDir, `${id}.json`);
  if (!existsSync(file)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const script = JSON.parse(readFileSync(file, "utf8"));
  const meta = readJson(path.join(scriptsDir, `${id}.meta.json`), null);
  return NextResponse.json({ script, meta });
}

export async function PUT(request, { params }) {
  const id = safe(params.id);
  const file = path.join(scriptsDir, `${id}.json`);
  if (!existsSync(file)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { script } = await request.json();
  if (!script || !Array.isArray(script.scenes)) {
    return NextResponse.json({ error: "invalid script" }, { status: 400 });
  }
  script.id = id; // the filename is the identity
  writeFileSync(file, JSON.stringify(script, null, 2));
  return NextResponse.json({ ok: true });
}
