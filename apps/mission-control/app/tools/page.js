"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const ANALYSES = [
  ["health", "System health", "one audit across all 25 milestones — catches features that run but produce degraded output"],
  ["gaps", "Back-catalog gaps", "every demand signal minus what you've published"],
  ["repurpose", "Repurpose scan", "your own posts worth a sequel, update, or re-cut"],
  ["competitors", "Competitor diff", "what changed on the watchlist this week"],
  ["calendar", "Content calendar", "14-day ship schedule + cadence gaps"],
  ["prune", "Data hygiene", "what a prune would remove (dry run)"],
];

export default function ToolsPage() {
  const [data, setData] = useState(null);
  const [out, setOut] = useState({});
  const [busy, setBusy] = useState(null);
  const [renderId, setRenderId] = useState("");
  const [file, setFile] = useState("");

  const load = () => fetch("/api/tools").then((r) => r.json()).then(setData);
  useEffect(() => {
    load();
  }, []);

  const view = async (key) => {
    setBusy(key);
    const r = await fetch(`/api/tools?view=${key}`).then((x) => x.json());
    setOut((o) => ({ ...o, [key]: r.text || r.error }));
    setBusy(null);
  };

  const act = async (action, arg, arg2) => {
    setBusy(action);
    const r = await fetch("/api/tools", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, arg, arg2 }),
    }).then((x) => x.json());
    setOut((o) => ({ ...o, [action]: r.text || (r.jobId ? `running in background (job ${r.jobId}) — check Renders when it finishes` : r.error) }));
    setBusy(null);
    load();
  };

  const Out = ({ k }) =>
    out[k] ? (
      <pre className="mono" style={{ fontSize: 11.5, whiteSpace: "pre-wrap", background: "var(--bg)", padding: 10, borderRadius: 6, marginTop: 8, maxHeight: 300, overflow: "auto" }}>
        {out[k]}
      </pre>
    ) : null;

  return (
    <div>
      <h1>Creator Tools</h1>
      <p className="sub">
        The practical layer around the pipeline: caption sidecars YouTube can actually index, chapters, a teleprompter
        for capture days, batch production, and the analyses that tell you what to make next.
      </p>

      {!data ? (
        <div className="empty">loading…</div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {/* per-render exports */}
          <div className="panel" style={{ marginBottom: 14 }}>
            <label className="field" style={{ marginTop: 0 }}>Upload kit — pick a render</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
              <select value={renderId} onChange={(e) => setRenderId(e.target.value)} style={{ minWidth: 220 }}>
                <option value="">select a render…</option>
                {data.renders.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <button className="btn sm" disabled={!renderId || busy} onClick={() => act("captions", renderId)}>
                {busy === "captions" ? <span className="spin" /> : null}Export .srt/.vtt
              </button>
              <button className="btn ghost sm" disabled={!renderId || busy} onClick={() => act("chapters", renderId)}>Chapters</button>
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
              burned-in captions are pixels — YouTube can't read them. The .srt gets indexed for search.
            </div>
            <Out k="captions" />
            <Out k="chapters" />
          </div>

          {/* batch + longform */}
          <div className="panel" style={{ marginBottom: 14 }}>
            <label className="field" style={{ marginTop: 0 }}>Production</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
              <button className="btn sm" disabled={busy} onClick={() => act("batch", 3)}>
                {busy === "batch" ? <span className="spin" /> : null}Batch produce 3
              </button>
              <span className="muted" style={{ fontSize: 11.5 }}>sequential, $5 ceiling</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
              <input placeholder="path to YOUR long recording.mp4" value={file} onChange={(e) => setFile(e.target.value)} className="mono" style={{ flex: 1, minWidth: 240, fontSize: 12 }} />
              <button className="btn ghost sm" disabled={!file.trim() || busy} onClick={() => act("longform", file.trim(), 3)}>Mine 3 Shorts</button>
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
              your own footage only — this isn't a downloader for other people's videos
            </div>
            <Out k="batch" />
            <Out k="longform" />
          </div>

          {/* niche + reach */}
          <div className="panel" style={{ marginBottom: 14 }}>
            <label className="field" style={{ marginTop: 0 }}>Niche & reach</label>
            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              {["coding", "ai-automation", "math", "makeup", "nails", "cooking", "fitness"].map((n) => (
                <button key={n} className="btn ghost sm" disabled={busy} onClick={() => act("nichepack", n)}>{n}</button>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
              proven shot structure, hooks, pacing and gotchas per niche — the capture lane uses these automatically
            </div>
            <Out k="nichepack" />
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn ghost sm" disabled={!renderId || busy} onClick={() => act("translate", renderId, "es hi")}>
                Translate captions (ES + HI)
              </button>
              <button className="btn ghost sm" disabled={!file.trim() || busy} onClick={() => act("reframe", file.trim(), "auto")}>
                Smart reframe 16:9 → 9:16
              </button>
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
              reframe finds where the motion is (hands, brush, pen) instead of blind center-cropping
            </div>
            <Out k="translate" />
            <Out k="reframe" />
          </div>

          {/* engagement */}
          <div className="panel" style={{ marginBottom: 14 }}>
            <label className="field" style={{ marginTop: 0 }}>Engagement</label>
            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <button className="btn ghost sm" disabled={busy} onClick={() => act("cta", "yt_short")}>Next CTA (rotates)</button>
              <button className="btn ghost sm" disabled={busy} onClick={() => act("replies")}>Draft comment replies</button>
              <button className="btn ghost sm" disabled={busy} onClick={() => act("link", "video")}>Link block (UTM)</button>
              <button className="btn ghost sm" disabled={busy} onClick={() => act("stock", "b-roll", "video")}>Find b-roll</button>
              <button className="btn ghost sm" disabled={busy} onClick={() => act("stock", "upbeat", "music")}>Find music</button>
            </div>
            <Out k="link" />
            <Out k="stock" />
            <Out k="cta" />
            <Out k="replies" />
            {data.replyDrafts.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>{data.replyDrafts.length} draft(s) awaiting your review — nothing posts automatically</div>
                {data.replyDrafts.slice(0, 5).map((l) => (
                  <div key={l.id} style={{ fontSize: 12.5, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                    <div className="muted">Q: {l.comment.slice(0, 90)}</div>
                    <div>A: {l.replyDraft}</div>
                  </div>
                ))}
              </div>
            )}
            {data.titleTests.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="muted" style={{ fontSize: 11.5 }}>title A/B tests</div>
                {data.titleTests.map((t) => (
                  <div key={t.id} style={{ fontSize: 12, padding: "3px 0" }}>
                    <span className={`badge ${t.status === "decided" ? "ok" : "warm"}`} style={{ fontSize: 10 }}>{t.status}</span>{" "}
                    {t.winner ? <strong>winner {t.winner}</strong> : `swap ${new Date(t.swapAt).toLocaleDateString()}`} · A: {t.variantA.slice(0, 34)}…
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* analyses */}
          <div className="panel">
            <label className="field" style={{ marginTop: 0 }}>Analysis (read-only, no cost)</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {ANALYSES.map(([key, label, note]) => (
                <div key={key}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button className="btn ghost sm" style={{ minWidth: 120 }} disabled={busy} onClick={() => view(key)}>
                      {busy === key ? <span className="spin" /> : null}{label}
                    </button>
                    <span className="muted" style={{ fontSize: 11.5, flex: 1 }}>{note}</span>
                  </div>
                  <Out k={key} />
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
