"use client";
import { useEffect, useState } from "react";

const CATEGORIES = [
  ["coding", "Coding / Dev", "HN, GitHub trending, r/programming, r/webdev"],
  ["ai", "AI / ML", "HN, GitHub, r/MachineLearning, r/LocalLLaMA, TechCrunch, Verge, Ars"],
  ["math", "Math", "r/math, r/mathematics, r/learnmath"],
  ["makeup", "Makeup / Beauty", "r/MakeupAddiction, r/beauty, r/SkincareAddiction, Allure"],
];

const PROVIDERS = [
  ["anthropic", "Anthropic", "best writing quality — ANTHROPIC_API_KEY"],
  ["openrouter", "OpenRouter", "hundreds of models, cheap + free (:free) — OPENROUTER_API_KEY"],
  ["ollama", "Ollama", "100% free, runs locally — OLLAMA_MODEL"],
];

export default function SettingsPage() {
  const [config, setConfig] = useState(null);
  const [env, setEnv] = useState(null);
  const [saved, setSaved] = useState(false);
  const [quotaToday, setQuotaToday] = useState(0);
  const [jobruns, setJobruns] = useState([]);
  const [keywords, setKeywords] = useState("");
  const [projection, setProjection] = useState(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setConfig(d.config);
        setEnv(d.env);
        setQuotaToday(d.quotaToday || 0);
        setJobruns(d.jobruns || []);
        setKeywords((d.config.youtubeKeywords || []).join(", "));
        setProjection(d.dailyProjection || null);
      });
  }, []);

  const put = async (body) => {
    setSaved(false);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
    if (res.config) setConfig((c) => ({ ...c, ...res.config }));
    setSaved(true);
  };

  const toggle = async (cat) => {
    const next = { ...config, categories: { ...config.categories, [cat]: !config.categories[cat] } };
    setConfig(next);
    await put({ categories: next.categories });
  };

  const saveKeywords = () => put({ youtubeKeywords: keywords.split(",").map((k) => k.trim()).filter(Boolean) });

  const setWeight = (k, v) => {
    const next = { ...config, scoreWeights: { ...config.scoreWeights, [k]: Number(v) } };
    setConfig(next);
  };

  if (!config || !env) return <div className="empty">loading…</div>;

  return (
    <div>
      <h1>Settings</h1>
      <p className="sub">Pick your niches and see what the factory is running on. {saved && "Saved ✓"}</p>

      <div className="panel" style={{ marginBottom: 20 }}>
        <label className="field" style={{ marginTop: 0 }}>
          radar categories — what the trend scanner watches
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          {CATEGORIES.map(([key, label, sources]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className={`chip${config.categories[key] ? " on" : ""}`} onClick={() => toggle(key)}>
                {config.categories[key] ? "● " : "○ "}
                {label}
              </button>
              <span className="muted" style={{ fontSize: 12 }}>
                {sources}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <label className="field" style={{ marginTop: 0 }}>
          AI provider — set keys in <span className="mono">.env</span> at the repo root, then restart the portal
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          {PROVIDERS.map(([key, label, hint]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className={`badge ${env[key] ? "ok" : "cool"}`}>{env[key] ? "configured" : "not set"}</span>
              <strong style={{ width: 90 }}>{label}</strong>
              <span className="muted" style={{ fontSize: 12 }}>
                {hint}
              </span>
              {env.provider === key && <span className="badge warm">active</span>}
            </div>
          ))}
          {!env.provider && (
            <div className="muted" style={{ fontSize: 12.5 }}>
              No provider yet — scoring uses heuristics and scripts come out as fillable templates. Everything still
              works; it just writes itself once you add a key.
            </div>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <label className="field" style={{ marginTop: 0 }}>
          YouTube niche keywords — drives the Niche Heat scan (effective next run)
        </label>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="comma-separated, max 12" style={{ flex: 1 }} />
          <button className="btn sm" onClick={saveKeywords}>Save</button>
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
          each keyword costs 100 quota units per heat scan · used today: <span className="mono">{quotaToday}</span> units
          {projection && (
            <>
              {" "}· projected daily: <span className="mono">{projection.total}</span>/{8000} units ({projection.channels} channels; at 300 channels: <span className="mono">{projection.at300}</span>)
            </>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <label className="field" style={{ marginTop: 0 }}>
          available hours per week — drives the Idea Bank's effort-fit ranking
        </label>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
          <input
            type="number" min="1" max="60"
            value={config.availableHoursPerWeek ?? 6}
            onChange={(e) => setConfig({ ...config, availableHoursPerWeek: e.target.value })}
            onBlur={() => put({ availableHoursPerWeek: config.availableHoursPerWeek })}
            style={{ width: 90 }}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            under 5h: M-effort ideas sink · under 6h: L-effort ideas sink hard
          </span>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <label className="field" style={{ marginTop: 0 }}>
          scoring weights — multipliers on the four opportunity components (0.5–1.5, effective next run)
        </label>
        <div style={{ display: "flex", gap: 18, marginTop: 8, flexWrap: "wrap" }}>
          {Object.entries(config.scoreWeights || {}).map(([k, v]) => (
            <label key={k} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span className="mono">{k} · {Number(v).toFixed(2)}x</span>
              <input
                type="range" min="0.5" max="1.5" step="0.05" value={v}
                onChange={(e) => setWeight(k, e.target.value)}
                onMouseUp={() => put({ scoreWeights: config.scoreWeights })}
                onTouchEnd={() => put({ scoreWeights: config.scoreWeights })}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="panel">
        <label className="field" style={{ marginTop: 0 }}>
          voice & alerts
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className={`badge ${env.elevenlabs ? "ok" : "cool"}`}>{env.elevenlabs ? "configured" : "not set"}</span>
            <strong style={{ width: 90 }}>ElevenLabs</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              your cloned voice — until set, renders use the Windows TTS placeholder
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className={`badge ${env.telegram ? "ok" : "cool"}`}>{env.telegram ? "configured" : "not set"}</span>
            <strong style={{ width: 90 }}>Telegram</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              hot-trend alerts (score ≥ 80) to your phone
            </span>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <label className="field" style={{ marginTop: 0 }}>
          job log — last 30 runs
        </label>
        {jobruns.length === 0 ? (
          <div className="empty">no runs yet — hit “Refresh now” on Today</div>
        ) : (
          <table className="list" style={{ marginTop: 8 }}>
            <thead>
              <tr><th>job</th><th>started</th><th>took</th><th>result</th></tr>
            </thead>
            <tbody>
              {jobruns.map((j) => (
                <tr key={j.id}>
                  <td className="mono" style={{ fontSize: 12 }}>{j.job}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{new Date(j.startedAt).toLocaleString()}</td>
                  <td className="mono muted" style={{ fontSize: 12 }}>{j.ms ? `${(j.ms / 1000).toFixed(1)}s` : "—"}</td>
                  <td>{j.ok ? <span className="badge ok">ok</span> : <span className="badge hot" title={j.error || ""}>failed</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
