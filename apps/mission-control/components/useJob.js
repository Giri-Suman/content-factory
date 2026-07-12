"use client";
import { useEffect, useRef, useState } from "react";

/** Polls a job started via a POST endpoint; exposes {job, start, running}. */
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
      const jr = await fetch(`/api/jobs/${data.jobId}`).then((r) => r.json());
      setJob(jr.job);
      if (jr.job?.status !== "running") clearInterval(timer.current);
    };
    poll();
    timer.current = setInterval(poll, 2500);
    return data.jobId;
  };

  return { job, start, running: job?.status === "running" };
}

export function JobLog({ job }) {
  if (!job) return null;
  const badge = job.status === "done" ? "ok" : job.status === "failed" ? "hot" : "warm";
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
