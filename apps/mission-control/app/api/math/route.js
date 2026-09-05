/**
 * Math shorts — queued, because Manim needs the laptop.
 *
 * Rendering a Manim scene takes about 11 minutes and needs Python, LaTeX and
 * ffmpeg. None of that exists on Workers, so this queues and returns the job id
 * the UI already polls.
 */

import { getEnv } from "@factory-env";
import { actOn } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function POST(request) {
  const env = getEnv();
  const { topic, demo } = await request.json().catch(() => ({}));
  // the demo row is a fixed scene that needs no AI key; the topic row needs one,
  // and the laptop checks that when it runs rather than guessing from here
  const cmd = demo ? "math-demo" : "math";
  if (!demo && (!topic || typeof topic !== "string")) {
    return json({ ok: false, error: "missing topic" }, 400);
  }
  try {
    return json(await actOn(env, request, { cmd, arg: demo ? "" : topic, requestedBy: "portal" }));
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
