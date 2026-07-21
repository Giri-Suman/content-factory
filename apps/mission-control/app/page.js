"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

const age = (iso) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};

const countdown = (iso) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "OVERDUE";
  return `${Math.floor(ms / 36e5)}h ${Math.floor((ms % 36e5) / 6e4)}m`;
};

const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n ?? 0));

const Skeleton = () => (
  <div className="panel" style={{ marginBottom: 10, opacity: 0.4 }}>
    <div style={{ height: 14, width: "60%", background: "var(--border)", borderRadius: 4, marginBottom: 8 }} />
    <div style={{ height: 10, width: "85%", background: "var(--border)", borderRadius: 4 }} />
  </div>
);

export default function TodayPage() {
  const router = useRouter();
  const [d, setD] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState(null);

  const load = () => fetch("/api/today").then((r) => r.json()).then(setD);
  useEffect(() => {
    load();
    // P8: the worker keeps data fresh server-side; poll so the page follows without reload
    const t = setInterval(load, 60e3);
    return () => clearInterval(t);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    setNote("collecting all sources + rescoring — ~30-60s…");
    try {
      await fetch("/api/trends", { method: "POST" });
      setNote(null);
      await load();
    } catch (e) {
      setNote(`refresh failed: ${e}`);
    }
    setRefreshing(false);
  };

  const brief = async (clusterId) => {
    setNote("generating brief…");
    const res = await fetch("/api/briefs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clusterId }),
    }).then((r) => r.json());
    if (res.ok) router.push("/briefs");
    else setNote(res.error);
  };

  const tick = async (b, i) => {
    const st = [...(b.checklistState || [])];
    st[i] = !st[i];
    await fetch("/api/briefs", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: b.id, checklistState: st }),
    });
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ marginBottom: 0 }}>Today</h1>
        <div style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12 }}>
          last scan: {d ? age(d.lastCollect?.at) : "…"}
        </span>
        <button className="btn sm" disabled={refreshing} onClick={refresh}>
          {refreshing ? <span className="spin" /> : null}Refresh now
        </button>
      </div>
      <p className="sub" style={{ marginTop: 6 }}>
        The daily command center — what's moving, what needs your call, what ships today.
      </p>
      {note && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{note}</div>}

      {d?.digest && (
        <div className="panel" style={{ marginBottom: 16, borderColor: "var(--accent, #ffb224)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
            <span className="badge warm">☀ morning digest</span>
            <span className="muted" style={{ fontSize: 12 }}>{d.digest.date}</span>
          </div>
          <div style={{ fontSize: 13 }}>
            {d.digest.overnightRisers.length > 0 && (
              <div>overnight risers: {d.digest.overnightRisers.map((r) => `${r.label.slice(0, 36)} (+${r.delta})`).join(" · ")}</div>
            )}
            {d.digest.outliers.length > 0 && (
              <div>watchlist outliers: {d.digest.outliers.map((o) => `${o.ratio}x ${o.title.slice(0, 30)}`).join(" · ")}</div>
            )}
            <div>
              {d.digest.unposted.length > 0
                ? `${d.digest.unposted.length} approved brief${d.digest.unposted.length > 1 ? "s" : ""} still unposted — checklists below`
                : "nothing waiting to post — generate from today's opportunities"}
            </div>
          </div>
        </div>
      )}

      {!d ? (
        <>
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ display: "grid", gap: 18 }}>
          {/* To Post Today */}
          {d.toPost.length > 0 && (
            <section>
              <h2 style={{ fontSize: 15.5, marginBottom: 8 }}>To Post Today</h2>
              {d.toPost.map((b) => (
                <div key={b.id} className="panel" style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                    <span className="badge ok">approved</span>
                    {b.kind === "trend" && b.deadline && <span className="badge hot">{countdown(b.deadline)}</span>}
                    {b.scheduledDate && <span className="chip static" style={{ fontSize: 11 }}>slot {b.scheduledDate}</span>}
                    <strong>{b.topic}</strong>
                  </div>
                  {(b.payload?.manual_publish_checklist || []).map((step, i) => (
                    <label key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, padding: "2px 0", cursor: "pointer" }}>
                      <input type="checkbox" checked={Boolean(b.checklistState?.[i])} onChange={() => tick(b, i)} style={{ marginTop: 2 }} />
                      <span style={{ opacity: b.checklistState?.[i] ? 0.5 : 1, textDecoration: b.checklistState?.[i] ? "line-through" : "none" }}>{step}</span>
                    </label>
                  ))}
                </div>
              ))}
            </section>
          )}

          {/* Make Next (P14) */}
          {d.makeNext?.length > 0 && (
            <section>
              <h2 style={{ fontSize: 15.5, marginBottom: 8 }}>Make Next</h2>
              {d.makeNext.map((i) => (
                <div key={i.id} className="panel" style={{ marginBottom: 8, display: "flex", gap: 10, alignItems: "center", padding: "10px 14px" }}>
                  <span className="badge warm" style={{ minWidth: 44, textAlign: "center" }}>{i.rank}</span>
                  <span className="chip static" style={{ fontSize: 10.5 }}>{i.pillar}</span>
                  <span className="chip static" style={{ fontSize: 10.5 }}>{i.effort}</span>
                  <span style={{ flex: 1, fontSize: 13.5 }}>{i.title}</span>
                  <button className="btn ghost sm" onClick={() => router.push("/ideas")}>Open bank</button>
                </div>
              ))}
            </section>
          )}

          {/* Awaiting approval */}
          <section>
            <h2 style={{ fontSize: 15.5, marginBottom: 8 }}>Briefs awaiting approval</h2>
            {d.awaiting.length === 0 ? (
              <div className="empty">none — generate one from an opportunity below</div>
            ) : (
              d.awaiting.map((b) => (
                <div key={b.id} className="panel" style={{ marginBottom: 8, display: "flex", gap: 10, alignItems: "center" }}>
                  <span className="badge warm">draft</span>
                  {b.kind === "trend" && b.deadline && <span className="badge hot">{countdown(b.deadline)}</span>}
                  <span style={{ flex: 1 }}>{b.topic}</span>
                  <button className="btn ghost sm" onClick={() => router.push("/briefs")}>Review</button>
                </div>
              ))
            )}
          </section>

          {/* Rising fast */}
          {d.rising.length > 0 && (
            <section>
              <h2 style={{ fontSize: 15.5, marginBottom: 8 }}>Rising fast</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {d.rising.map((c) => (
                  <span key={c.id} className="chip static" title={c.label}>
                    +{c.delta} · {c.label.slice(0, 40)}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Top opportunities */}
          <section>
            <h2 style={{ fontSize: 15.5, marginBottom: 8 }}>Top 10 opportunities</h2>
            {d.top.length === 0 ? (
              <div className="empty">no clusters yet — hit “Refresh now” above</div>
            ) : (
              d.top.map((c) => (
                <div key={c.id} className="panel" style={{ marginBottom: 8, display: "flex", gap: 10, alignItems: "center", padding: "10px 14px" }}>
                  <span className={`badge ${c.opportunityScore >= 70 ? "hot" : c.opportunityScore >= 45 ? "warm" : "ok"}`} style={{ minWidth: 38, textAlign: "center" }}>
                    {c.opportunityScore}
                  </span>
                  <span className={`chip static${c.status === "rising" ? " on" : ""}`} style={{ fontSize: 10.5 }}>{c.status}</span>
                  <span style={{ flex: 1, fontSize: 13.5 }}>{c.label}</span>
                  <button className="btn ghost sm" onClick={() => brief(c.id)}>Generate Briefs</button>
                </div>
              ))
            )}
          </section>

          {/* Watchlist outliers */}
          <section>
            <h2 style={{ fontSize: 15.5, marginBottom: 8 }}>Watchlist outliers this week</h2>
            {d.outliers.length === 0 ? (
              <div className="empty">
                none — add competitor channels on the <a href="/youtube">YouTube page</a>
                {" "}(needs YOUTUBE_API_KEY in .env)
              </div>
            ) : (
              d.outliers.map((v) => (
                <div key={v.id} className="panel" style={{ marginBottom: 6, display: "flex", gap: 10, alignItems: "center", padding: "8px 14px" }}>
                  <span className="badge hot">{v.outlierRatio}x</span>
                  <span className="mono muted" style={{ minWidth: 54, textAlign: "right", fontSize: 12 }}>{fmt(v.views)}</span>
                  <a href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 13 }}>{v.title}</a>
                  <span className="muted" style={{ fontSize: 11.5 }}>{v.channelTitle}{v.isShort ? " · short" : ""}</span>
                </div>
              ))
            )}
          </section>
        </motion.div>
      )}
    </div>
  );
}
