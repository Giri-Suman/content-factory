import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { rendersDir } from "../../../../../lib/factory.js";

// Streams renders/<id>/<file>.mp4 with Range support so <video> can seek.
export async function GET(request, { params }) {
  const id = path.basename(params.id);
  const file = path.basename(params.file);
  const filePath = path.join(rendersDir, id, file);
  if (!file.endsWith(".mp4") || !existsSync(filePath)) {
    return new Response("not found", { status: 404 });
  }

  const size = statSync(filePath).size;
  const range = request.headers.get("range");

  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = m?.[1] ? parseInt(m[1], 10) : 0;
    const end = m?.[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    if (start >= size) return new Response(null, { status: 416 });
    const stream = Readable.toWeb(createReadStream(filePath, { start, end }));
    return new Response(stream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": "video/mp4",
      },
    });
  }

  return new Response(Readable.toWeb(createReadStream(filePath)), {
    status: 200,
    headers: {
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Content-Type": "video/mp4",
    },
  });
}
