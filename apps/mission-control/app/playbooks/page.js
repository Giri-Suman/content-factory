"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const fmtBand = (b) => (b && b[1] ? `${b[0]}-${b[1]}s` : "n/a");

export default function PlaybooksPage() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const load = () => fetch("/api/playbooks").then((r) => r.json()).then(setData);
  useEffect(() => {
    load();
  }, []);

  const act = async (action, id) => {
    setBusy(true);
    const res = await fetch("/api/playbooks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id }) }).then((r) => r.json());
    setBusy(false);
    setNote(res.out || res.error || null);
    load();
  };

  return (
    <div>
      <h1>Platform Playbooks</h1>
      <p className="sub">
        Per-platform rules derived from <strong>observed outcomes</strong> — my results, niche outlier patterns — never
        from pretended knowledge of private algorithms. Proposed changes cite their evidence; you approve or reject.
        Chatter about platform changes is quarantined as “unverified signals” until you review it. Approved changes flow
        into brief generation and timing.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button className="btn sm" disabled={busy} onClick={() => act("refresh")}>{busy ? <span className="spin" /> : null}Refresh from evidence</button>
      </div>
      {note && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{note}</div>}

      {!data ? (
        <div className="empty">loading…</div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {/* pending proposals */}
          {data.proposals.length > 0 && (
            <div className="panel" style={{ marginBottom: 16, borderColor: "var(--accent, #ffb224)" }}>
              <label className="field" style={{ marginTop: 0 }}>proposed changes — approve to apply (cited evidence)</label>
              {data.proposals.map((p) => (
                <div key={p.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <span className="chip static" style={{ fontSize: 10.5 }}>{p.platform}</span>
                  <span className="mono">{p.field}</span>
                  <span className="mono muted">{JSON.stringify(p.current)} → <span style={{ color: "var(--accent, #ffb224)" }}>{JSON.stringify(p.proposed)}</span></span>
                  <span className="muted" style={{ flex: 1, fontSize: 12 }}>{(p.evidence || []).join("; ")}</span>
                  <button className="btn sm" disabled={busy} onClick={() => act("approve", p.id)}>Approve</button>
                  <button className="btn ghost sm" disabled={busy} onClick={() => act("reject", p.id)}>Reject</button>
                </div>
              ))}
            </div>
          )}

          {/* current playbooks */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            {data.playbooks.map((p) => (
              <div key={p.platform} className="panel">
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <strong>{p.platform}</strong>
                  <span className="badge ok" style={{ fontSize: 10.5 }}>length {fmtBand(p.lengthBandSec)}</span>
                </div>
                <div className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
                  <div>hooks: {(p.hooks || []).join(" / ")}</div>
                  <div>captions: {p.captionRule} · hashtags: {p.hashtagRule}</div>
                  <div>slots: {(p.slots || []).join(", ")}</div>
                  <div>{p.notes}</div>
                </div>
                {(p.history || []).length > 0 && (
                  <div style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 6 }}>
                    <div className="muted" style={{ fontSize: 10.5, marginBottom: 3 }}>change history</div>
                    {p.history.slice(-3).reverse().map((h, i) => (
                      <div key={i} className="muted" style={{ fontSize: 11 }}>
                        {h.field}: {JSON.stringify(h.from)}→{JSON.stringify(h.to)} <span className="mono">({h.source})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* unverified signals */}
          <div className="panel">
            <label className="field" style={{ marginTop: 0 }}>unverified signals — quarantined chatter, never auto-applied</label>
            {data.signals.length === 0 ? (
              <div className="muted" style={{ fontSize: 12.5, paddingTop: 4 }}>none — collected posts mentioning algorithm/policy changes land here for your manual review</div>
            ) : (
              data.signals.map((s) => (
                <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 12 }}>
                  <span className="chip static" style={{ fontSize: 10 }}>{s.platform}</span>
                  {s.url ? <a href={s.url} target="_blank" rel="noreferrer" style={{ flex: 1 }}>{s.text}</a> : <span style={{ flex: 1 }}>{s.text}</span>}
                  <span className="muted" style={{ fontSize: 10.5 }}>{s.source}</span>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
