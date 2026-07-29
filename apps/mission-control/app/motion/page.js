"use client";
import { useEffect, useState } from "react";
import { motion as m } from "framer-motion";

const SCENES = ["hook", "kinetic", "quote", "stat", "screenshot", "terminal", "code", "outro"];
const NICHES = ["coding", "ai-automation", "math", "makeup", "nails", "cooking", "fitness"];

const FAM_COLOR = {
  ambient: "#58a6ff", type: "#ffb224", transition: "#4cc38a",
  dimensional: "#bc8cff", data: "#ff9f6b", compare: "#ff6b6b", overlay: "#8b949e",
};

export default function MotionPage() {
  const [data, setData] = useState(null);
  const [scene, setScene] = useState("hook");
  const [niche, setNiche] = useState("coding");
  const [fam, setFam] = useState("");
  const [playing, setPlaying] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch(`/api/motion?scene=${scene}&niche=${niche}`)
      .then((r) => r.json())
      .then(setData);

  useEffect(() => {
    load();
  }, [scene, niche]);

  const benchAll = async () => {
    setBusy(true);
    await fetch("/api/motion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "benchAll" }),
    });
    setBusy(false);
  };

  if (!data) return <div className="empty">loading…</div>;

  const live = data.effects.filter((e) => e.impl === "live");
  const shown = fam ? data.effects.filter((e) => e.family === fam) : data.effects;
  const families = [...new Set(data.effects.map((e) => e.family))];
  const suggestedIds = new Set(data.suggested.map((s) => s.id));

  return (
    <div>
      <h1>Motion Lab</h1>
      <p className="sub">
        {live.length} coded effects, {data.effects.length - live.length} spec&apos;d. Every one is a generator we own —
        nothing here is scraped from another creator&apos;s work. Scores come from rendering the effect and measuring
        real pixels, not from guessing what looks viral.
      </p>

      {/* suggest bar */}
      <div className="panel" style={{ marginBottom: 14 }}>
        <label className="field" style={{ marginTop: 0 }}>What are you building?</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
          <select value={scene} onChange={(e) => setScene(e.target.value)}>
            {SCENES.map((s) => <option key={s} value={s}>{s} scene</option>)}
          </select>
          <select value={niche} onChange={(e) => setNiche(e.target.value)}>
            {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="btn ghost sm" disabled={busy} onClick={benchAll}>
            {busy ? <span className="spin" /> : null}Re-bench all (renders 16 clips)
          </button>
        </div>
        {data.suggested.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>
              ranked for a <strong>{scene}</strong> scene in <strong>{niche}</strong>
              {!data.hasResults && " — fit heuristic + measured attention; not yet YOUR retention"}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {data.suggested.map((s, i) => (
                <span key={s.id} className="badge" style={{ background: i === 0 ? "var(--accent)" : "var(--panel)", color: i === 0 ? "#0d1117" : "var(--text)", fontSize: 11 }}>
                  {i + 1}. {s.id} · {s.score}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {!data.hasResults && (
        <div className="panel" style={{ marginBottom: 14, borderLeft: "3px solid var(--accent)" }}>
          <div style={{ fontSize: 12.5 }}>
            <strong>These rankings aren&apos;t yours yet.</strong> Tag the effects you actually ship —
            <code style={{ margin: "0 4px" }}>factory motion tag &lt;post-id&gt; word-punch aurora-mesh</code>
            — and after ~20 posts the order reranks on your own retention instead of my heuristics.
          </div>
        </div>
      )}

      {/* family filter */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <button className={`btn ghost sm${fam === "" ? " active" : ""}`} onClick={() => setFam("")}>all</button>
        {families.map((f) => (
          <button key={f} className={`btn ghost sm${fam === f ? " active" : ""}`} onClick={() => setFam(f)}
            style={{ borderColor: fam === f ? FAM_COLOR[f] : undefined, color: fam === f ? FAM_COLOR[f] : undefined }}>
            {f}
          </button>
        ))}
      </div>

      {/* grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(268px, 1fr))", gap: 12 }}>
        {shown.map((e, i) => (
          <m.div
            key={e.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.02, 0.3) }}
            className="panel"
            style={{ padding: 0, overflow: "hidden", opacity: e.impl === "spec" ? 0.62 : 1, borderColor: suggestedIds.has(e.id) ? "var(--accent)" : undefined }}
          >
            {/* preview */}
            <div style={{ aspectRatio: "9/16", maxHeight: 260, background: "#0d1117", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {e.hasPreview ? (
                <video
                  src={`/api/video/_motion/${e.id}.mp4`}
                  muted
                  loop
                  playsInline
                  autoPlay={playing === e.id}
                  onMouseEnter={(ev) => { setPlaying(e.id); ev.currentTarget.play().catch(() => {}); }}
                  onMouseLeave={(ev) => { ev.currentTarget.pause(); ev.currentTarget.currentTime = 0; }}
                  style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
                />
              ) : (
                <div className="muted" style={{ fontSize: 11.5, textAlign: "center", padding: 12 }}>
                  {e.impl === "spec" ? "spec'd — not coded yet" : "no preview yet\nrun bench to render one"}
                </div>
              )}
              <span className="badge" style={{ position: "absolute", top: 8, left: 8, background: FAM_COLOR[e.family], color: "#0d1117", fontSize: 10, fontWeight: 700 }}>
                {e.family}
              </span>
              {e.measured?.attention != null && (
                <span className="badge" style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.7)", fontSize: 10 }}>
                  {e.measured.attention}
                </span>
              )}
            </div>
            {/* meta */}
            <div style={{ padding: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                <strong style={{ fontSize: 13 }}>{e.name}</strong>
                <span className="muted mono" style={{ fontSize: 10.5 }}>{e.cost}×</span>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.45 }}>{e.note}</div>
              {e.measured && (
                <div style={{ fontSize: 11, marginTop: 7, color: "var(--muted)" }}>
                  {e.measured.reading}
                  {e.wraps && <div style={{ opacity: 0.75, marginTop: 2 }}>wrapper — your footage supplies the motion</div>}
                </div>
              )}
              {e.yours && (
                <div style={{ fontSize: 11, marginTop: 6, color: e.yours.ratio >= 1 ? "var(--green)" : "var(--muted)" }}>
                  your posts: {e.yours.ratio}× median (n={e.yours.n})
                </div>
              )}
              {e.loops && <span className="badge ok" style={{ fontSize: 9.5, marginTop: 7 }}>loops clean</span>}
            </div>
          </m.div>
        ))}
      </div>
    </div>
  );
}
