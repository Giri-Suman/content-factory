"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

const oppClass = (n) => (n >= 12 ? "hot" : n >= 6 ? "warm" : "cool");

export default function KeywordsPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const load = () => fetch("/api/keywords").then((r) => r.json()).then(setData);
  useEffect(() => {
    load();
  }, []);

  const run = async () => {
    setBusy(true);
    setNote("mining autocomplete + scoring supply (budgeted ≤2200 units/day)…");
    const res = await fetch("/api/keywords", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((r) => r.json());
    setBusy(false);
    setNote(res.ok ? null : res.error);
    load();
  };

  const briefIt = async (keyword) => {
    setBusy(true);
    setNote(`briefing “${keyword}”…`);
    const res = await fetch("/api/keywords", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keyword }),
    }).then((r) => r.json());
    setBusy(false);
    if (res.ok) router.push("/briefs");
    else setNote(res.error);
  };

  return (
    <div>
      <h1>Keyword Gap Finder</h1>
      <p className="sub">
        Search phrases where demand looks real but YouTube supply is thin. <strong>Demand is a proxy</strong> —
        autocomplete presence + mentions across the trends we collect; there's no search-volume API and we don't
        pretend there is. Supply is live 48-hour saturation. No revenue or RPM numbers anywhere — those have no honest
        source.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <button className="btn" disabled={busy} onClick={run}>
          {busy ? <span className="spin" /> : null}Run gap pass
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          seeds come from your niche keywords (Settings) · used today:{" "}
          <span className="mono">{data?.unitsToday ?? "…"}</span>/{data?.budget ?? 2200} units
        </span>
      </div>
      {note && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{note}</div>}

      {!data ? (
        <div className="empty">loading…</div>
      ) : data.keywords.length === 0 ? (
        <div className="empty">
          no keywords scored yet — hit “Run gap pass”. Autocomplete + demand signals work now; supply scoring needs
          YOUTUBE_API_KEY (until then supply shows a neutral 5/10).
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {data.keywords.map((k) => (
            <div key={k.id} className="panel" style={{ marginBottom: 10, padding: "12px 16px" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span className={`badge ${oppClass(k.opportunity)}`} style={{ minWidth: 44, textAlign: "center" }} title="opportunity = demand-heavy, supply-light">
                  {k.opportunity}
                </span>
                <strong style={{ flex: 1 }}>{k.keyword}</strong>
                <span className="chip static" style={{ fontSize: 10.5 }}>demand {k.demand.score}</span>
                <span className="chip static" style={{ fontSize: 10.5 }}>supply {k.supply.score}{k.supply.unknown ? "?" : ""}</span>
                <button className="btn ghost sm" disabled={busy} onClick={() => briefIt(k.keyword)}>Brief it</button>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                <div>demand: {k.demand.detail}</div>
                <div>supply: {k.supply.detail}</div>
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
