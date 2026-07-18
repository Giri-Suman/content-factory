"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const PLATFORM_TABS = ["YT Short", "IG Reel", "Carousel", "LinkedIn", "X", "Blog"];
const STATUS_ORDER = { draft: 0, approved: 1, killed: 2 };

const countdown = (iso) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "OVERDUE";
  const h = Math.floor(ms / 36e5);
  const m = Math.floor((ms % 36e5) / 6e4);
  return `${h}h ${m}m left`;
};

export default function BriefsPage() {
  const [briefs, setBriefs] = useState(null);
  const [tab, setTab] = useState({});
  const [edits, setEdits] = useState({});
  const [note, setNote] = useState(null);

  const load = () => fetch("/api/briefs").then((r) => r.json()).then((d) => setBriefs(d.briefs));
  useEffect(() => {
    load();
  }, []);

  const patch = async (id, body) => {
    const res = await fetch("/api/briefs", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    }).then((r) => r.json());
    if (!res.ok) setNote(res.error);
    load();
  };

  const saveHook = (b, idx) => {
    const value = edits[`${b.id}-hook${idx}`];
    if (value === undefined) return;
    const payload = structuredClone(b.payload);
    payload.yt_short.hook_variants[idx] = value;
    patch(b.id, { payload });
    setEdits((e) => {
      const n = { ...e };
      delete n[`${b.id}-hook${idx}`];
      return n;
    });
  };

  const saveCaption = (b) => {
    const value = edits[`${b.id}-caption`];
    if (value === undefined) return;
    const payload = structuredClone(b.payload);
    payload.ig_reel.caption = value;
    patch(b.id, { payload });
    setEdits((e) => {
      const n = { ...e };
      delete n[`${b.id}-caption`];
      return n;
    });
  };

  const tick = (b, i) => {
    const st = [...(b.checklistState || b.payload.manual_publish_checklist.map(() => false))];
    st[i] = !st[i];
    patch(b.id, { checklistState: st });
  };

  const sorted = briefs
    ? [...briefs].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || (b.createdAt || "").localeCompare(a.createdAt || ""))
    : null;

  return (
    <div>
      <h1>Brief Studio</h1>
      <p className="sub">
        Multi-platform briefs generated from your top clusters and wishlist autopsies — edit hooks inline, approve to
        get the tickable manual-publish checklist, kill what doesn't deserve your time. Trend briefs carry a real
        24-hour deadline.
      </p>
      {note && <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{note}</div>}

      {!sorted ? (
        <div className="empty">loading…</div>
      ) : sorted.length === 0 ? (
        <div className="empty">no briefs yet — hit “Generate Briefs” on a Trends cluster or “Brief it” on a wishlist entry</div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {sorted.map((b) => {
            const t = tab[b.id] || "YT Short";
            const p = b.payload || {};
            return (
              <div key={b.id} className="panel" style={{ marginBottom: 14, opacity: b.status === "killed" ? 0.45 : 1 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span className={`badge ${b.status === "approved" ? "ok" : b.status === "killed" ? "cool" : "warm"}`}>{b.status}</span>
                  <span className="chip static" style={{ fontSize: 11 }}>{b.kind}</span>
                  {b.kind === "trend" && b.deadline && b.status !== "killed" && (
                    <span className={`badge ${countdown(b.deadline) === "OVERDUE" ? "hot" : "warm"}`} style={{ fontSize: 11 }}>
                      {countdown(b.deadline)}
                    </span>
                  )}
                  {b.scheduledDate && <span className="chip static" style={{ fontSize: 11 }}>slot {b.scheduledDate}</span>}
                  {p.template && <span className="chip static" style={{ fontSize: 11 }}>template — add LLM key</span>}
                  <strong style={{ flex: 1 }}>{b.topic}</strong>
                  {b.status === "draft" && (
                    <>
                      <button className="btn sm" onClick={() => patch(b.id, { status: "approved" })}>Approve</button>
                      <button className="btn ghost sm" onClick={() => patch(b.id, { status: "killed" })}>Kill</button>
                    </>
                  )}
                </div>
                {p.core_idea && <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{p.core_idea}</div>}

                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {PLATFORM_TABS.map((pt) => (
                    <button key={pt} className={`chip${t === pt ? " on" : ""}`} onClick={() => setTab({ ...tab, [b.id]: pt })}>
                      {pt}
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: 10, fontSize: 13 }}>
                  {t === "YT Short" && p.yt_short && (
                    <div>
                      <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>hooks — click into a field to edit, blur to save</div>
                      {p.yt_short.hook_variants.map((h, i) => (
                        <input
                          key={i}
                          value={edits[`${b.id}-hook${i}`] ?? h}
                          onChange={(e) => setEdits({ ...edits, [`${b.id}-hook${i}`]: e.target.value })}
                          onBlur={() => saveHook(b, i)}
                          style={{ width: "100%", marginBottom: 6 }}
                        />
                      ))}
                      <div><strong>{p.yt_short.title}</strong> · {p.yt_short.length_sec}s</div>
                      <div className="muted" style={{ whiteSpace: "pre-wrap" }}>{p.yt_short.description}</div>
                      <div style={{ marginTop: 4 }}>{(p.yt_short.beats || []).map((be, i) => <div key={i}>▸ {be}</div>)}</div>
                      <div className="mono muted" style={{ fontSize: 11.5, marginTop: 4 }}>{(p.yt_short.tags || []).join(", ")}</div>
                    </div>
                  )}
                  {t === "IG Reel" && p.ig_reel && (
                    <div>
                      <div className="muted" style={{ fontSize: 12 }}>{p.ig_reel.script_adjustments}</div>
                      <textarea
                        value={edits[`${b.id}-caption`] ?? p.ig_reel.caption}
                        onChange={(e) => setEdits({ ...edits, [`${b.id}-caption`]: e.target.value })}
                        onBlur={() => saveCaption(b)}
                        rows={3}
                        style={{ width: "100%", marginTop: 6 }}
                      />
                      <div className="mono muted" style={{ fontSize: 11.5 }}>{(p.ig_reel.hashtags || []).join(" ")}</div>
                    </div>
                  )}
                  {t === "Carousel" && p.ig_carousel && (
                    <div>
                      <strong>{p.ig_carousel.cover_text}</strong>
                      {(p.ig_carousel.slides || []).map((s, i) => <div key={i}>{i + 1}. {s}</div>)}
                    </div>
                  )}
                  {t === "LinkedIn" && p.linkedin && <div style={{ whiteSpace: "pre-wrap" }}>{p.linkedin.post_text}</div>}
                  {t === "X" && <div>{(p.x_thread || []).map((x, i) => <div key={i} style={{ marginBottom: 6 }}>{i + 1}/ {x}</div>)}</div>}
                  {t === "Blog" && p.blog_outline && (
                    <div>
                      <strong>{p.blog_outline.title}</strong>
                      <div className="muted">{p.blog_outline.quick_answer}</div>
                      {(p.blog_outline.h2_sections || []).map((h, i) => <div key={i}>## {h}</div>)}
                      <div style={{ marginTop: 4 }}><em>data angle: {p.blog_outline.original_data_angle}</em></div>
                    </div>
                  )}
                </div>

                {(p.platform_adjustments || []).length > 0 && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                    {p.platform_adjustments.map((a, i) => <div key={i}>· {a}</div>)}
                  </div>
                )}
                <div className="mono muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                  timing: yt {p.timing_ist?.yt} · ig {p.timing_ist?.ig} · li {p.timing_ist?.linkedin} · x {p.timing_ist?.x}
                </div>

                {b.status === "approved" && (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>manual publish checklist</div>
                    {(p.manual_publish_checklist || []).map((step, i) => (
                      <label key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, padding: "3px 0", cursor: "pointer" }}>
                        <input type="checkbox" checked={Boolean(b.checklistState?.[i])} onChange={() => tick(b, i)} style={{ marginTop: 3 }} />
                        <span style={{ textDecoration: b.checklistState?.[i] ? "line-through" : "none", opacity: b.checklistState?.[i] ? 0.55 : 1 }}>
                          {step}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
