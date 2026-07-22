"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const LANE_CLASS = { synthetic: "ok", capture: "warm" };
const STATE_LABEL = {
  approved: "Approved", scripted: "Scripted", "awaiting-capture": "Awaiting capture",
  rendered: "Rendered", qc: "QC", ready: "Ready", published: "Published",
};

export default function ProductionPage() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);
  const [capFile, setCapFile] = useState({});

  const load = () => fetch("/api/production").then((r) => r.json()).then(setData);
  useEffect(() => {
    load();
    const t = setInterval(load, 15e3); // reflect state changes as the pipeline advances
    return () => clearInterval(t);
  }, []);

  const produce = async (briefId, captureFile) => {
    setBusy(briefId);
    setNote("pipeline running in the background — the board updates as it advances (renders take a couple minutes)");
    await fetch("/api/production", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ briefId, captureFile }),
    });
    setBusy(null);
    load();
  };

  return (
    <div>
      <h1>Production</h1>
      <p className="sub">
        The conveyor belt. Synthetic briefs run approve→ready with zero touches; capture briefs wait for your
        recording, then auto-edit. Anything stuck &gt;24h (or &gt;6h for a trend) raises an alert — nothing rots
        silently.
      </p>

      {data?.alerts?.length > 0 && (
        <div className="panel" style={{ borderColor: "var(--red)", marginBottom: 14 }}>
          <strong style={{ fontSize: 13 }}>⚠ {data.alerts.length} stuck</strong>
          {data.alerts.map((a) => (
            <div key={a.id} className="muted" style={{ fontSize: 12, marginTop: 3 }}>{a.topic.slice(0, 50)} — {a.reason}</div>
          ))}
        </div>
      )}
      {note && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{note}</div>}

      {!data ? (
        <div className="empty">loading…</div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
          {data.states.map((state) => (
            <div key={state} style={{ minWidth: 190, flex: "0 0 190px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, display: "flex", gap: 6 }}>
                {STATE_LABEL[state]}
                <span className="muted">{data.columns[state].length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.columns[state].map((c) => (
                  <div key={c.id} className="panel" style={{ padding: "9px 11px", borderColor: c.stuck ? "var(--red)" : c.escalated ? "var(--red)" : undefined }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                      <span className={`chip static ${LANE_CLASS[c.lane] || ""}`} style={{ fontSize: 9.5 }}>{c.lane}</span>
                      {c.kind === "trend" && <span className="badge warm" style={{ fontSize: 9 }}>trend</span>}
                      {c.escalated && <span className="badge hot" style={{ fontSize: 9 }}>escalated</span>}
                    </div>
                    <div style={{ fontSize: 12.5, marginBottom: 6 }}>{c.topic.slice(0, 60)}</div>
                    {c.stuck && <div style={{ fontSize: 10.5, color: "var(--red)", marginBottom: 4 }}>⚠ {c.stuck}</div>}

                    {state === "approved" && (
                      <button className="btn ghost sm" disabled={busy === c.id} onClick={() => produce(c.id)}>
                        {busy === c.id ? <span className="spin" /> : null}{c.lane === "capture" ? "Generate shot list" : "Produce →"}
                      </button>
                    )}
                    {state === "awaiting-capture" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {c.shotList && <div className="muted" style={{ fontSize: 10.5 }}>{(c.shotList.shots || []).length} shots ready</div>}
                        <input placeholder="path to recording…" value={capFile[c.id] || ""} onChange={(e) => setCapFile({ ...capFile, [c.id]: e.target.value })} className="mono" style={{ fontSize: 10.5 }} />
                        <button className="btn ghost sm" disabled={busy === c.id || !capFile[c.id]} onClick={() => produce(c.id, capFile[c.id])}>Drop & edit</button>
                      </div>
                    )}
                    {state === "ready" && <a className="btn ghost sm" href="/publish">Publish →</a>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
