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
 * So a queued job keeps polling briefly - long enough to catch the common case
 * where the laptop is awake and picks it up within a minute - then stops and
 * leaves the queue message on screen. `running` stays false while queued, so
 * the button re-enables instead of being stuck for the rest of the day.
 */

const POLL_MS = 2500;
/** ~1 minute of watching before we accept that this one is for later. */
const QUEUED_POLL_LIMIT = 24;

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

    let queuedPolls = 0;
    const poll = async () => {
      const jr = await fetch(`/api/jobs/${data.jobId}`)
        .then((r) => r.json())
        .catch(() => null);
      if (!jr?.job) return;
      setJob(jr.job);

      if (jr.job.status === "running") return; // keep watching
      if (jr.job.status === "queued" && ++queuedPolls < QUEUED_POLL_LIMIT) return;
      clearInterval(timer.current);
    };
    poll();
    timer.current = setInterval(poll, POLL_MS);
    return data.jobId;
  };

  return { job, start, running: job?.status === "running" };
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
