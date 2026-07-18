"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

const CATEGORY_LABELS = { coding: "Coding", ai: "AI", math: "Math", makeup: "Makeup" };

const age = (iso) => {
  if (!iso) return "—";
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 36e5);
  return h < 1 ? "now" : h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
};

const scoreClass = (s) => (s >= 80 ? "hot" : s >= 60 ? "warm" : "cool");

export default function TrendsPage() {
  const router = useRouter();
  const [trends, setTrends] = useState(null);
  const [config, setConfig] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [briefNote, setBriefNote] = useState(null);
  const [filter, setFilter] = useState("all");
  const [scanning, setScanning] = useState(false);
  const [drafting, setDrafting] = useState(null);
  const [topic, setTopic] = useState("");
  const [error, setError] = useState(null);

  const load = async () => {
    const res = await fetch("/api/trends");
    const data = await res.json();
    setTrends(data.trends);
    setConfig(data.config);
    const cl = await fetch("/api/clusters").then((r) => r.json());
    setClusters(cl.clusters || []);
  };
  useEffect(() => {
    load();
  }, []);

  const scan = async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/trends", { method: "POST" });
      const data = await res.json();
      setTrends(data.trends);
      setConfig(data.config);
      if (!data.ok) setError("scan finished with errors — see terminal log");
      const cl = await fetch("/api/clusters").then((r) => r.json());
      setClusters(cl.clusters || []);
    } catch (e) {
      setError(String(e));
    }
    setScanning(false);
  };

  const generateBriefs = async (clusterId) => {
    setBriefNote("generating brief…");
    const res = await fetch("/api/briefs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clusterId }),
    }).then((r) => r.json());
    if (res.ok) router.push("/briefs");
    else setBriefNote(res.error || "brief generation failed");
  };

  const draft = async (input) => {
    setDrafting(input);
    setError(null);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      if (data.ok) router.push(`/scripts/${data.id}`);
      else setError(data.error || "draft failed");
    } catch (e) {
      setError(String(e));
    }
    setDrafting(null);
  };

  const enabledCats = config ? Object.keys(config.categories).filter((c) => config.categories[c]) : [];
  const shown = (trends || []).filter((t) => filter === "all" || t.category === filter);

  return (
    <div>
      <h1>Trend Radar</h1>
      <p className="sub">What the internet is talking about right now, in your niches — scored for viral video potential.</p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
        <button className="btn" onClick={scan} disabled={scanning}>
          {scanning ? (
            <>
              <span className="spin" />
              scanning…
            </>
          ) : (
            "Scan now"
          )}
        </button>
        <span className="chip static" style={{ marginLeft: 6 }}>
          filter:
        </span>
        <button className={`chip${filter === "all" ? " on" : ""}`} onClick={() => setFilter("all")}>
          all
        </button>
        {enabledCats.map((c) => (
          <button key={c} className={`chip${filter === c ? " on" : ""}`} onClick={() => setFilter(c)}>
            {CATEGORY_LABELS[c] || c}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          type="text"
          placeholder='Or draft from any topic: "why everyone is switching to Bun"'
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && topic.trim() && draft(topic.trim())}
          style={{ maxWidth: 520 }}
        />
        <button className="btn ghost" disabled={!topic.trim() || drafting} onClick={() => draft(topic.trim())}>
          {drafting === topic.trim() ? <span className="spin" /> : null}Draft topic
        </button>
      </div>

      {error && (
        <div className="panel" style={{ borderColor: "var(--red)", marginBottom: 16, color: "var(--red)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {clusters.length > 0 && (
        <div style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 17, marginBottom: 4 }}>Opportunities</h2>
          <p className="sub" style={{ marginBottom: 12 }}>
            Topic clusters ranked by opportunity score — click a score to see exactly how it was computed.
          </p>
          {briefNote && (
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
              {briefNote}
            </div>
          )}
          {clusters.slice(0, 10).map((c) => (
            <div key={c.id} className="panel" style={{ marginBottom: 10, padding: "12px 16px" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button
                  className={`badge ${c.opportunityScore >= 70 ? "hot" : c.opportunityScore >= 45 ? "warm" : "ok"}`}
                  style={{ minWidth: 44, cursor: "pointer", border: "none", fontSize: 14 }}
                  title="expand score breakdown"
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                >
                  {c.opportunityScore}
                </button>
                <span className={`chip static ${c.status === "rising" ? "on" : ""}`} style={{ fontSize: 11 }}>
                  {c.status}
                </span>
                <strong style={{ flex: 1 }}>{c.label}</strong>
                {c.memberCount > 1 && <span className="muted" style={{ fontSize: 12 }}>{c.memberCount} sources</span>}
                <button className="btn ghost sm" onClick={() => generateBriefs(c.id)}>
                  Generate Briefs
                </button>
              </div>
              {c.summary && <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{c.summary}</div>}
              {expanded === c.id && (
                <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  {Object.entries(c.scoreBreakdown || {}).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "2px 0" }}>
                      <span className="mono" style={{ minWidth: 110 }}>{k}</span>
                      <span className="mono" style={{ minWidth: 52 }}>{v.value}/{v.max}</span>
                      <span className="muted">{v.detail}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 8 }}>
                    {(c.members || []).map((m) => (
                      <div key={m.id} style={{ fontSize: 12.5, padding: "2px 0" }}>
                        <span className="mono muted" style={{ marginRight: 8 }}>{m.source}</span>
                        <a href={m.url} target="_blank" rel="noreferrer">{m.title}</a>
                        {m.velocity != null && <span className="muted"> · {m.velocity > 0 ? "+" : ""}{m.velocity}/h</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!trends ? (
        <div className="empty">loading…</div>
      ) : shown.length === 0 ? (
        <div className="empty">no trends yet — hit “Scan now”</div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <table className="list">
            <thead>
              <tr>
                <th style={{ width: 52 }}>score</th>
                <th style={{ width: 44 }}>age</th>
                <th style={{ width: 76 }}>category</th>
                <th style={{ width: 110 }}>source</th>
                <th>title</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 60).map((t) => (
                <tr key={t.id}>
                  <td>
                    <span className={`badge ${scoreClass(t.score ?? 0)}`}>{t.score ?? "—"}</span>
                  </td>
                  <td className="muted mono" style={{ fontSize: 12 }}>
                    {age(t.published_at)}
                  </td>
                  <td className="muted" style={{ fontSize: 12.5 }}>
                    {CATEGORY_LABELS[t.category] || t.category || "—"}
                  </td>
                  <td className="muted mono" style={{ fontSize: 12 }}>
                    {t.source}
                  </td>
                  <td>
                    <a href={t.url || "#"} target="_blank" rel="noreferrer" title={t.score_reason || ""}>
                      {t.title}
                    </a>
                  </td>
                  <td>
                    <button className="btn sm ghost" disabled={Boolean(drafting)} onClick={() => draft(t.id)}>
                      {drafting === t.id ? <span className="spin" /> : null}Draft
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  );
}
