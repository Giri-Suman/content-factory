"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

const EFFORT_HINT = { S: "≤2h", M: "≤1 day", L: ">1 day" };
const STATUS_CLASS = { backlog: "warm", scheduled: "ok", made: "ok", retired: "cool" };

export default function IdeasPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [seriesName, setSeriesName] = useState("");
  const [assigning, setAssigning] = useState(null);

  const load = () => fetch("/api/ideas").then((r) => r.json()).then(setData);
  useEffect(() => {
    load();
  }, []);

  const act = async (body, thenBriefs = false) => {
    setBusy(true);
    const res = await fetch("/api/ideas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
    setBusy(false);
    setNote(res.out || res.error || null);
    if (res.ok && thenBriefs) router.push("/briefs");
    else load();
  };

  return (
    <div>
      <h1>Idea Bank</h1>
      <p className="sub">
        Every approved brief lands here with a pillar and effort tag. “Make Next” rank = opportunity × pillar balance
        (your last 14 days of posts) × effort fit (your available hours in Settings) × freshness decay for expired
        trends — every factor visible, no black box. Group ideas into series; episode briefs inherit numbering and
        continuity.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <button className="btn ghost sm" disabled={busy} onClick={() => act({ action: "sync" })}>
          Sync approved briefs
        </button>
        <input
          placeholder="new series name…"
          value={seriesName}
          onChange={(e) => setSeriesName(e.target.value)}
          style={{ maxWidth: 220 }}
        />
        <button
          className="btn ghost sm"
          disabled={busy || !seriesName.trim()}
          onClick={() => {
            act({ action: "seriesCreate", name: seriesName.trim() });
            setSeriesName("");
          }}
        >
          Create series
        </button>
        {data?.recentPillars?.length > 0 && (
          <span className="muted" style={{ fontSize: 12 }}>
            posted last 14d: {data.recentPillars.join(", ")}
          </span>
        )}
      </div>
      {note && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, whiteSpace: "pre-wrap" }}>{note}</div>}

      {(data?.series || []).length > 0 && (
        <div style={{ marginBottom: 18 }}>
          {data.series.map((s) => (
            <div key={s.id} className="panel" style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="badge warm">series</span>
                <strong style={{ flex: 1 }}>{s.name}</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {s.episodes.length} episode(s) · next #{s.nextEpisode}
                  {s.gaps.length > 0 && ` · gaps: ${s.gaps.join(", ")}`}
                </span>
              </div>
              {s.episodes.map((e) => (
                <div key={e.id} className="muted" style={{ fontSize: 12.5, paddingLeft: 8 }}>
                  #{e.episodeNum} {e.title}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {!data ? (
        <div className="empty">loading…</div>
      ) : data.ideas.length === 0 ? (
        <div className="empty">bank is empty — approve briefs (they auto-enter) or hit “Sync approved briefs”</div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {data.ideas.map((i) => (
            <div key={i.id} className="panel" style={{ marginBottom: 10, padding: "12px 16px" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {i.rank !== undefined && (
                  <span className="badge warm" style={{ minWidth: 46, textAlign: "center" }} title="opportunity × pillar balance × effort fit × freshness">
                    {i.rank}
                  </span>
                )}
                <span className={`badge ${STATUS_CLASS[i.status] || "cool"}`} style={{ fontSize: 10.5 }}>{i.status}</span>
                <span className="chip static" style={{ fontSize: 10.5 }}>{i.pillar}</span>
                <span className="chip static" style={{ fontSize: 10.5 }} title={EFFORT_HINT[i.effort]}>{i.effort} · {EFFORT_HINT[i.effort]}</span>
                {i.seriesId && <span className="chip static" style={{ fontSize: 10.5 }}>ep #{i.episodeNum}</span>}
                <strong style={{ flex: 1 }}>{i.title}</strong>
                <button className="btn ghost sm" disabled={busy} onClick={() => act({ action: "brief", ideaId: i.id }, true)}>
                  Brief it
                </button>
                {(data.series || []).length > 0 && !i.seriesId && (
                  <select
                    value={assigning === i.id ? "" : ""}
                    onChange={(e) => {
                      if (e.target.value) act({ action: "seriesAdd", seriesId: e.target.value, ideaId: i.id });
                      setAssigning(null);
                    }}
                  >
                    <option value="">+ series…</option>
                    {data.series.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>
              {i.factors && (
                <div className="muted mono" style={{ fontSize: 11, marginTop: 4 }}>
                  base {i.score} × pillar {i.factors.pillarBalance} × effort {i.factors.effortFit} × fresh {i.factors.freshness}
                </div>
              )}
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
