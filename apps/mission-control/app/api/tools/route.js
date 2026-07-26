import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { repoRoot, runCli, startJob } from "../../../lib/factory.js";

const os = (name) => {
  const p = path.join(repoRoot, "data", "os", `${name}.json`);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8")).rows || [];
  } catch {
    return [];
  }
};

/** Fast, read-only tool output for the page's initial render. */
export async function GET(request) {
  const view = new URL(request.url).searchParams.get("view");
  if (view) {
    const map = {
      gaps: ["tools", "gaps"], repurpose: ["tools", "repurpose"], competitors: ["tools", "competitors"],
      calendar: ["tools", "calendar", "14"], health: ["health"], prune: ["prune"], niche: ["tools", "niche"],
    };
    const args = map[view];
    if (!args) return NextResponse.json({ ok: false, error: "unknown view" }, { status: 400 });
    const { out } = await runCli(args, 120000);
    return NextResponse.json({ ok: true, text: out });
  }
  return NextResponse.json({
    ctas: os("ctas"),
    replyDrafts: os("commentleads").filter((l) => l.replyDraft && !l.used),
    titleTests: os("titletests"),
    renders: (() => {
      const dir = path.join(repoRoot, "renders");
      if (!existsSync(dir)) return [];
      try {
        return readdirSync(dir)
          .filter((d) => existsSync(path.join(dir, d, "short.mp4")))
          .slice(-12);
      } catch {
        return [];
      }
    })(),
  });
}

// POST {action, arg} — anything that writes or costs time runs as a job/CLI
export async function POST(request) {
  const { action, arg, arg2 } = await request.json();
  const jobs = {
    batch: ["batch", String(arg || 3)],
    longform: ["longform", String(arg || ""), String(arg2 || 3)],
    reframe: ["reframe", String(arg || ""), `--focus=${arg2 || "auto"}`],
  };
  if (jobs[action]) {
    const job = startJob(action, jobs[action]);
    return NextResponse.json({ ok: true, jobId: job.id });
  }
  const quick = {
    captions: ["tools", "captions", String(arg || "")],
    chapters: ["tools", "chapters", String(arg || "")],
    description: ["tools", "description", String(arg || ""), String(arg2 || "")],
    teleprompter: ["tools", "teleprompter", String(arg || "")],
    replies: ["tools", "replies", "10"],
    cta: ["tools", "cta", "next", String(arg || "yt_short")],
    prune: ["prune", ...(arg === "apply" ? ["--apply"] : [])],
    translate: ["tools", "translate", String(arg || ""), ...String(arg2 || "es hi").split(/\s+/)],
    pacing: ["tools", "pacing", String(arg || "")],
    link: ["tools", "link", String(arg || "video")],
    stock: ["tools", "stock", String(arg || ""), ...(arg2 === "music" ? ["--music"] : arg2 === "photo" ? ["--photo"] : [])],
    nichepack: ["tools", "niche", String(arg || "")],
  };
  const args = quick[action];
  if (!args) return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  const { code, out } = await runCli(args, 1000 * 60 * 4);
  return NextResponse.json({ ok: code === 0, text: out.replace(/RESULT \{.*\}/s, "").trim() }, { status: code === 0 ? 200 : 500 });
}
