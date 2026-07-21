"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const rateClass = (r) => (r == null ? "cool" : r >= 80 ? "ok" : r >= 50 ? "warm" : "hot");

export default function QCPage() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const load = () => fetch("/api/qc").then((r) => r.json()).then(setData);
  useEffect(() => {
    load();
  }, []);

  const resolve = async (id) => {
    await fetch("/api/qc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resolve: id }) });
    load();
  };

  return (
    <div>
      <h1>QC Judge Network</h1>
      <p className="sub">
        Every artifact passes a judge before advancing — idea, script, metadata, visual, audio. Failures regenerate
        (max 3 attempts) with the judge's fix injected; three strikes or a blown cost budget lands it in Human Review,
        never auto-published. AudioJudge is fully programmatic; the rest have coded rubrics that upgrade with an LLM key.
      </p>
      {note && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{note}</div>}

      {!data ? (
        <div className="empty">loading…</div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel" style={{ marginBottom: 16 }}>
            <label className="field" style={{ marginTop: 0 }}>pass rate per judge ({data.total} critiques logged)</label>
            <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              {data.perJudge.map((j) => (
                <div key={j.judge} style={{ textAlign: "center", minWidth: 92 }}>
                  <div className={`badge ${rateClass(j.passRate)}`} style={{ fontSize: 14 }}>{j.passRate == null ? "—" : `${j.passRate}%`}</div>
                  <div style={{ fontSize: 12.5, marginTop: 4 }}>{j.judge}</div>
                  <div className="muted mono" style={{ fontSize: 11 }}>{j.passes}/{j.total}</div>
                </div>
              ))}
            </div>
          </div>

          {data.escalations.length > 0 && (
            <div className="panel" style={{ marginBottom: 16, borderColor: "var(--red)" }}>
              <label className="field" style={{ marginTop: 0 }}>Human Review queue — {data.escalations.length} escalated (never auto-published)</label>
              {data.escalations.map((e) => (
                <div key={e.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className="badge hot">{e.artifactType}</span>
                    <span className="mono" style={{ flex: 1, fontSize: 12 }}>{e.artifactId}</span>
                    <span className="muted" style={{ fontSize: 12 }}>{e.reason}</span>
                    <button className="btn ghost sm" onClick={() => resolve(e.id)}>Resolve</button>
                  </div>
                  {(e.critiques || []).slice(-2).map((c) => (
                    <div key={c.id} className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                      {c.judge} {c.score}/100 (attempt {c.attempt}): {(c.reasons || []).join("; ")}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="panel">
            <label className="field" style={{ marginTop: 0 }}>recent failures</label>
            {data.recentFailures.length === 0 ? (
              <div className="muted" style={{ fontSize: 13, paddingTop: 6 }}>no failures logged — run <span className="mono">factory qc brief &lt;id&gt;</span></div>
            ) : (
              data.recentFailures.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "5px 0", fontSize: 12.5 }}>
                  <span className="badge hot" style={{ minWidth: 62, textAlign: "center" }}>{c.judge}</span>
                  <span className="mono muted" style={{ minWidth: 30 }}>{c.score}</span>
                  <span style={{ flex: 1 }}>{(c.reasons || []).join("; ")}</span>
                  <span className="muted" style={{ fontSize: 11 }}>#{c.attempt}</span>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
