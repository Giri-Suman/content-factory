import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { repoRoot, runCli } from "../../../lib/factory.js";

const os = (name) => {
  const p = path.join(repoRoot, "data", "os", `${name}.json`);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8")).rows || [];
  } catch {
    return [];
  }
};

// GET -> everything the Today command center needs in one call
export async function GET() {
  const clusters = os("clusters").sort((a, b) => b.opportunityScore - a.opportunityScore);
  const briefs = os("briefs");
  const jobruns = os("jobruns");

  // rising-fast: biggest positive score delta between the last two runs
  const rising = clusters
    .map((c) => {
      const h = c.scoreHistory || [];
      return { ...c, delta: h.length >= 2 ? h[h.length - 1] - h[h.length - 2] : 0 };
    })
    .filter((c) => c.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);

  // watchlist outliers this week
  const channels = new Map(os("watchchannels").map((c) => [c.id, c.title]));
  const weekAgo = Date.now() - 7 * 864e5;
  const outliers = os("watchvideos")
    .filter((v) => v.outlierRatio >= 3 && v.publishedAt && new Date(v.publishedAt).getTime() >= weekAgo)
    .map((v) => ({ ...v, channelTitle: channels.get(v.channelId) || "?" }))
    .sort((a, b) => b.outlierRatio - a.outlierRatio)
    .slice(0, 8);

  const lastCollect = jobruns.filter((j) => j.job === "collect").sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const today = new Date().toISOString().slice(0, 10);
  const digest = os("digests").find((r) => r.date === today) || null;

  // P14 Make Next: top-3 ranked ideas (ranking math lives in ideaBank.js via the CLI)
  let makeNext = [];
  try {
    const { code, out } = await runCli(["ideabank", "rank", "--json"], 30000);
    const line = out.split(/\r?\n/).reverse().find((l) => l.startsWith("RESULT "));
    if (code === 0 && line) makeNext = JSON.parse(line.slice(7)).slice(0, 3);
  } catch {
    /* card hides when empty */
  }

  return NextResponse.json({
    digest,
    makeNext,
    top: clusters.slice(0, 10),
    rising,
    outliers,
    awaiting: briefs.filter((b) => b.status === "draft").sort((a, b) => (a.deadline || "z").localeCompare(b.deadline || "z")),
    toPost: briefs.filter((b) => b.status === "approved" && (b.checklistState || []).some((x) => !x)),
    lastCollect: lastCollect ? { at: lastCollect.startedAt, ok: lastCollect.ok, ms: lastCollect.ms } : null,
  });
}
