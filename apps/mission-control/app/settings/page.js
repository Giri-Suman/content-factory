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
  const [language, setLanguage] = useState("");
  const [languages, setLanguages] = useState([]);
  const [edit, setEdit] = useState({});
  const [editOptions, setEditOptions] = useState([]);
  const [quotaToday, setQuotaToday] = useState(0);
  const [jobruns, setJobruns] = useState([]);
  const [keywords, setKeywords] = useState("");
  const [projection, setProjection] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [flags, setFlags] = useState(null);
  const [aiTiers, setAiTiers] = useState(null);
  const [svcTiers, setSvcTiers] = useState(null);

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
        setBudgets(d.budgets || []);
        setFlags(d.flags || null);
        setAiTiers(d.aiTiers || null);
        setSvcTiers(d.serviceTiers || null);
        setLanguage(d.language ?? "");
        setEdit(d.edit || {});
        setEditOptions(d.editOptions || []);
        setLanguages(d.languages || []);
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

      {aiTiers && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <label className="field" style={{ marginTop: 0 }}>
            AI tiers — pick what each job is worth. Free is $0 forever (local Ollama); a failure falls to a
            cheaper tier, never a pricier one.
          </label>

          <div style={{ display: "flex", gap: 10, margin: "10px 0", flexWrap: "wrap" }}>
            {aiTiers.availability.map((t) => (
              <div key={t.tier} className="panel" style={{ flex: 1, minWidth: 190, padding: "10px 12px", borderColor: t.available ? "var(--green)" : "var(--border)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <strong style={{ textTransform: "capitalize" }}>{t.tier}</strong>
                  <span className={`badge ${t.available ? "ok" : "cool"}`} style={{ fontSize: 10 }}>{t.available ? "ready" : "not set up"}</span>
                  {t.tier === "free" && <span className="muted" style={{ fontSize: 10.5 }}>$0</span>}
                </div>
                {t.options.map((o) => (
                  <div key={o.label} className="muted" style={{ fontSize: 11.5, padding: "1px 0" }}>
                    {o.ready ? "● " : "○ "}{o.label} <span className="mono">{o.model}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            {[
              ["score", "Scoring & judging", "runs hundreds of times — cheapest tier saves the most"],
              ["script", "Scripts & briefs", "a few calls per video — where premium actually pays"],
              ["analysis", "Analysis & lessons", "autopsies, memos, lesson distillation"],
            ].map(([task, label, note]) => (
              <div key={task} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ width: 150, fontSize: 13 }}>{label}</span>
                {/* tier list comes from the registry via the API — hardcoding it
                    here is how the old 3-tier names outlived the 4-tier change */}
                {(aiTiers.availability || []).map((a) => a.tier).map((tier) => (
                  <button
                    key={tier}
                    className={`chip${aiTiers.assigned[task] === tier ? " on" : ""}`}
                    title={aiTiers.tierMeta?.[tier] ? `${aiTiers.tierMeta[tier].cost} — ${aiTiers.tierMeta[tier].note}` : ""}
                    onClick={() => {
                      const next = { ...aiTiers.assigned, [task]: tier };
                      setAiTiers({ ...aiTiers, assigned: next });
                      put({ aiTiers: next });
                    }}
                  >
                    {tier}
                  </button>
                ))}
                <span className="muted" style={{ fontSize: 11, flex: 1 }}>{note}</span>
              </div>
            ))}
          </div>

          {!aiTiers.availability.some((t) => t.available) && (
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Nothing configured — every AI feature is running on heuristic fallbacks. The free tier costs nothing:
              install <span className="mono">ollama</span>, run <span className="mono">ollama pull llama3.2</span>, then put{" "}
              <span className="mono">OLLAMA_MODEL=llama3.2</span> in .env.
            </div>
          )}
        </div>
      )}

      {svcTiers && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <label className="field" style={{ marginTop: 0 }}>
            Voice, image & transcription tiers — same contract: free is $0, and anything unavailable degrades
            down instead of failing.
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {svcTiers.services.map((s) => (
              <div key={s.service} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ width: 150, fontSize: 13 }}>{s.label}</span>
                {(svcTiers.tierNames || []).map((tier) => (
                  <button
                    key={tier}
                    className={`chip${svcTiers.assigned[s.service] === tier ? " on" : ""}`}
                    /* voice/image have no `medium` step on purpose — say so
                       rather than offering a chip that silently falls back */
                    title={
                      (s.tiers || []).find((t) => t.tier === tier)?.available
                        ? ""
                        : (s.tiers || []).some((t) => t.tier === tier && t.options.length === 0)
                          ? `no ${tier} option for ${s.label} — falls back to the tier below`
                          : "not configured — will fall back to free"
                    }
                    onClick={() => {
                      const next = { ...svcTiers.assigned, [s.service]: tier };
                      setSvcTiers({ ...svcTiers, assigned: next });
                      put({ serviceTiers: next });
                    }}
                  >
                    {tier}{s.ready[tier] ? "" : " ○"}
                  </button>
                ))}
                <span className="muted" style={{ fontSize: 11, flex: 1 }}>{s.note}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      <div className="panel" style={{ marginTop: 20, marginBottom: 20 }}>
        <label className="field" style={{ marginTop: 0 }}>
          YouTube quota budgets — per-module daily allocation (used / budget)
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {budgets.map((b) => (
            <div key={b.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 130, fontSize: 12.5 }}>{b.name}</span>
              <div style={{ flex: 1, height: 14, background: "var(--bg)", borderRadius: 7, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, b.pct)}%`, height: "100%", background: b.pct >= 90 ? "var(--red)" : b.pct >= 60 ? "var(--accent)" : "var(--green)", borderRadius: 7 }} />
              </div>
              <span className="mono muted" style={{ width: 92, textAlign: "right", fontSize: 11.5 }}>{b.used} / {b.budget}</span>
            </div>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
          jobs skip with a warning when their module is exhausted — never a silent failure. Publishing draws from reserve at 1600/upload.
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <label className="field" style={{ marginTop: 0 }}>publishing & automation flags</label>
        {flags && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8, fontSize: 13 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className={`badge ${flags.publishMode === "auto" ? "hot" : "ok"}`}>{flags.publishMode}</span>
              <span className="muted">publish mode — {flags.publishMode === "auto" ? "uploads go public directly" : "private/unlisted drafts, you flip them live (default)"}</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className={`badge ${flags.youtubeVerified ? "ok" : "cool"}`}>{flags.youtubeVerified ? "yes" : "no"}</span>
              <span className="muted">YouTube API app verified (gates auto mode)</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className={`badge ${flags.metaReviewed ? "ok" : "cool"}`}>{flags.metaReviewed ? "yes" : "no"}</span>
              <span className="muted">Meta app reviewed (gates IG/FB Graph publishing)</span>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", marginTop: 2 }}>
              <input type="checkbox" checked={flags.autoTune} onChange={(e) => { setFlags({ ...flags, autoTune: e.target.checked }); put({ autoTune: e.target.checked }); }} />
              <span>calibration auto-tune {flags.autoTune ? "ON" : "OFF"} — nudge weights/timing from my results (≤10%/week)</span>
            </label>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <a className="btn ghost sm" href="/api/backup" download>Export backup (all state + config)</a>
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
      <section className="card" style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>Auto-edit</h2>
      <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>
      What the editor does to your footage. A command-line flag still overrides
      any of these for a single run.
      </p>
      {editOptions.map((o) => (
      <label key={o.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid var(--border)", cursor: "pointer" }}>
      <input
      type="checkbox"
      checked={edit[o.key] !== false}
      onChange={(e) => {
      const next = { ...edit, [o.key]: e.target.checked };
      setEdit(next);
      put({ edit: next });
      }}
      style={{ marginTop: 3 }}
      />
      <span>
      <strong style={{ fontSize: 13 }}>{o.label}</strong>
      <span className="muted" style={{ display: "block", fontSize: 12 }}>{o.help}</span>
      </span>
      </label>
      ))}
      </section>

      <section className="card" style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>Spoken language</h2>
      <p className="muted" style={{ fontSize: 12.5, margin: "0 0 10px" }}>
      What language your footage is in. Whisper can auto-detect, but the smaller
      models are English-biased — a Bengali clip was detected correctly and then
      transcribed into English nonsense. Set this and captions get much better.
      </p>
      <select
      value={language}
      onChange={(e) => {
      setLanguage(e.target.value);
      put({ language: e.target.value });
      }}
      style={{ padding: "8px 10px", borderRadius: 7, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", fontSize: 13, minWidth: 260 }}
      >
      {languages.map((l) => (
      <option key={l.code || "auto"} value={l.code}>{l.label}</option>
      ))}
      </select>
      {language && language !== "en" && (
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
      For {language}, raise <strong>Transcription</strong> below to <strong>best</strong>.
      The default base model is not usable for non-English audio.
      </p>
      )}
      </section>

    </div>
  );
}
