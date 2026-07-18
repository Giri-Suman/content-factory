"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

const TIER_ORDER = { S: 0, A: 1, B: 2, C: 3 };
const TIER_CLASS = { S: "hot", A: "warm", B: "ok", C: "cool" };
const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n ?? 0));

const EMPTY_MANUAL = {
  platform: "instagram", url: "", views: "", likes: "", comments: "", shares: "",
  hoursSincePost: "", creatorFollowerCount: "", caption: "", firstSeconds: "",
};

export default function WishlistPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [sortByTier, setSortByTier] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState(EMPTY_MANUAL);

  const load = () => fetch("/api/wishlist").then((r) => r.json()).then(setData);
  useEffect(() => {
    load();
  }, []);

  const addUrl = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setNote("analyzing — video + channel + last 25 uploads…");
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    }).then((r) => r.json());
    setBusy(false);
    setNote(res.ok ? null : res.error);
    if (res.ok) {
      setUrl("");
      load();
    }
  };

  const addManual = async () => {
    setBusy(true);
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manual }),
    }).then((r) => r.json());
    setBusy(false);
    setNote(res.ok ? null : res.error);
    if (res.ok) {
      setManual(EMPTY_MANUAL);
      setShowManual(false);
      load();
    }
  };

  const poll = async () => {
    setBusy(true);
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "poll" }),
    }).then((r) => r.json());
    setBusy(false);
    setNote(res.out || null);
    load();
  };

  const del = async (id) => {
    await fetch(`/api/wishlist?id=${id}`, { method: "DELETE" });
    load();
  };

  const briefIt = async (id) => {
    setBusy(true);
    setNote("generating brief from this autopsy…");
    const res = await fetch("/api/briefs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wishlistId: id }),
    }).then((r) => r.json());
    setBusy(false);
    if (res.ok) router.push("/briefs");
    else setNote(res.error);
  };

  const entries = data
    ? [...data.entries].sort((a, b) =>
        sortByTier
          ? (TIER_ORDER[a.predictedTier] ?? 9) - (TIER_ORDER[b.predictedTier] ?? 9)
          : (b.createdAt || "").localeCompare(a.createdAt || "")
      )
    : null;

  const isTracking = (e) => e.tracking?.until && new Date(e.tracking.until).getTime() > Date.now();
  const set = (k) => (ev) => setManual({ ...manual, [k]: ev.target.value });

  return (
    <div>
      <h1>Wishlist Analyzer</h1>
      <p className="sub">
        Paste a video that made you think “I wish I'd made that” — get the autopsy: real metrics vs the channel's own
        median, the hook pattern, why it worked, and how to steal it for your niche. YouTube = full API mode with 48h
        tracking; Instagram/Facebook = manual-metrics mode (we never scrape Meta).
      </p>

      {data && !data.hasYtKey && (
        <div className="panel" style={{ borderColor: "var(--warn, #b58900)", marginBottom: 14 }}>
          <span className="muted">
            <strong style={{ color: "var(--text)" }}>No YOUTUBE_API_KEY</strong> — YouTube autopsies are idle; manual
            IG/FB entries work now.
          </span>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            placeholder="https://youtube.com/watch?v=…  or  youtu.be/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addUrl()}
            disabled={busy || !data?.hasYtKey}
          />
          <button className="btn" disabled={busy || !url.trim() || !data?.hasYtKey} onClick={addUrl}>
            {busy ? <span className="spin" /> : null}Analyze
          </button>
          <button className="btn ghost" onClick={() => setShowManual(!showManual)}>
            {showManual ? "Close manual" : "IG/FB manual"}
          </button>
          <button className="btn ghost sm" disabled={busy} onClick={poll} title="re-poll tracked YouTube entries">
            Poll tracking
          </button>
        </div>

        {showManual && (
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <select value={manual.platform} onChange={set("platform")}>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
            </select>
            <input placeholder="post URL (optional)" value={manual.url} onChange={set("url")} style={{ gridColumn: "span 3" }} />
            <input placeholder="views *" value={manual.views} onChange={set("views")} />
            <input placeholder="likes *" value={manual.likes} onChange={set("likes")} />
            <input placeholder="comments *" value={manual.comments} onChange={set("comments")} />
            <input placeholder="shares" value={manual.shares} onChange={set("shares")} />
            <input placeholder="hours since post *" value={manual.hoursSincePost} onChange={set("hoursSincePost")} />
            <input placeholder="creator followers *" value={manual.creatorFollowerCount} onChange={set("creatorFollowerCount")} />
            <input placeholder="caption (paste)" value={manual.caption} onChange={set("caption")} style={{ gridColumn: "span 2" }} />
            <input placeholder="describe the first 3 seconds" value={manual.firstSeconds} onChange={set("firstSeconds")} style={{ gridColumn: "span 3" }} />
            <button className="btn" disabled={busy || !manual.views} onClick={addManual}>
              {busy ? <span className="spin" /> : null}Analyze manual
            </button>
          </div>
        )}
      </div>

      {note && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, whiteSpace: "pre-wrap" }}>{note}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className={`chip${sortByTier ? " on" : ""}`} onClick={() => setSortByTier(true)}>by tier</button>
        <button className={`chip${!sortByTier ? " on" : ""}`} onClick={() => setSortByTier(false)}>newest</button>
      </div>

      {!entries ? (
        <div className="empty">loading…</div>
      ) : entries.length === 0 ? (
        <div className="empty">nothing analyzed yet — paste a video you wish you'd made</div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {entries.map((e) => (
            <div key={e.id} className="panel" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                <span className={`badge ${TIER_CLASS[e.predictedTier] || "ok"}`} style={{ fontSize: 15, minWidth: 30, textAlign: "center" }}>
                  {e.predictedTier}
                </span>
                <span className="chip static" style={{ fontSize: 11 }}>{e.platform}</span>
                {e.mode === "manual" && <span className="chip static" style={{ fontSize: 11 }}>manual mode</span>}
                {isTracking(e) && <span className="badge warm" style={{ fontSize: 11 }}>tracking</span>}
                <strong style={{ flex: 1 }}>
                  {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.title}</a> : e.title}
                </strong>
                <button className="btn ghost sm" disabled={busy} onClick={() => briefIt(e.id)}>Brief it</button>
                <button className="btn ghost sm" onClick={() => del(e.id)}>✕</button>
              </div>
              <div className="mono muted" style={{ fontSize: 12 }}>
                {fmt(e.metrics.views)} views · {(e.metrics.engagementRate * 100).toFixed(1)}% eng ·{" "}
                {e.mode === "api"
                  ? `${e.metrics.outlierRatio ?? "?"}x channel median · ${fmt(e.metrics.viewsPerHour)}/h${e.metrics.trackedViewsPerHour ? ` · tracked ${fmt(e.metrics.trackedViewsPerHour)}/h` : ""}`
                  : `${e.metrics.viewsPerFollower}x followers · ${fmt(e.metrics.viewsPerHour)}/h`}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{e.verdict?.rubric}</div>
              {e.contentAnalysis ? (
                <div style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8, fontSize: 13 }}>
                  <div>
                    <span className="chip static" style={{ fontSize: 11 }}>{e.contentAnalysis.hookPattern}</span>{" "}
                    <span className="muted">topic:</span> {e.contentAnalysis.topic}{" "}
                    <span className="muted">· specificity {e.contentAnalysis.titleSpecificity}/10</span>
                  </div>
                  <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                    {(e.contentAnalysis.whyItWorked || []).map((w, i) => (
                      <li key={i} style={{ fontSize: 12.5 }}>{w}</li>
                    ))}
                  </ul>
                  <div style={{ marginTop: 6 }}>
                    <strong>Steal this:</strong> {e.contentAnalysis.stealThis}
                  </div>
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>structural analysis pending an LLM key</div>
              )}
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
