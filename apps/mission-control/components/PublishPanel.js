"use client";
import { useEffect, useState } from "react";
import { useJob, JobLog } from "./useJob.js";

const LEVEL_BADGE = { ok: "ok", warn: "warm", fail: "hot" };
const LEVEL_ICON = { ok: "✓", warn: "!", fail: "✕" };

/** Compliance checklist + safe-by-default publish for one rendered id. */
export function PublishPanel({ id, which = "short" }) {
  const [report, setReport] = useState(null);
  const [canReal, setCanReal] = useState(false);
  const [privacy, setPrivacy] = useState("private");
  const [at, setAt] = useState("");
  const [confirmPublic, setConfirmPublic] = useState(false);
  const { job, start, running } = useJob();

  const load = () =>
    fetch(`/api/publish?id=${id}`)
      .then((r) => r.json())
      .then((d) => {
        setReport(d.report);
        setCanReal(d.canRealUpload);
      });
  useEffect(() => {
    load();
  }, [id]);

  const run = (go) => {
    if (go && privacy === "public" && !confirmPublic) return;
    start("/api/publish", { id, which, privacy, at: at || null, go });
  };

  if (!report) return <div className="muted">checking compliance…</div>;

  const blocked = !report.pass;

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {report.checks.map((c) => (
          <div key={c.id} style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 13 }}>
            <span className={`badge ${LEVEL_BADGE[c.level]}`} style={{ minWidth: 22 }}>
              {LEVEL_ICON[c.level]}
            </span>
            <span className={c.level === "fail" ? "" : "muted"}>{c.msg}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} style={{ width: 130 }}>
          <option value="private">private</option>
          <option value="unlisted">unlisted</option>
          <option value="public">public</option>
        </select>
        <input
          type="text"
          placeholder="schedule (optional ISO)"
          value={at}
          onChange={(e) => setAt(e.target.value)}
          style={{ width: 200 }}
        />
        <button className="btn ghost" disabled={running} onClick={() => run(false)}>
          Dry run
        </button>
        <button
          className="btn"
          disabled={running || blocked || !canReal || (privacy === "public" && !confirmPublic)}
          onClick={() => run(true)}
          title={!canReal ? "add YouTube credentials in .env first" : blocked ? "fix compliance fails first" : ""}
        >
          {running ? <span className="spin" /> : null}
          Publish {privacy}
        </button>
      </div>

      {privacy === "public" && (
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 13, color: "var(--red)" }}>
          <input type="checkbox" checked={confirmPublic} onChange={(e) => setConfirmPublic(e.target.checked)} />
          I understand this goes live publicly on my channel.
        </label>
      )}

      {!canReal && (
        <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          Real upload is disabled until YouTube OAuth is set up. Run <span className="mono">factory auth-youtube</span>,
          add <span className="mono">YT_REFRESH_TOKEN</span> to .env. Dry run works now and shows exactly what would be
          sent.
        </div>
      )}

      <JobLog job={job} />
    </div>
  );
}
