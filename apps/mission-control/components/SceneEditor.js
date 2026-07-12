"use client";

const TYPES = ["kinetic", "code", "screenshot", "terminal", "stat", "quote", "meme"];

/** Per-scene form: shared voiceover + fields specific to the scene type. */
export function SceneEditor({ scene, index, total, onChange, onMove, onDelete }) {
  const set = (key, value) => onChange({ ...scene, [key]: value });

  return (
    <div className="panel">
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <span className="mono muted" style={{ fontSize: 11 }}>
          #{index + 1}
        </span>
        <select value={scene.type} onChange={(e) => set("type", e.target.value)} style={{ width: 130 }}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span style={{ flex: 1 }} />
        <button className="btn sm ghost" onClick={() => onMove(-1)} disabled={index === 0} title="move up">
          ↑
        </button>
        <button className="btn sm ghost" onClick={() => onMove(1)} disabled={index === total - 1} title="move down">
          ↓
        </button>
        <button className="btn sm danger" onClick={onDelete} title="delete scene">
          ✕
        </button>
      </div>

      <label className="field" style={{ marginTop: 0 }}>
        voiceover
      </label>
      <textarea value={scene.voiceover || ""} onChange={(e) => set("voiceover", e.target.value)} />

      {scene.type === "kinetic" && (
        <>
          <label className="field">emphasis words (comma separated)</label>
          <input
            type="text"
            value={(scene.emphasis || []).join(", ")}
            onChange={(e) =>
              set(
                "emphasis",
                e.target.value
                  .split(",")
                  .map((w) => w.trim())
                  .filter(Boolean)
              )
            }
          />
        </>
      )}

      {scene.type === "code" && (
        <>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 140 }}>
              <label className="field">language</label>
              <input type="text" value={scene.lang || "javascript"} onChange={(e) => set("lang", e.target.value)} />
            </div>
            <div style={{ width: 160 }}>
              <label className="field">focus lines (e.g. 4-6)</label>
              <input
                type="text"
                value={Array.isArray(scene.focus) ? scene.focus.join("-") : ""}
                onChange={(e) => {
                  const m = e.target.value.match(/(\d+)\s*-\s*(\d+)/);
                  set("focus", m ? [Number(m[1]), Number(m[2])] : undefined);
                }}
              />
            </div>
          </div>
          <label className="field">code</label>
          <textarea className="code" rows={7} value={scene.code || ""} onChange={(e) => set("code", e.target.value)} />
        </>
      )}

      {scene.type === "terminal" && (
        <>
          <label className="field">lines (one per line, commands start with $ )</label>
          <textarea
            className="code"
            rows={5}
            value={(scene.lines || []).join("\n")}
            onChange={(e) => set("lines", e.target.value.split("\n"))}
          />
        </>
      )}

      {scene.type === "screenshot" && (
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="field">url to capture</label>
            <input type="text" value={scene.src || ""} onChange={(e) => set("src", e.target.value)} />
          </div>
          <div style={{ width: 120 }}>
            <label className="field">pan</label>
            <select value={scene.pan || "down"} onChange={(e) => set("pan", e.target.value)}>
              {["down", "up", "in", "out"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {scene.type === "stat" && (
        <>
          <label className="field">chart label</label>
          <input type="text" value={scene.label || ""} onChange={(e) => set("label", e.target.value)} />
          <label className="field">bars (name: value suffix — one per line, e.g. “Quiz Shorts: 100 %”)</label>
          <textarea
            className="code"
            rows={4}
            value={(scene.stats || []).map((s) => `${s.name}: ${s.value}${s.suffix || ""}`).join("\n")}
            onChange={(e) =>
              set(
                "stats",
                e.target.value
                  .split("\n")
                  .map((line) => {
                    const m = line.match(/^(.*?):\s*([\d.]+)\s*(.*)$/);
                    return m ? { name: m[1].trim(), value: Number(m[2]), suffix: m[3].trim() || undefined } : null;
                  })
                  .filter(Boolean)
              )
            }
          />
        </>
      )}

      {scene.type === "quote" && (
        <>
          <label className="field">quote</label>
          <input type="text" value={scene.quote || ""} onChange={(e) => set("quote", e.target.value)} />
          <label className="field">attribution</label>
          <input type="text" value={scene.attribution || ""} onChange={(e) => set("attribution", e.target.value)} />
        </>
      )}

      {scene.type === "meme" && (
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ width: 90 }}>
            <label className="field">emoji</label>
            <input type="text" value={scene.emoji || "🤖"} onChange={(e) => set("emoji", e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="field">caption (max ~6 words)</label>
            <input type="text" value={scene.text || ""} onChange={(e) => set("text", e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}
