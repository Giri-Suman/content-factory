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

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setConfig(d.config);
        setEnv(d.env);
      });
  }, []);

  const toggle = async (cat) => {
    const next = { ...config, categories: { ...config.categories, [cat]: !config.categories[cat] } };
    setConfig(next);
    setSaved(false);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categories: next.categories }),
    });
    setSaved(true);
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
    </div>
  );
}
