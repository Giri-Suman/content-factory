import { NextResponse } from "next/server";
import { runCli } from "../../../lib/factory.js";

// POST {input, template?} -> drafts a script via the CLI, returns its id
export async function POST(request) {
  const { input, template } = await request.json();
  if (!input || typeof input !== "string") {
    return NextResponse.json({ ok: false, error: "missing input" }, { status: 400 });
  }
  const args = ["script", input];
  if (template) args.push("--template");
  const { code, out } = await runCli(args, 360000);

  const resultLine = out
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.startsWith("RESULT "));
  if (code !== 0 || !resultLine) {
    return NextResponse.json({ ok: false, error: out.slice(-1500) }, { status: 500 });
  }
  const result = JSON.parse(resultLine.slice(7));
  return NextResponse.json({ ok: true, ...result });
}
