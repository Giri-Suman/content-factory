import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { rendersDir } from "../../../../../lib/factory.js";

// Serves renders/<id>/thumbs/<layout>.png (and cover.png at the render root).
export function GET(_request, { params }) {
  const id = path.basename(params.id);
  const layout = path.basename(params.layout);
  const candidates = [
    path.join(rendersDir, id, "thumbs", layout),
    path.join(rendersDir, id, layout), // cover.png / ig-cover.png at root
  ];
  const filePath = candidates.find((p) => layout.endsWith(".png") && existsSync(p));
  if (!filePath) return new Response("not found", { status: 404 });
  return new Response(readFileSync(filePath), {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
  });
}
