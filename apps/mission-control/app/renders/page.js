"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useJob, JobLog } from "../../components/useJob.js";
import { PublishPanel } from "../../components/PublishPanel.js";

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function RendersPage() {
  const [renders, setRenders] = useState(null);
  const { job, start, running } = useJob();
  const [activeId, setActiveId] = useState(null);
  const [publishing, setPublishing] = useState(null);

  const load = () =>
    fetch("/api/renders")
      .then((r) => r.json())
      .then((d) => setRenders(d.renders));
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (job?.status === "done") load();
  }, [job]);

  const cutShorts = (id) => {
    setActiveId(id);
    start("/api/shorts", { id });
  };

  return (
    <div>
      <h1>Renders</h1>
      <p className="sub">
        Finished MP4s — watch both aspect ratios before anything ships. “Cut shorts” mines an episode for standalone
        clips. “Publish” uploads private-first with AI disclosure flags after the compliance gate; you flip it public
        in YouTube Studio once you’ve watched it.
      </p>

      {job && activeId && <JobLog job={job} />}

      {!renders ? (
        <div className="empty">loading…</div>
      ) : renders.length === 0 ? (
        <div className="empty">nothing rendered yet — approve a script or render a math short</div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 16 }}
        >
          {renders.map((r) => {
            // clip mining needs the scene timeline (props.json) — only scripted episodes have one
            const hasEpisode =
              r.files.some((f) => f.name === "short.mp4") && !r.id.startsWith("math-") && !r.id.startsWith("edit-");
            return (
              <div key={r.id} className="panel" id={r.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, flex: 1 }}>{r.id}</div>
                  {hasEpisode && (
                    <button
                      className="btn ghost sm"
                      disabled={running}
                      onClick={() => cutShorts(r.id)}
                      title="mine 1-3 standalone clips from this episode"
                    >
                      {running && activeId === r.id ? <span className="spin" /> : null}Cut shorts
                    </button>
                  )}
                  <button
                    className="btn sm"
                    onClick={() => setPublishing(publishing === r.id ? null : r.id)}
                  >
                    {publishing === r.id ? "Close" : "Publish"}
                  </button>
                </div>

                {publishing === r.id && (
                  <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid var(--border)" }}>
                    <PublishPanel id={r.id} which={r.files.some((f) => f.name === "wide.mp4") ? "wide" : "short"} />
                  </div>
                )}
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {r.files.map((f) => (
                    <div key={f.name} style={{ maxWidth: f.name.includes("wide") ? 480 : 220 }}>
                      <video
                        controls
                        preload="metadata"
                        src={`/api/video/${r.id}/${f.name}`}
                        style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)", background: "#000" }}
                      />
                      <div className="mono muted" style={{ fontSize: 11, marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span>
                          {f.name} · {mb(f.size)}
                        </span>
                        {/* `download` matters: without it the browser plays the
                            file inline and there is no obvious way to save it —
                            fine if you know to right-click, confusing otherwise. */}
                        <a
                          href={`/api/video/${r.id}/${f.name}?download=1`}
                          download={`${r.id}-${f.name}`}
                          className="btn ghost sm"
                          style={{ fontSize: 11, padding: "2px 8px" }}
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
