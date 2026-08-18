import { NextResponse } from "next/server";
import { runCli, startJob } from "../../../lib/factory.js";
import { COMMANDS, argvFor, keyOf } from "../../../../../packages/shared/src/commands.js";

/**
 * The one endpoint that runs a factory command.
 *
 * Replaces ~20 bespoke routes that each hardcoded their own argv and between
 * them still left 17 commands unreachable from the portal. Adding a row to the
 * registry now makes a command clickable; there is no second place to update.
 *
 * SAFETY: it will only run rows that exist in the registry, and it builds argv
 * from the row rather than from the request. The client sends a KEY and an
 * optional single input — never a command line. That means a crafted request
 * cannot invent flags, chain shell syntax, or reach a command the registry
 * does not list.
 */

const byKey = new Map(COMMANDS.map((c) => [keyOf(c), c]));

export async function GET() {
  // the catalog, so the UI never hardcodes a command
  return NextResponse.json({
    ok: true,
    commands: COMMANDS.map((c) => ({
      key: keyOf(c),
      id: c.id,
      label: c.label,
      desc: c.desc,
      stage: c.stage,
      cat: c.cat,
      argKind: c.argKind || null,
      argLabel: c.argLabel || null,
      primary: Boolean(c.primary),
      slow: Boolean(c.slow),
      danger: c.danger || null,
    })),
  });
}

export async function POST(request) {
  const { key, input = "" } = await request.json();
  const cmd = byKey.get(key);
  if (!cmd) return NextResponse.json({ ok: false, error: `unknown command "${key}"` }, { status: 400 });

  let argv;
  try {
    argv = argvFor(cmd, input);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }

  // Long jobs stream into the job log; quick reads answer inline so the UI
  // does not have to poll for a two-second command.
  if (cmd.slow) {
    const job = startJob(cmd.id, argv);
    return NextResponse.json({ ok: true, jobId: job.id, mode: "job" });
  }
  const { out } = await runCli(argv, 180000);
  return NextResponse.json({ ok: true, text: out, mode: "inline" });
}
