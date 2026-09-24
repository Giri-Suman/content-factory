/**
 * Refresh playbooks.
 *
 * Ported for the Workers runtime. The disk version spawned the CLI; this queues
 * the same command and answers with when the laptop will run it. Execution is
 * the only thing that changed - the work is identical, it just happens on the
 * machine that has ffmpeg rather than inside this request.
 */

import { getEnv } from "@factory-env";
import { actOn, readCollection, writeCollection } from "../../../lib/cloud.js";

export const runtime = "edge";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET() {
  const env = getEnv();
  const [playbooks, proposals, signals] = await Promise.all([
    readCollection(env, "playbooks"),
    readCollection(env, "playbookproposals"),
    readCollection(env, "playbooksignals"),
  ]);
  return json({
    playbooks,
    proposals: proposals.filter((p) => p.status === "pending"),
    signals: signals.filter((s) => !s.reviewed),
  });
}

/**
 * Which registry command each button means.
 *
 * The port dropped `action` entirely and enqueued one command whatever was
 * pressed, so every button on this page did the same thing. `null` marks an
 * action the registry has no row for - those are refused by name rather than
 * quietly running something else.
 */
export async function POST(request) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").trim();
  try {
    if (action === "refresh") return json(await actOn(env, request, { cmd: "playbook-refresh" }));
    if (action === "approve" || action === "reject") {
      const [proposals, playbooks] = await Promise.all([readCollection(env, "playbookproposals"), readCollection(env, "playbooks")]);
      const index = proposals.findIndex((item) => item.id === body.id && item.status === "pending");
      if (index < 0) return json({ ok: false, error: "unknown pending proposal" }, 404);
      const proposal = proposals[index];
      const now = new Date().toISOString();
      if (action === "approve") {
        const target = playbooks.findIndex((item) => item.platform === proposal.platform);
        if (target < 0) return json({ ok: false, error: "proposal platform is no longer available" }, 404);
        const current = playbooks[target];
        playbooks[target] = { ...current, [proposal.field]: proposal.proposed, updatedAt: now,
          history: [...(current.history || []), { field: proposal.field, from: current[proposal.field], to: proposal.proposed, evidence: proposal.evidence, source: proposal.source, at: now }].slice(-30) };
        await writeCollection(env, "playbooks", playbooks);
      }
      proposals[index] = { ...proposal, status: action === "approve" ? "approved" : "rejected", [action === "approve" ? "appliedAt" : "at"]: now };
      await writeCollection(env, "playbookproposals", proposals);
      return json({ ok: true, out: `Proposal ${action === "approve" ? "approved" : "rejected"}.` });
    }
    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: e.message }, 400);
  }
}
