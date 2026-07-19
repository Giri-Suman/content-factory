"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const scoreClass = (n) => (n >= 7 ? "ok" : n >= 4 ? "warm" : "hot");

export default function LabPage() {
  const [patterns, setPatterns] = useState(null);
  const [search, setSearch] = useState("");
  const [minSample, setMinSample] = useState(true);
  const [input, setInput] = useState("");
  const [kind, setKind] = useState("title");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const load = () => fetch("/api/lab").then((r) => r.json()).then((d) => setPatterns(d.patterns));
  useEffect(() => {
    load();
  }, []);

  const score = async () => {
    if (!input.trim()) return;
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/lab", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(kind === "title" ? { title: input.trim() } : { hook: input.trim() }),
    }).then((r) => r.json());
    setBusy(false);
    if (res.ok) setResult(res.result);
    else setNote(res.error);
  };

  const extract = async () => {
    setBusy(true);
    setNote("extracting patterns from outlier titles…");
    const res = await fetch("/api/lab", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "extract" }),
    }).then((r) => r.json());
    setBusy(false);
    setNote(res.out || null);
    load();
  };

  const shown = (patterns || [])
    .filter((p) => !minSample || p.sampleSize >= 3)
    .filter((p) => !search.trim() || `${p.template} ${(p.exampleTitles || []).join(" ")}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <h1>Title & Hook Lab</h1>
      <p className="sub">
        Reusable title templates mined nightly from outlier videos (≥2x channel median), and a scorer that grades any
        draft title or hook — specificity, curiosity gap, identity call — with concrete rewrites for weak spots.
        Generic openers auto-fail.
      </p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="title">score a title</option>
            <option value="hook">score a hook</option>
          </select>
          <input
            placeholder={kind === "title" ? "paste a draft title…" : "paste a 2-second hook line…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && score()}
            style={{ flex: 1, minWidth: 260 }}
          />
          <button className="btn" disabled={busy || !input.trim()} onClick={score}>
            {busy ? <span className="spin" /> : null}Score
          </button>
        </div>

        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: 12, fontSize: 13 }}>
            {"overall" in result ? (
              <>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span className={`badge ${scoreClass(result.overall)}`} style={{ fontSize: 14 }}>{result.overall}/10</span>
                  {result.banned && <span className="badge hot">generic opener — auto-fail</span>}
                  <span className="muted" style={{ fontSize: 11.5 }}>{result.mode} mode</span>
                </div>
                {Object.entries(result.subScores).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 8, padding: "2px 0" }}>
                    <span className="mono" style={{ minWidth: 105 }}>{k}</span>
                    <span className={`badge ${scoreClass(v)}`} style={{ fontSize: 11 }}>{v}/10</span>
                    {result.rewrites[k] && <span className="muted" style={{ flex: 1 }}>{result.rewrites[k]}</span>}
                  </div>
                ))}
                {result.matches.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {result.matches.map((m, i) => (
                      <div key={i} className="muted">~ {m.template} <span className="mono">({m.avgOutlierRatio}x, n={m.sampleSize})</span></div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className={`badge ${scoreClass(result.score)}`} style={{ fontSize: 14 }}>{result.score}/10</span>
                <span className="chip static">{result.pattern}</span>
                {result.banned && <span className="badge hot">banned opener</span>}
                <span className="muted" style={{ fontSize: 11.5 }}>{result.mode} mode</span>
                {result.rewrite && <div className="muted" style={{ width: "100%" }}>→ {result.rewrite}</div>}
              </div>
            )}
          </motion.div>
        )}
      </div>

      {note && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{note}</div>}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <input placeholder="search patterns…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 260 }} />
        <button className={`chip${minSample ? " on" : ""}`} onClick={() => setMinSample(!minSample)}>n ≥ 3</button>
        <div style={{ flex: 1 }} />
        <button className="btn ghost sm" disabled={busy} onClick={extract}>Extract now</button>
      </div>

      {!patterns ? (
        <div className="empty">loading…</div>
      ) : shown.length === 0 ? (
        <div className="empty">
          no patterns yet — extraction needs 3+ outlier titles (add watchlist channels on the YouTube page) and an LLM
          key; it runs nightly with the worker, or hit “Extract now”
        </div>
      ) : (
        <table className="list">
          <thead>
            <tr><th style={{ width: 70 }}>avg ratio</th><th style={{ width: 40 }}>n</th><th>template</th><th>examples</th></tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td><span className="badge hot">{p.avgOutlierRatio}x</span></td>
                <td className="mono muted">{p.sampleSize}</td>
                <td>{p.template}</td>
                <td className="muted" style={{ fontSize: 12 }}>{(p.exampleTitles || []).slice(0, 2).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
