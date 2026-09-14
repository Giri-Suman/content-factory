"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Polls a job started via a POST endpoint; exposes {job, start, running}.
 *
 * On the laptop a job started the moment you pressed the button, so "not
 * running" meant "finished". In the cloud portal a job that needs ffmpeg is
 * QUEUED and may not start for hours, which this has to represent without
 * either spinning forever or claiming the work is done.
 *
 * A queued job keeps polling until either GitHub Actions or the laptop runner
 * records a terminal outcome. The button remains disabled for that same job,
 * which prevents a second click from dispatching duplicate paid work.
 */

const POLL_MS = 2500;

export function useJob() {
  const [job, setJob] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  const start = async (url, body) => {
    setJob({ status: "running", log: "starting…" });
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) {
      setJob({ status: "failed", log: data.error || "failed to start" });
      return null;
    }

    const poll = async () => {
      const jr = await fetch(`/api/jobs/${data.jobId}`)
        .then((r) => r.json())
        .catch(() => null);
      if (!jr?.job) return;
      setJob(jr.job);

      if (jr.job.status === "running" || jr.job.status === "queued") return;
      clearInterval(timer.current);
    };
    poll();
    timer.current = setInterval(poll, POLL_MS);
    return data.jobId;
  };

  return { job, start, running: job?.status === "running" || job?.status === "queued" };
}

export function JobLog({ job }) {
  if (!job) return null;
  const badge =
    job.status === "done" ? "ok" : job.status === "failed" ? "hot" : job.status === "queued" ? "cool" : "warm";
  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
        <span className={`badge ${badge}`}>{job.status}</span>
        {job.id && (
          <span className="mono muted" style={{ fontSize: 11.5 }}>
            {job.id}
          </span>
        )}
      </div>
      <div className="log">{(job.log || "").split("\n").slice(-16).join("\n")}</div>
    </div>
  );
}
