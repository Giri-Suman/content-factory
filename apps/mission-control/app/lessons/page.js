"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const SCOPE_CLASS = { script: "warm", metadata: "ok", visual: "hot", timing: "cool", topic: "warm", idea: "ok" };

export default function LessonsPage() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const load = () => fetch("/api/lessons").then((r) => r.json()).then(setData);
  useEffect(() => {
    load();
  }, []);

  const act = async (body) => {
    setBusy(true);
    const res = await fetch("/api/lessons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    setBusy(false);
    setNote(res.out || res.error || null);
    load();
  };

  const maxRate = 100;

  return (
    <div>
      <h1>Lessons & Prompt Evolution</h1>
      <p className="sub">
        The system learns from its own critiques and results. Every lesson cites the evidence behind it — no vibes.
        Active lessons (top 8 per scope by weight = evidence × recency) inject into generation prompts automatically.
        Prompt versions never change without your approval.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="btn sm" disabled={busy} onClick={() => act({ action: "distill" })}>{busy ? <span className="spin" /> : null}Distill now</button>
      </div>
      {note && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{note}</div>}

      {!data ? (
        <div className="empty">loading…</div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {/* self-improvement trends */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <label className="field" style={{ marginTop: 0 }}>self-improvement — pass rate should rise, regen rate should fall ({data.lessonsThisMonth} lessons this month)</label>
            <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
              {["passRate", "regenRate"].map((metric) => (
                <div key={metric} style={{ flex: 1 }}>
                  <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>{metric === "passRate" ? "judge pass rate" : "regeneration rate"}</div>
                  <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 60 }}>
                    {data.trend.map((t) => (
                      <div key={t.label} style={{ flex: 1, textAlign: "center" }}>
                        <div
                          style={{
                            height: t[metric] == null ? 2 : `${Math.max(3, (t[metric] / maxRate) * 54)}px`,
                            background: metric === "passRate" ? "var(--green)" : "var(--red)",
                            borderRadius: 3,
                            opacity: t[metric] == null ? 0.2 : 1,
                          }}
                        />
                        <div className="mono muted" style={{ fontSize: 9.5, marginTop: 2 }}>{t[metric] ?? "–"}</div>
                        <div className="muted" style={{ fontSize: 9 }}>{t.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* prompt versions */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <label className="field" style={{ marginTop: 0 }}>prompt versions — you approve every promotion</label>
            {data.promptVersions.map((p) => (
              <div key={p.task} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0", fontSize: 13 }}>
                <span className="mono" style={{ width: 80 }}>{p.task}</span>
                {p.versions.map((v) => (
                  <span key={v.id} className={`chip ${v.active ? "on" : "static"}`} style={{ fontSize: 11 }} title={v.template}>
                    v{v.version}{v.active ? " ●" : v.proposed ? " ?" : ""}
                    {v.proposed && <button className="btn ghost sm" style={{ marginLeft: 6 }} onClick={() => act({ action: "approve", id: v.id })}>approve</button>}
                  </span>
                ))}
              </div>
            ))}
          </div>

          {/* lessons */}
          <div className="panel">
            <label className="field" style={{ marginTop: 0 }}>active lessons — {data.lessons.length} (cited, weighted)</label>
            {data.lessons.length === 0 ? (
              <div className="muted" style={{ fontSize: 13, paddingTop: 6 }}>none yet — seed critiques and hit “Distill now” (<span className="mono">factory lessons seed</span>)</div>
            ) : (
              data.lessons.map((l) => (
                <div key={l.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <span className={`badge ${SCOPE_CLASS[l.scope] || "cool"}`} style={{ minWidth: 62, textAlign: "center", fontSize: 10.5 }}>{l.scope}</span>
                  <span className="mono muted" style={{ minWidth: 60, fontSize: 11 }} title="weight · evidence count">w{l.weight}·n{l.evidenceCount}</span>
                  <span style={{ flex: 1 }}>{l.pinned ? "📌 " : ""}{l.text}</span>
                  <button className="btn ghost sm" onClick={() => act({ action: "pin", id: l.id })}>{l.pinned ? "unpin" : "pin"}</button>
                  <button className="btn ghost sm" onClick={() => act({ action: "kill", id: l.id })}>✕</button>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
