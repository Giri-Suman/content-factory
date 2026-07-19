"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const STATUS_CLASS = { preparing: "warm", ready: "ok", published: "ok", failed: "hot" };

const golden60Left = (publishedAt) => {
  if (!publishedAt) return null;
  const ms = new Date(publishedAt).getTime() + 60 * 60e3 - Date.now();
  if (ms <= 0) return "window over";
  return `${Math.floor(ms / 6e4)}m left`;
};

export default function PublishCenterPage() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);
  const [fileInputs, setFileInputs] = useState({});

  const load = () => fetch("/api/center").then((r) => r.json()).then(setData);
  useEffect(() => {
    load();
    const t = setInterval(load, 60e3); // golden-60 countdowns stay live
    return () => clearInterval(t);
  }, []);

  const act = async (body, busyKey) => {
    setBusy(busyKey);
    setNote(null);
    const res = await fetch("/api/center", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
    setBusy(null);
    if (res.out || res.error) setNote(res.out || res.error);
    load();
  };

  const copy = async (text, label) => {
    await navigator.clipboard.writeText(text);
    setNote(`${label} copied to clipboard`);
  };

  const copyText = (i) => {
    if (i.platform === "instagram") return [i.assets.caption, (i.assets.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
    if (i.platform === "linkedin") return i.assets.post_text || "";
    if (i.platform === "x") return (i.assets.thread || []).join("\n\n");
    return [i.assets.title, i.assets.description, (i.assets.tags || []).join(", ")].filter(Boolean).join("\n\n");
  };

  return (
    <div>
      <h1>Publish Center</h1>
      <p className="sub">
        Today's queue, ordered by target time. YouTube publishes as a staged draft you flip live in Studio; IG/X/
        LinkedIn are copy-and-post until their APIs unlock. Golden 60: the first hour of comment replies is a ranking
        input no automation can fake — tick it every time.
      </p>

      {data && !data.ytOauth && (
        <div className="panel" style={{ borderColor: "var(--warn, #b58900)", marginBottom: 14 }}>
          <span className="muted">
            <strong style={{ color: "var(--text)" }}>YouTube OAuth not set</strong> — staged uploads are idle. Run{" "}
            <span className="mono">factory auth-youtube</span> once; IG/X/LinkedIn manual flows work now.
          </span>
        </div>
      )}
      {data?.autoMode && (
        <div className="panel" style={{ borderColor: "var(--red)", marginBottom: 14 }}>
          <strong>AUTO MODE ON</strong> — uploads go public directly. Staged is the fallback if anything fails.
        </div>
      )}
      {note && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, whiteSpace: "pre-wrap" }}>{note}</div>}

      {!data ? (
        <div className="empty">loading…</div>
      ) : data.items.length === 0 ? (
        <div className="empty">queue empty — approve a brief, then “Send to Publish Center” on the Briefs page</div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {data.items.map((i) => (
            <div key={i.id} className="panel" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span className={`badge ${STATUS_CLASS[i.status] || "cool"}`}>{i.status}</span>
                <span className="chip static" style={{ fontSize: 11 }}>{i.platform}</span>
                <span className="mono muted" style={{ fontSize: 11.5 }}>{i.scheduledText}</span>
                <strong style={{ flex: 1 }}>{i.topic}</strong>

                {i.status !== "published" && i.platform === "youtube" && (
                  <button className="btn sm" disabled={busy === i.id || !i.assets.videoFile} onClick={() => act({ action: "publish", itemId: i.id }, i.id)}
                    title={i.assets.videoFile ? "staged upload" : "attach a video file first"}>
                    {busy === i.id ? <span className="spin" /> : null}Publish
                  </button>
                )}
                {i.status !== "published" && i.platform !== "youtube" && (
                  <button className="btn sm" disabled={busy === i.id} onClick={() => act({ action: "publish", itemId: i.id }, i.id)}>
                    {busy === i.id ? <span className="spin" /> : null}Mark posted
                  </button>
                )}
                {i.status === "ready" && (
                  <button className="btn ghost sm" onClick={() => act({ action: "live", itemId: i.id }, i.id)}>Mark live</button>
                )}
              </div>

              {i.platform === "youtube" && i.status !== "published" && (
                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    placeholder={i.assets.videoFile || "paste full path to the finished video file"}
                    value={fileInputs[i.id] ?? ""}
                    onChange={(e) => setFileInputs({ ...fileInputs, [i.id]: e.target.value })}
                    className="mono"
                    style={{ flex: 1, fontSize: 12 }}
                  />
                  <button className="btn ghost sm" disabled={!fileInputs[i.id]?.trim()}
                    onClick={() => act({ action: "attach", itemId: i.id, file: fileInputs[i.id].trim() }, `a${i.id}`)}>
                    Attach
                  </button>
                  {i.assets.videoFile && <span className="badge ok" style={{ fontSize: 10.5 }}>file ✓</span>}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn ghost sm" onClick={() => copy(copyText(i), i.platform)}>Copy all</button>
                {i.studioUrl && <a href={i.studioUrl} target="_blank" rel="noreferrer" className="btn ghost sm">Open in Studio</a>}
                {i.externalUrl && <a href={i.externalUrl} target="_blank" rel="noreferrer" className="mono muted" style={{ fontSize: 12 }}>{i.externalUrl}</a>}
                {i.status === "published" && (
                  <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, cursor: "pointer", marginLeft: "auto" }}>
                    <input type="checkbox" checked={Boolean(i.golden60Done)} onChange={() => act({ action: "golden", itemId: i.id }, `g${i.id}`)} />
                    Golden 60 {i.golden60Done ? "done ✓" : `— reply to every comment (${golden60Left(i.publishedAt) || ""})`}
                  </label>
                )}
              </div>

              <div className="muted" style={{ fontSize: 12, marginTop: 6, whiteSpace: "pre-wrap" }}>
                {i.platform === "youtube" && `${i.assets.title}\n${i.assets.description}`.slice(0, 200)}
                {i.platform === "instagram" && (i.assets.manualChecklist || []).map((s, n) => `${n + 1}. ${s}`).join("\n")}
                {i.platform === "linkedin" && (i.assets.post_text || "").slice(0, 160)}
                {i.platform === "x" && (i.assets.thread || []).map((t, n) => `${n + 1}/ ${t.slice(0, 60)}`).join("\n")}
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
