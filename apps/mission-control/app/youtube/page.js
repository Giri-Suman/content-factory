"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n ?? 0));
const TABS = ["Trending", "Niche Heat", "Watchlist"];

export default function YouTubePage() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("Trending");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const load = () => fetch("/api/youtube").then((r) => r.json()).then(setData);
  useEffect(() => {
    load();
  }, []);

  const watch = async () => {
    if (!handle.trim()) return;
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/youtube", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "watch", handle: handle.trim() }),
    }).then((r) => r.json());
    setBusy(false);
    setNote(res.ok ? `now watching ${handle.trim()}` : res.error);
    if (res.ok) {
      setHandle("");
      load();
    }
  };

  const scan = async () => {
    setBusy(true);
    setNote("scanning trending + niche heat in the background — refresh in ~30s");
    await fetch("/api/youtube", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "scan" }),
    });
    setBusy(false);
  };

  const rows = data ? (tab === "Trending" ? data.trending : tab === "Niche Heat" ? data.heat : null) : null;

  return (
    <div>
      <h1>YouTube Radar</h1>
      <p className="sub">
        Trending (IN+US, Sci&Tech + Education), niche-keyword heat (last 48h), and your competitor watchlist with
        outlier detection — shorts and long-form measured against separate medians. Every API call is 30-min cached,
        50-id batched, and quota-metered.
      </p>

      {data && !data.hasKey && (
        <div className="panel" style={{ borderColor: "var(--warn, #b58900)", marginBottom: 16 }}>
          <strong>YOUTUBE_API_KEY missing.</strong>{" "}
          <span className="muted">
            Free in Google Cloud Console → enable “YouTube Data API v3” → create API key → paste into .env. Everything
            on this page lights up automatically once it exists.
          </span>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} className={`btn sm ${tab === t ? "" : "ghost"}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn ghost sm" disabled={busy || !data?.hasKey} onClick={scan}>
          Scan now
        </button>
        <span className="mono muted" style={{ fontSize: 11.5 }}>
          quota today: {data?.quotaToday ?? "…"} u
        </span>
      </div>

      {note && (
        <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          {note}
        </div>
      )}

      {!data ? (
        <div className="empty">loading…</div>
      ) : tab !== "Watchlist" ? (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="panel">
          {rows.length === 0 ? (
            <div className="empty">nothing yet — hit “Scan now” (needs the API key)</div>
          ) : (
            rows.map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                <span className="mono" style={{ minWidth: 64, textAlign: "right" }}>{fmt(t.points)} v</span>
                {t.velocity != null && <span className="mono muted" style={{ minWidth: 60 }}>{t.velocity > 0 ? "+" : ""}{fmt(t.velocity)}/h</span>}
                <a href={t.url} target="_blank" rel="noreferrer" style={{ flex: 1 }}>{t.title}</a>
              </div>
            ))
          )}
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="text"
                placeholder="@handle, channel URL, or UC… id"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && watch()}
                disabled={!data.hasKey}
              />
              <button className="btn" disabled={busy || !handle.trim() || !data.hasKey} onClick={watch}>
                {busy ? <span className="spin" /> : null}Watch
              </button>
            </div>
          </div>

          {data.outliers.length > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <label className="field" style={{ marginTop: 0 }}>outliers ≥3x — last 14 days</label>
              {data.outliers.map((v) => (
                <div key={v.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span className="badge hot">{v.outlierRatio}x</span>
                  <span className="mono muted" style={{ minWidth: 58, textAlign: "right" }}>{fmt(v.views)}</span>
                  <a href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" style={{ flex: 1 }}>
                    {v.title}
                  </a>
                  <span className="muted" style={{ fontSize: 12 }}>{v.channelTitle}{v.isShort ? " · short" : ""}</span>
                </div>
              ))}
            </div>
          )}

          {data.channels.length === 0 ? (
            <div className="empty">no channels watched yet — add a competitor above</div>
          ) : (
            data.channels.map((c) => (
              <div key={c.id} className="panel" style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "baseline", marginBottom: 8 }}>
                  <strong>{c.title}</strong>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {fmt(c.subscriberCount)} subs · median {fmt(c.medianViews)} · shorts {fmt(c.shortsMedianViews)} · long {fmt(c.longMedianViews)}
                  </span>
                </div>
                {(c.videos || []).map((v) => (
                  <div key={v.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "4px 0" }}>
                    <span className={`badge ${v.outlierRatio >= 3 ? "hot" : v.outlierRatio >= 1.5 ? "warm" : "ok"}`} style={{ minWidth: 46, textAlign: "center" }}>
                      {v.outlierRatio ?? "—"}x
                    </span>
                    <span className="mono muted" style={{ minWidth: 58, textAlign: "right" }}>{fmt(v.views)}</span>
                    <a href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 13.5 }}>
                      {v.title}
                    </a>
                    {v.isShort && <span className="muted" style={{ fontSize: 11.5 }}>short</span>}
                  </div>
                ))}
              </div>
            ))
          )}
        </motion.div>
      )}
    </div>
  );
}
