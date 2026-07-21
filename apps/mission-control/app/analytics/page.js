"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const ratioClass = (r) => (r >= 1.15 ? "ok" : r >= 0.9 ? "warm" : "hot");
const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n ?? 0));

export default function CalibrationPage() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);

  const load = () => fetch("/api/analytics").then((r) => r.json()).then(setData);
  useEffect(() => {
    load();
  }, []);

  const act = async (action, id) => {
    setBusy(action);
    setNote(null);
    const res = await fetch("/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, id }),
    }).then((r) => r.json());
    setBusy(null);
    setNote(res.out || res.error || null);
    load();
  };

  const joins = data?.state?.joins;
  const scorecard = data?.state?.scorecard;
  const memo = data?.memo;

  const JoinTable = ({ title, rows }) => (
    <div className="panel" style={{ marginBottom: 12 }}>
      <label className="field" style={{ marginTop: 0 }}>{title} · overall median {fmt(joins.overallMedian)} views</label>
      {(rows || []).map((g) => (
        <div key={g.key} style={{ display: "flex", gap: 10, alignItems: "center", padding: "3px 0" }}>
          <span className={`badge ${ratioClass(g.vsOverall)}`} style={{ minWidth: 48, textAlign: "center", fontSize: 11 }}>{g.vsOverall}×</span>
          <span style={{ flex: 1, fontSize: 13 }}>{g.key}</span>
          <span className="mono muted" style={{ fontSize: 12 }}>{fmt(g.median)} · n={g.n}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <h1>Calibration</h1>
      <p className="sub">
        The moat: your actual results vs the system's predictions. Once you've posted 20+ times, the loop re-ranks your
        posting slots, nudges scoring weights (≤10%/week), and feeds your winners to the Title Lab — every change logged
        and reversible. No invented numbers; the memo sees only joined data.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="btn ghost sm" disabled={busy} onClick={() => act("seed")}>{busy === "seed" ? <span className="spin" /> : null}Seed 25 (demo)</button>
        <button className="btn ghost sm" disabled={busy} onClick={() => act("ingest")}>Ingest my channel</button>
        <button className="btn sm" disabled={busy} onClick={() => act("memo")}>{busy === "memo" ? <span className="spin" /> : null}Run weekly memo</button>
        <button className="btn sm" disabled={busy} onClick={() => act("tune")}>{busy === "tune" ? <span className="spin" /> : null}Auto-tune</button>
      </div>
      {note && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, whiteSpace: "pre-wrap" }}>{note}</div>}

      {!data ? (
        <div className="empty">loading…</div>
      ) : !joins || joins.n === 0 ? (
        <div className="empty">
          no post data yet — publish videos (they become MyPosts) or hit “Seed 25 (demo)” to see the loop work
          {!data.youtube && " · live my-channel ingestion needs YouTube OAuth"}
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {memo && (
            <div className="panel" style={{ marginBottom: 16, borderColor: "var(--accent, #ffb224)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <span className="badge warm">weekly memo</span>
                <span className="muted" style={{ fontSize: 11.5 }}>{memo.date} · n={memo.n}</span>
              </div>
              <div style={{ fontSize: 13 }}>
                <div><strong>outperformed:</strong> {(memo.outperformed || []).join(" · ")}</div>
                <div><strong>underperformed:</strong> {(memo.underperformed || []).join(" · ")}</div>
                {(memo.wrongAssumptions || []).length > 0 && <div><strong>assumptions to revisit:</strong> {memo.wrongAssumptions.join(" · ")}</div>}
                <div style={{ marginTop: 4 }}><strong>do next:</strong> {(memo.recommendations || []).join(" · ")}</div>
              </div>
            </div>
          )}

          {scorecard && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <label className="field" style={{ marginTop: 0 }}>prediction scorecard — did wishlist tiers predict my actual views?</label>
              <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                {scorecard.byTier.map((t) => (
                  <div key={t.tier} style={{ textAlign: "center", minWidth: 72 }}>
                    <div className="badge ok" style={{ fontSize: 13 }}>{t.tier}</div>
                    <div className="mono" style={{ fontSize: 13, marginTop: 4 }}>{t.median != null ? fmt(t.median) : "—"}</div>
                    <div className="muted" style={{ fontSize: 11 }}>n={t.n}{!t.reliable && t.n > 0 ? " ⚠" : ""}</div>
                  </div>
                ))}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{scorecard.tierHonest}</div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <JoinTable title="by hook pattern" rows={joins.byHook} />
            <JoinTable title="by length band" rows={joins.byLength} />
            <JoinTable title="by pillar" rows={joins.byPillar} />
            <JoinTable title="by time slot" rows={joins.bySlot} />
          </div>

          {(data.tuning || []).length > 0 && (
            <div className="panel" style={{ marginTop: 4 }}>
              <label className="field" style={{ marginTop: 0 }}>auto-tuning log — every change reversible</label>
              {data.tuning.map((t) => (
                <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0", fontSize: 12.5, opacity: t.reverted ? 0.5 : 1 }}>
                  <span className="chip static" style={{ fontSize: 10.5 }}>{t.kind}</span>
                  <span style={{ flex: 1 }}>{t.detail}</span>
                  <span className="muted mono" style={{ fontSize: 11 }}>{new Date(t.at).toLocaleDateString()}</span>
                  {t.reverted ? (
                    <span className="muted" style={{ fontSize: 11 }}>reverted</span>
                  ) : (
                    <button className="btn ghost sm" disabled={busy} onClick={() => act("revert", t.id)}>Revert</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
