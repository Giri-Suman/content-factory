"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const usd = (n) => `$${(n ?? 0).toFixed(2)}`;

export default function CostPage() {
  const [d, setD] = useState(null);
  useEffect(() => {
    fetch("/api/cost").then((r) => r.json()).then(setD);
  }, []);

  if (!d) return <div className="empty">loading…</div>;
  const maxDay = Math.max(0.01, ...d.last14Days.map((x) => x.amount));

  return (
    <div>
      <h1>Cost</h1>
      <p className="sub">
        Honest estimates — we don't have exact token billing, so LLM cost is per-call by task size, voice is
        per-character (Windows TTS = $0), thumbnails are $0 (system Chrome). Keyless, the whole machine runs at $0.
      </p>

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            ["today", usd(d.today)],
            ["avg / video", usd(d.avgPerVideo)],
            [`monthly @ ${d.cadence}/day`, usd(d.monthlyProjection)],
            ["tracked calls", d.tracked],
          ].map(([label, val]) => (
            <div key={label} className="panel" style={{ flex: 1, minWidth: 150, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{val}</div>
              <div className="muted" style={{ fontSize: 12 }}>{label}</div>
            </div>
          ))}
        </div>

        <div className="panel" style={{ marginBottom: 16 }}>
          <label className="field" style={{ marginTop: 0 }}>spend, last 14 days</label>
          {d.last14Days.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, paddingTop: 4 }}>no spend logged yet — keyless runs are free. Add an LLM/ElevenLabs key and costs appear here.</div>
          ) : (
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 90, marginTop: 8 }}>
              {d.last14Days.slice().reverse().map((x) => (
                <div key={x.date} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ height: `${Math.max(2, (x.amount / maxDay) * 78)}px`, background: "var(--accent, #ffb224)", borderRadius: 3 }} title={usd(x.amount)} />
                  <div className="mono muted" style={{ fontSize: 9, marginTop: 2 }}>{x.date.slice(5)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="panel">
            <label className="field" style={{ marginTop: 0 }}>by source</label>
            {d.byKind.length === 0 ? <div className="muted" style={{ fontSize: 12.5, paddingTop: 4 }}>nothing yet</div> : d.byKind.map((k) => (
              <div key={k.kind} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
                <span>{k.kind}</span><span className="mono">{usd(k.amount)}</span>
              </div>
            ))}
          </div>
          <div className="panel">
            <label className="field" style={{ marginTop: 0 }}>most expensive videos</label>
            {d.videoCosts.length === 0 ? <div className="muted" style={{ fontSize: 12.5, paddingTop: 4 }}>none tracked</div> : d.videoCosts.map((v) => (
              <div key={v.videoId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}>
                <span className="mono muted">{v.videoId}</span><span className="mono">{usd(v.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
