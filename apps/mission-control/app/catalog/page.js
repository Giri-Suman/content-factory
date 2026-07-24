"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const LANE_CLASS = { synthetic: "ok", capture: "warm", hybrid: "cool" };

export default function CatalogPage() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);

  const load = () => fetch("/api/catalog").then((r) => r.json()).then(setData);
  useEffect(() => {
    load();
  }, []);

  const act = async (action) => {
    setBusy(action);
    const res = await fetch("/api/catalog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }).then((r) => r.json());
    setBusy(null);
    setNote(res.out || res.error || null);
    load();
  };

  return (
    <div>
      <h1>Format Catalog</h1>
      <p className="sub">
        Every format the machine makes, its lane, and its honest automation % (machine share of effort after brief
        approval). Lane routing, Idea Bank rotation, and Brief Studio read from this registry. One approved idea fans
        out to 8+ assets — the repurposing matrix.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="btn ghost sm" disabled={busy} onClick={() => act("seed-formats")}>Seed formats</button>
        <button className="btn ghost sm" disabled={busy} onClick={() => act("seed-ideas")}>Seed 50 ideas</button>
        <button className="btn ghost sm" disabled={busy} onClick={() => act("newsletter")}>Compile newsletter</button>
        <button className="btn ghost sm" disabled={busy} onClick={() => act("comments")}>Mine comments</button>
      </div>
      {note && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{note}</div>}

      {!data ? (
        <div className="empty">loading…</div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            {Object.entries(data.laneCounts).map(([lane, n]) => (
              <div key={lane} className="panel" style={{ flex: 1, minWidth: 120, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{n}</div>
                <div className="muted" style={{ fontSize: 12 }}>{lane} formats</div>
              </div>
            ))}
            <div className="panel" style={{ flex: 1, minWidth: 120, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{data.backlog}</div>
              <div className="muted" style={{ fontSize: 12 }}>ideas in backlog</div>
            </div>
          </div>

          {data.commentLeads.length > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <label className="field" style={{ marginTop: 0 }}>reply-worthy comments (make a reply video)</label>
              {data.commentLeads.map((l) => (
                <div key={l.id} className="muted" style={{ fontSize: 12.5, padding: "3px 0" }}>“{l.comment}” — {l.author}</div>
              ))}
            </div>
          )}

          <div className="panel">
            <label className="field" style={{ marginTop: 0 }}>{data.formats.length} formats</label>
            <table className="list" style={{ marginTop: 6 }}>
              <thead><tr><th style={{ width: 36 }}>#</th><th style={{ width: 90 }}>lane</th><th style={{ width: 56 }}>auto</th><th>format</th><th>platforms</th></tr></thead>
              <tbody>
                {data.formats.map((f) => (
                  <tr key={f.id}>
                    <td className="mono muted">{f.num}</td>
                    <td><span className={`chip static ${LANE_CLASS[f.lane] || ""}`} style={{ fontSize: 10.5 }}>{f.lane}</span></td>
                    <td className="mono">{f.autoPct}%</td>
                    <td>{f.name}</td>
                    <td className="muted" style={{ fontSize: 11.5 }}>{(f.platforms || []).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
