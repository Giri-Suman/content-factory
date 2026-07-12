"use client";
import { useEffect, useState } from "react";
import { useJob, JobLog } from "../../components/useJob.js";

const CATS = ["coding", "ai", "math", "makeup"];
const COLORS = { coding: "var(--accent)", ai: "var(--blue)", math: "var(--green)", makeup: "var(--red)" };

export default function AnalyticsPage() {
  const [perf, setPerf] = useState(null);
  const [youtube, setYoutube] = useState(false);
  const { job, start, running } = useJob();

  const load = () =>
    fetch("/api/analytics")
      .then((r) => r.json())
      .then((d) => {
        setPerf(d.perf);
        setYoutube(d.youtube);
      });
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (job?.status === "done") load();
  }, [job]);

  if (!perf) return <div className="empty">loading…</div>;

  return (
    <div>
      <h1>Analytics</h1>
      <p className="sub">
        Per-category performance from your published videos — these weights feed straight back into trend scoring, so
        winning niches surface more and weak ones fade. The feedback loop that compounds breakouts.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <button className="btn" onClick={() => start("/api/analytics", {})} disabled={running}>
          {running ? <span className="spin" /> : null}Refresh from YouTube
        </button>
        {perf.updatedAt && (
          <span className="muted" style={{ fontSize: 12.5 }}>
            updated {new Date(perf.updatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {!youtube && (
        <div className="panel" style={{ marginBottom: 18, fontSize: 13 }} >
          <span className="muted">
            No YouTube credentials yet — weights are neutral (1.0). Once you publish and connect analytics, real
            view-per-day data reshapes them.
          </span>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 18 }}>
        <label className="field" style={{ marginTop: 0 }}>
          category weight (×score in the radar)
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
          {CATS.map((cat) => {
            const w = perf.weights?.[cat] ?? 1;
            return (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 70, fontWeight: 600 }}>{cat}</span>
                <div style={{ flex: 1, height: 18, background: "var(--bg)", borderRadius: 9, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${Math.min(100, (w / 1.5) * 100)}%`,
                      height: "100%",
                      background: COLORS[cat],
                      borderRadius: 9,
                    }}
                  />
                </div>
                <span className="mono" style={{ width: 44, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {w.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <label className="field" style={{ marginTop: 0 }}>
          top performers
        </label>
        {perf.videos?.length ? (
          <table className="list" style={{ marginTop: 6 }}>
            <thead>
              <tr>
                <th style={{ width: 80 }}>views</th>
                <th style={{ width: 90 }}>views/day</th>
                <th style={{ width: 80 }}>category</th>
                <th>title</th>
              </tr>
            </thead>
            <tbody>
              {perf.videos
                .slice()
                .sort((a, b) => b.viewsPerDay - a.viewsPerDay)
                .slice(0, 15)
                .map((v) => (
                  <tr key={v.videoId}>
                    <td className="mono">{v.views}</td>
                    <td className="mono">{v.viewsPerDay}</td>
                    <td className="muted">{v.category}</td>
                    <td>{v.title || v.videoId}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <div className="muted" style={{ fontSize: 13, paddingTop: 6 }}>
            No published videos yet. Publish a few, then refresh.
          </div>
        )}
      </div>

      <JobLog job={job} />
    </div>
  );
}
