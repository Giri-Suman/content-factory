"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export default function PackagingPage() {
  const [data, setData] = useState(null);

  const load = () => fetch("/api/thumbnails").then((r) => r.json()).then(setData);
  useEffect(() => {
    load();
  }, []);

  const verdictClass = (v) => (v === "pass" ? "ok" : "hot");

  return (
    <div>
      <h1>Packaging</h1>
      <p className="sub">
        Thumbnail variants per video (≥2, brand-tokened), each judged for legibility at 120px, contrast, and ≤4 words.
        The highest-scoring passing variant is set as A on YouTube upload; keep B for Studio Test &amp; Compare — native
        A/B is Studio-only, so it lives in your publish checklist.
      </p>

      {!data ? (
        <div className="empty">loading…</div>
      ) : data.thumbnails.length === 0 ? (
        <div className="empty">no thumbnails yet — they generate automatically when a brief renders (or <span className="mono">factory thumbnails &lt;id&gt;</span>)</div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {data.thumbnails.map((t) => (
            <div key={t.briefId} className="panel" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <strong style={{ fontSize: 13.5 }}>{t.copy?.title?.slice(0, 60) || t.briefId}</strong>
                <span className="muted" style={{ fontSize: 11.5 }}>{t.variants.length} variants</span>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {t.variants.map((layout, i) => {
                  const j = t.judged.find((x) => x.layout === layout);
                  const isA = t.judged[0]?.layout === layout;
                  return (
                    <div key={layout} style={{ width: 280 }}>
                      <div style={{ position: "relative" }}>
                        <img
                          src={`/api/thumb/${t.renderId}/${layout}.png`}
                          alt={layout}
                          style={{ width: "100%", borderRadius: 8, border: `2px solid ${isA ? "var(--accent, #ffb224)" : "var(--border)"}`, display: "block" }}
                        />
                        {isA && <span className="badge warm" style={{ position: "absolute", top: 8, left: 8, fontSize: 10 }}>A</span>}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, fontSize: 12 }}>
                        <span className="mono">{layout}</span>
                        {j && <span className={`badge ${verdictClass(j.verdict)}`} style={{ fontSize: 10.5 }}>{j.score} {j.verdict}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
