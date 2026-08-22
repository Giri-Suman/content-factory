/**
 * Packaging helpers - captions, chapters, silent cut.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";
export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

import { enqueue, queuedMessage, listRenders, readCollection } from "../../../lib/cloud.js";

/**
 * The Tools page.
 *
 * Without ?view= this is a plain read. With one, the disk version ran a CLI
 * command inline and returned its stdout; those are now registry rows, so the
 * view queues and the page shows when it will run instead of blocking on a
 * command that cannot execute here.
 */
const VIEWS = {
  gaps: "tools-gaps",
  repurpose: "tools-repurpose",
  competitors: "tools-competitors",
  calendar: "tools-calendar",
  niche: "tools-niche",
  health: "health",
  prune: "prune",
  humanize: "humanize-audit",
};

export async function GET(request) {
  const { env } = getRequestContext();
  const view = new URL(request.url).searchParams.get("view");

  if (view) {
    const cmd = VIEWS[view];
    if (!cmd) return json({ ok: false, error: `unknown view "${view}"` }, 400);
    try {
      const r = await enqueue(env, { cmd, arg: "", requestedBy: "portal" });
      return json({ ok: true, queued: true, text: queuedMessage(r) });
    } catch (e) {
      return json({ ok: false, error: e.message }, 400);
    }
  }

  const [ctas, leads, titleTests, renders] = await Promise.all([
    readCollection(env, "ctas"),
    readCollection(env, "commentleads"),
    readCollection(env, "titletests"),
    listRenders(env),
  ]);
  return json({
    ctas,
    replyDrafts: leads.filter((l) => l.replyDraft && !l.used),
    titleTests,
    // the disk version listed directories holding a short.mp4; same test,
    // against the bucket both machines push to
    renders: renders.filter((r) => r.files.some((f) => f.name.endsWith("short.mp4"))).slice(0, 12).map((r) => r.id),
  });
}

export async function POST(request) {
  const { env } = getRequestContext();
  const body = await request.json().catch(() => ({}));
  try {
    const r = await enqueue(env, { cmd: "tools-captions", arg: String(body.renderId || body.id || "").trim(), requestedBy: body.requestedBy || "portal" });
    return json({ ok: true, queued: true, id: r.record.id, message: queuedMessage(r) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}

