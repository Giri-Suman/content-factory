import { NextResponse } from "next/server";
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { repoRoot } from "../../../lib/factory.js";

/**
 * Footage upload.
 *
 * Once the portal is reachable from anywhere, typing "D:\footage\take1.mp4" is
 * meaningless — that path only exists on the machine you were sitting at. The
 * capture lane (makeup, nails, screencasts) is exactly the workflow you want to
 * drive from a laptop or phone after filming, so uploads are what make remote
 * use real rather than nominal.
 *
 * SAFETY
 *  - the filename is REPLACED, never trusted. A name like "../../.env" would
 *    otherwise escape the folder, and an "x.mp4.exe" would sit on disk as an
 *    executable.
 *  - extension allowlist: only media this pipeline can actually process.
 *  - streamed to disk, so a large upload never sits in memory.
 *  - a size ceiling, because the disk here is small and a stuck upload
 *    shouldn't fill it.
 */

const FOOTAGE_DIR = path.join(repoRoot, "data", "footage");
const ALLOWED = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi", ".mp3", ".wav", ".m4a", ".png", ".jpg", ".jpeg"]);
const MAX_BYTES = 4 * 1024 * 1024 * 1024; // 4GB

const safeName = (original, prefix) => {
  const ext = path.extname(String(original || "")).toLowerCase();
  if (!ALLOWED.has(ext)) throw new Error(`"${ext || "no extension"}" isn't a media type this pipeline handles`);
  // the uploaded name is discarded entirely — only the extension survives
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const tag = String(prefix || "footage").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "footage";
  return `${tag}-${stamp}${ext}`;
};

export async function GET() {
  mkdirSync(FOOTAGE_DIR, { recursive: true });
  const files = readdirSync(FOOTAGE_DIR)
    .filter((f) => ALLOWED.has(path.extname(f).toLowerCase()))
    .map((f) => {
      const full = path.join(FOOTAGE_DIR, f);
      const st = statSync(full);
      return { name: f, path: full, bytes: st.size, at: st.mtime.toISOString() };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
  return NextResponse.json({ ok: true, dir: FOOTAGE_DIR, files });
}

export async function POST(request) {
  const form = await request.formData();
  const file = form.get("file");
  const label = form.get("label") || "footage";
  if (!file || typeof file === "string") {
    return NextResponse.json({ ok: false, error: "no file in the upload" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: `${(file.size / 1e9).toFixed(1)}GB is over the 4GB limit` }, { status: 413 });
  }

  let name;
  try {
    name = safeName(file.name, label);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }

  mkdirSync(FOOTAGE_DIR, { recursive: true });
  const dest = path.join(FOOTAGE_DIR, name);
  try {
    await pipeline(Readable.fromWeb(file.stream()), createWriteStream(dest));
  } catch (e) {
    if (existsSync(dest)) unlinkSync(dest); // never leave a half-written file for the editor to choke on
    return NextResponse.json({ ok: false, error: `upload failed: ${e.message}` }, { status: 500 });
  }

  const bytes = statSync(dest).size;
  return NextResponse.json({
    ok: true,
    name,
    path: dest,
    bytes,
    note: "paste this path into AI Cut, Reframe or Mine Shorts",
  });
}

export async function DELETE(request) {
  const name = new URL(request.url).searchParams.get("name");
  // basename strips any traversal — "../../x" can only ever delete "x" here
  const target = path.join(FOOTAGE_DIR, path.basename(String(name || "")));
  if (!name || !existsSync(target)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  unlinkSync(target);
  return NextResponse.json({ ok: true });
}
