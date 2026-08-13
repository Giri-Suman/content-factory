import { collection } from "../../shared/src/store.js";
import { upcoming } from "./seasonal.js";

/**
 * Morning Digest (P8): one record per day — what rose overnight, what's
 * hot, what's still unposted. Rendered as a banner on Today.
 */

/** Seasons whose publish-by date is near or past — best-effort, never fatal. */
function seasonalWindows() {
  try {
    const rows = upcoming({ withinDays: 60 });
    return rows
      .filter((s) => s.urgency !== "soon")
      .slice(0, 4)
      .map((s) => ({ id: s.id, label: s.label, publishBy: s.publishBy, daysAway: s.daysAway, urgency: s.urgency, niches: s.niches, angle: s.angles[0] }));
  } catch {
    return [];
  }
}

export function buildDigest() {
  const clusters = collection("clusters").all().sort((a, b) => b.opportunityScore - a.opportunityScore);
  const briefs = collection("briefs").all();
  const channels = new Map(collection("watchchannels").all().map((c) => [c.id, c.title]));
  const weekAgo = Date.now() - 7 * 864e5;

  const digest = {
    date: new Date().toISOString().slice(0, 10),
    top10: clusters.slice(0, 10).map((c) => ({ id: c.id, label: c.label, score: c.opportunityScore, status: c.status })),
    overnightRisers: clusters
      .map((c) => {
        const h = c.scoreHistory || [];
        return { id: c.id, label: c.label, delta: h.length >= 2 ? h[h.length - 1] - h[h.length - 2] : 0 };
      })
      .filter((c) => c.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5),
    outliers: collection("watchvideos")
      .find((v) => v.outlierRatio >= 3 && v.publishedAt && new Date(v.publishedAt).getTime() >= weekAgo)
      .sort((a, b) => b.outlierRatio - a.outlierRatio)
      .slice(0, 5)
      .map((v) => ({ id: v.id, title: v.title, ratio: v.outlierRatio, channel: channels.get(v.channelId) || "?" })),
    unposted: briefs
      .filter((b) => b.status === "approved" && (b.checklistState || []).some((x) => !x))
      .map((b) => ({ id: b.id, topic: b.topic, kind: b.kind, deadline: b.deadline })),
    /**
     * Seasonal windows the radar structurally cannot see. Trend feeds report
     * what is spiking now; nobody posts "Diwali nail art demand starts in three
     * weeks" — but it does, every year, and being early is the whole advantage.
     */
    seasonal: seasonalWindows(),
    createdAt: new Date().toISOString(),
  };

  collection("digests").upsert(digest, (r) => r.date);
  // keep 30 days
  const rows = collection("digests").all().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  collection("digests").save(rows);
  return digest;
}
