"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * Studio — every command, organised by what you're making.
 *
 * The portal grew page-by-page, so related actions ended up scattered and 17
 * commands had no surface at all. This is the one place that answers "I want
 * to make a math short / a tool review / a nail-art video — what do I press?"
 *
 * The command list comes from the server registry, never hardcoded here, so a
 * new command appears without touching this file.
 */

const CATS = [
  { id: "coding", label: "Coding", note: "rendered code videos + screencasts", lane: "hybrid", accent: "#58a6ff" },
  { id: "ai-automation", label: "AI automation", note: "agents, workflows, tool reviews", lane: "hybrid", accent: "#bc8cff" },
  { id: "math", label: "Math", note: "fully automated — just give it a topic", lane: "synthetic", accent: "#4cc38a" },
  { id: "beauty", label: "Makeup & Nails", note: "you film it, the factory does the rest", lane: "capture", accent: "#ff6b6b" },
];

const STAGE_ORDER = ["find", "plan", "make", "package", "ship", "learn", "ops"];
const STAGE_LABEL = {
  find: "1 · Find something to make",
  plan: "2 · Plan it",
  make: "3 · Make it",
  package: "4 · Package it",
  ship: "5 · Ship it",
  learn: "6 · Learn from it",
  ops: "Health & setup",
};

const TERMINAL_ONLY = [
  ["factory worker", "a long-running daemon — it never exits, so a button would hang the job runner"],
  ["factory auth-youtube", "opens Google's OAuth consent and waits for a paste-back — has to be interactive"],
  ["factory publish <id> --go", "the one real upload. Kept in the terminal so it can never be a mis-click"],
];

/** One runnable command. Used in both the vertical block and the shared list. */
function Row({ c, accent, busy, out, inputs, setInputs, run, briefs, renders }) {
  const needsPick = c.argKind === "briefId" || c.argKind === "renderId";
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="panel" style={{ padding: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <button
          className={`btn ${c.primary ? "" : "ghost"} sm`}
          style={{ minWidth: 172, justifyContent: "center", borderColor: c.primary && accent ? accent : undefined }}
          disabled={Boolean(busy)}
          onClick={() => run(c)}
        >
          {busy === c.key ? <span className="spin" /> : null}
          {c.label}
        </button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>{c.desc}</div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--muted)", opacity: 0.6, marginTop: 3 }}>
            factory {c.id}
            {c.argKind ? " …" : ""}
            {c.slow ? "   · runs in the background" : ""}
            {c.danger === "spend" ? "   · ⚠ spends money" : ""}
          </div>
        </div>
      </div>

      {c.argKind && c.argKind !== "none" && (
        <div style={{ marginTop: 9 }}>
          {needsPick ? (
            <select
              value={inputs[c.key] || ""}
              onChange={(e) => setInputs((i) => ({ ...i, [c.key]: e.target.value }))}
              style={{ minWidth: 280, fontSize: 12 }}
            >
              <option value="">{c.argKind === "briefId" ? "pick a brief…" : "pick a render…"}</option>
              {(c.argKind === "briefId" ? briefs : renders).map((x) => {
                const id = typeof x === "string" ? x : x.id;
                const label = typeof x === "string" ? x : (x.topic || x.id || "").slice(0, 54);
                return (
                  <option key={id} value={id}>
                    {label}
                  </option>
                );
              })}
            </select>
          ) : (
            <input
              className="mono"
              placeholder={c.argLabel || c.argKind}
              value={inputs[c.key] || ""}
              onChange={(e) => setInputs((i) => ({ ...i, [c.key]: e.target.value }))}
              style={{ width: "100%", maxWidth: 500, fontSize: 12 }}
            />
          )}
        </div>
      )}

      {out[c.key] && (
        <pre
          className="mono"
          style={{
            fontSize: 11.5,
            whiteSpace: "pre-wrap",
            background: "var(--bg)",
            padding: 10,
            borderRadius: 6,
            marginTop: 9,
            maxHeight: 340,
            overflow: "auto",
          }}
        >
          {out[c.key]}
        </pre>
      )}
    </motion.div>
  );
}

export default function StudioPage() {
  const [cat, setCat] = useState("coding");
  const [commands, setCommands] = useState([]);
  const [out, setOut] = useState({});
  const [busy, setBusy] = useState(null);
  const [inputs, setInputs] = useState({});
  const [briefs, setBriefs] = useState([]);
  const [renders, setRenders] = useState([]);
  const poll = useRef(null);

  useEffect(() => {
    fetch("/api/run").then((r) => r.json()).then((d) => setCommands(d.commands || []));
    fetch("/api/briefs").then((r) => r.json()).then((d) => setBriefs(d.briefs || d.rows || [])).catch(() => {});
    fetch("/api/renders").then((r) => r.json()).then((d) => setRenders(d.renders || [])).catch(() => {});
    return () => clearInterval(poll.current);
  }, []);

  const run = async (c) => {
    setBusy(c.key);
    setOut((o) => ({ ...o, [c.key]: "running…" }));
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: c.key, input: inputs[c.key] || "" }),
    }).then((r) => r.json());

    if (!res.ok) {
      setOut((o) => ({ ...o, [c.key]: res.error || "failed" }));
      setBusy(null);
      return;
    }
    if (res.mode === "inline") {
      setOut((o) => ({ ...o, [c.key]: res.text || "(no output)" }));
      setBusy(null);
      return;
    }
    clearInterval(poll.current);
    poll.current = setInterval(async () => {
      const j = await fetch(`/api/jobs/${res.jobId}`).then((r) => r.json()).catch(() => null);
      if (!j?.job) return;
      setOut((o) => ({ ...o, [c.key]: j.job.log || "running…" }));
      if (j.job.status !== "running") {
        clearInterval(poll.current);
        setBusy(null);
      }
    }, 1500);
  };

  const active = CATS.find((x) => x.id === cat);
  const ownRows = commands.filter((c) => c.cat === cat);
  const sharedRows = commands.filter((c) => c.cat === "all");
  const rowProps = { busy, out, inputs, setInputs, run, briefs, renders };

  return (
    <div>
      <h1>Studio</h1>
      <p className="sub">
        Every command, grouped by what you&apos;re making. Anything here also works in the terminal —
        the button and <span className="mono">factory &lt;cmd&gt;</span> run exactly the same thing.
      </p>

      {/* ---- pick a vertical ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 8 }}>
        {CATS.map((c) => {
          const n = commands.filter((x) => x.cat === c.id).length;
          return (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className="panel"
              style={{
                textAlign: "left",
                cursor: "pointer",
                padding: "13px 15px",
                borderColor: cat === c.id ? c.accent : "var(--border)",
                background: cat === c.id ? "rgba(255,178,36,.06)" : "var(--panel)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, color: cat === c.id ? c.accent : "var(--text)" }}>{c.label}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 3, lineHeight: 1.4 }}>{c.note}</div>
              <div style={{ marginTop: 7, display: "flex", gap: 6, alignItems: "center" }}>
                <span className="badge" style={{ fontSize: 9.5 }}>{c.lane} lane</span>
                {n > 0 && (
                  <span className="badge" style={{ fontSize: 9.5, background: c.accent, color: "#0d1117", fontWeight: 700 }}>
                    {n} own
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="muted" style={{ fontSize: 12, margin: "14px 0 20px" }}>
        {active.lane === "capture"
          ? "Capture lane: Produce gives you a shot list and teleprompter instead of rendering — a real product on real skin can't be faked."
          : active.lane === "synthetic"
            ? "Synthetic lane: start to finish with no camera. Give it a topic and walk away."
            : "Hybrid lane: rendered by default, or record your screen and let AI Cut do the editing."}
      </div>

      {/* ---- what only this vertical does ---- */}
      {ownRows.length > 0 && (
        <section style={{ marginBottom: 30 }}>
          <label className="field" style={{ marginTop: 0, color: active.accent }}>
            Only for {active.label} — {ownRows.length} command{ownRows.length === 1 ? "" : "s"}
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {ownRows.map((c) => (
              <Row key={c.key} c={c} accent={active.accent} {...rowProps} />
            ))}
          </div>
        </section>
      )}

      <div
        className="muted"
        style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", margin: "6px 0 14px", borderTop: "1px solid var(--border)", paddingTop: 14 }}
      >
        the rest of the workflow — same for every vertical
      </div>

      {/* ---- shared workflow ---- */}
      {STAGE_ORDER.map((stage) => {
        const rows = sharedRows.filter((c) => c.stage === stage);
        if (!rows.length) return null;
        return (
          <section key={stage} style={{ marginBottom: 26 }}>
            <label className="field" style={{ marginTop: 0 }}>{STAGE_LABEL[stage]}</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {rows.map((c) => (
                <Row key={c.key} c={c} accent={null} {...rowProps} />
              ))}
            </div>
          </section>
        );
      })}

      {/* ---- honest about what stays in the terminal ---- */}
      <section style={{ marginTop: 30 }}>
        <label className="field" style={{ marginTop: 0 }}>Deliberately terminal-only</label>
        <div className="panel" style={{ marginTop: 8 }}>
          {TERMINAL_ONLY.map(([cmd, why]) => (
            <div key={cmd} style={{ padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
              <span className="mono" style={{ color: "var(--accent)" }}>{cmd}</span>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{why}</div>
            </div>
          ))}
          <div className="muted" style={{ fontSize: 11.5, paddingTop: 9 }}>
            Everything else on this page is a button. These three have a reason, not an oversight.
          </div>
        </div>
      </section>
    </div>
  );
}
