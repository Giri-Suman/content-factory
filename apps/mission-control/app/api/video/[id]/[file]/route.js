import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { rendersDir } from "../../../../../lib/factory.js";

/**
 * File -> web stream, safe when the client goes away mid-transfer.
 *
 * `Readable.toWeb()` cannot be used here: when a browser aborts a request the
 * controller closes while the fs ReadStream is still emitting, and the adapter's
 * enqueue throws ERR_INVALID_STATE as an UNCAUGHT exception. That is fatal in
 * production — Node exits on uncaughtException by default, so opening the
 * Renders page (38 <video preload="metadata"> elements, each aborting after the
 * header) would take the portal down.
 *
 * Aborts are normal traffic for video, not an error worth surfacing: every seek
 * and every metadata probe is one. So enqueue defensively, and destroy the fs
 * handle on cancel so they are not leaked.
 */
function fileStream(filePath, range) {
  const rs = createReadStream(filePath, range);
  return new ReadableStream({
    start(controller) {
      rs.on("data", (chunk) => {
        try {
          controller.enqueue(chunk);
          // Respect backpressure — without this a large file buffers in memory.
          if (controller.desiredSize !== null && controller.desiredSize <= 0) rs.pause();
        } catch {
          rs.destroy(); // controller already closed: the client left
        }
      });
      rs.on("end", () => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
      rs.on("error", (err) => {
        try {
          controller.error(err);
        } catch {
          /* already closed */
        }
      });
    },
    pull() {
      rs.resume();
    },
    cancel() {
      rs.destroy();
    },
  });
}

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

  // ?download=1 forces a save dialog instead of inline playback. The filename
  // is prefixed with the render id because every folder contains a "short.mp4"
  // and a downloads folder full of them is useless.
  const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
  const disposition = wantsDownload ? { "Content-Disposition": `attachment; filename="${id}-${file}"` } : {};

  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = m?.[1] ? parseInt(m[1], 10) : 0;
    const end = m?.[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    if (start >= size) return new Response(null, { status: 416 });
    return new Response(fileStream(filePath, { start, end }), {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": "video/mp4",
        ...disposition,
      },
    });
  }

  return new Response(fileStream(filePath), {
    status: 200,
    headers: {
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Content-Type": "video/mp4",
      ...disposition,
    },
  });
}
