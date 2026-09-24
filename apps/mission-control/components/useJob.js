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

/** Follow one or more queued commands until their result is visible in cloud state. */
export function useQueueMonitor() {
  const [ids, setIds] = useState([]);
  const [jobs, setJobs] = useState([]);
  const onFinished = useRef(null);

  const follow = (jobIds, callback) => {
    const next = [...new Set((Array.isArray(jobIds) ? jobIds : [jobIds]).filter(Boolean))];
    onFinished.current = callback || null;
    setJobs(next.map((id) => ({ id, status: "queued", log: "Checking job status…" })));
    setIds(next);
  };

  useEffect(() => {
    if (!ids.length) return undefined;
    let cancelled = false;
    let timer;
    const poll = async () => {
      const found = await Promise.all(ids.map(async (id) => {
        const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { cache: "no-store" })
          .then((res) => res.json()).catch(() => null);
        return response?.job || { id, status: "queued", log: "Waiting for job status…" };
      }));
      if (cancelled) return;
      setJobs(found);
      if (found.every((job) => job.status === "done" || job.status === "failed")) {
        onFinished.current?.(found);
      } else {
        timer = setTimeout(poll, 3000);
      }
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ids]);

  return { jobs, follow, running: jobs.some((job) => job.status === "queued" || job.status === "running") };
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
