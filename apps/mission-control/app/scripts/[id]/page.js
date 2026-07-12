"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SceneEditor } from "../../../components/SceneEditor.js";

export default function ScriptEditorPage() {
  const { id } = useParams();
  const router = useRouter();
  const [script, setScript] = useState(null);
  const [meta, setMeta] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    fetch(`/api/scripts/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setScript(d.script);
          setMeta(d.meta);
        }
      });
    return () => clearInterval(pollRef.current);
  }, [id]);

  const mutate = (fn) => {
    setScript((s) => {
      const next = structuredClone(s);
      fn(next);
      return next;
    });
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    await fetch(`/api/scripts/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ script }),
    });
    setSaving(false);
    setSaved(true);
  };

  const render = async () => {
    await save();
    const res = await fetch("/api/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error || "render failed to start");
      return;
    }
    const poll = async () => {
      const jr = await fetch(`/api/jobs/${data.jobId}`).then((r) => r.json());
      setJob(jr.job);
      if (jr.job?.status !== "running") clearInterval(pollRef.current);
    };
    poll();
    pollRef.current = setInterval(poll, 2500);
  };

  if (error && !script) return <div className="empty">{error}</div>;
  if (!script) return <div className="empty">loading…</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <h1 style={{ flex: 1 }}>Script editor</h1>
        <button className="btn ghost" onClick={save} disabled={saving}>
          {saving ? <span className="spin" /> : null}
          {saved ? "Saved ✓" : "Save"}
        </button>
        <button className="btn" onClick={render} disabled={job?.status === "running"}>
          {job?.status === "running" ? (
            <>
              <span className="spin" />
              rendering…
            </>
          ) : (
            "Approve & render"
          )}
        </button>
      </div>
      <p className="sub">
        This is the review gate — your edit pass is what keeps the channel human. Punch up the jokes, then approve.
      </p>

      {job && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
            <span className={`badge ${job.status === "done" ? "ok" : job.status === "failed" ? "hot" : "warm"}`}>
              {job.status}
            </span>
            <span className="mono muted" style={{ fontSize: 11.5 }}>
              {job.id}
            </span>
            {job.status === "done" && (
              <button className="btn sm" onClick={() => router.push("/renders")}>
                View renders →
              </button>
            )}
          </div>
          <div className="log">{(job.log || "").split("\n").slice(-14).join("\n")}</div>
        </div>
      )}

      <div className="grid2">
        <div>
          <label className="field">video title (intro card)</label>
          <input type="text" value={script.title || ""} onChange={(e) => mutate((s) => (s.title = e.target.value))} />

          <label className="field">outro CTA</label>
          <input
            type="text"
            value={script.outro?.cta || ""}
            onChange={(e) => mutate((s) => (s.outro = { ...(s.outro || {}), cta: e.target.value }))}
          />

          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            {script.scenes.map((scene, i) => (
              <SceneEditor
                key={i}
                index={i}
                total={script.scenes.length}
                scene={scene}
                onChange={(next) => mutate((s) => (s.scenes[i] = next))}
                onMove={(dir) =>
                  mutate((s) => {
                    const j = i + dir;
                    if (j < 0 || j >= s.scenes.length) return;
                    [s.scenes[i], s.scenes[j]] = [s.scenes[j], s.scenes[i]];
                  })
                }
                onDelete={() => mutate((s) => s.scenes.splice(i, 1))}
              />
            ))}
            <button
              className="btn ghost"
              onClick={() =>
                mutate((s) => s.scenes.push({ type: "kinetic", voiceover: "New beat goes here.", emphasis: [] }))
              }
            >
              + Add scene
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {meta?.titles && (
            <div className="panel">
              <label className="field" style={{ marginTop: 0 }}>
                title options — click to use
              </label>
              {meta.titles.map((t, i) => (
                <div
                  key={i}
                  onClick={() => mutate((s) => (s.title = t))}
                  style={{ padding: "6px 0", cursor: "pointer", borderBottom: "1px solid rgba(48,54,61,.4)", fontSize: 13 }}
                >
                  {t}
                </div>
              ))}
            </div>
          )}
          {meta?.hooks && (
            <div className="panel">
              <label className="field" style={{ marginTop: 0 }}>
                alternate hooks
              </label>
              {meta.hooks.map((h, i) => (
                <div key={i} style={{ padding: "6px 0", fontSize: 13 }} className="muted">
                  {h}
                </div>
              ))}
            </div>
          )}
          {meta?.description && (
            <div className="panel">
              <label className="field" style={{ marginTop: 0 }}>
                description
              </label>
              <div style={{ fontSize: 13 }}>{meta.description}</div>
              {meta.tags && (
                <div className="mono muted" style={{ fontSize: 11, marginTop: 10 }}>
                  {meta.tags.join(" · ")}
                </div>
              )}
            </div>
          )}
          {meta?.thumbnail_concepts && (
            <div className="panel">
              <label className="field" style={{ marginTop: 0 }}>
                thumbnail concepts
              </label>
              {meta.thumbnail_concepts.map((t, i) => (
                <div key={i} style={{ padding: "5px 0", fontSize: 13 }} className="muted">
                  {t}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
