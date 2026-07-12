"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useJob, JobLog } from "../../components/useJob.js";

const DEMOS = [
  ["gauss-sum", "Add 1 to 100 instantly", "the pairing trick"],
  ["point-nine-repeating", "0.999… = 1, exactly", "the algebra proof"],
];

export default function MathPage() {
  const router = useRouter();
  const { job, start, running } = useJob();
  const [topic, setTopic] = useState("");
  const [env, setEnv] = useState(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setEnv(d.env));
  }, []);

  useEffect(() => {
    if (job?.status === "done") {
      const m = (job.log || "").match(/RESULT (\{.*\})/);
      const id = m ? JSON.parse(m[1]).id : null;
      const t = setTimeout(() => router.push(id ? `/renders#${id}` : "/renders"), 1200);
      return () => clearTimeout(t);
    }
  }, [job, router]);

  return (
    <div>
      <h1>Math Studio</h1>
      <p className="sub">
        Manim-rendered math shorts — original animation, zero flag risk, evergreen. Runs ~8 min per short (Manim render +
        caption compositing).
      </p>

      <div className="panel" style={{ marginBottom: 18 }}>
        <label className="field" style={{ marginTop: 0 }}>
          write a new short from a topic {env && !env.provider && <span className="muted">— needs an LLM key in .env</span>}
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            placeholder='e.g. "why a Möbius strip has one side" or "the birthday paradox"'
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && topic.trim() && start("/api/math", { topic: topic.trim() })}
            disabled={env && !env.provider}
          />
          <button
            className="btn"
            disabled={running || !topic.trim() || (env && !env.provider)}
            onClick={() => start("/api/math", { topic: topic.trim() })}
          >
            {running ? <span className="spin" /> : null}Generate
          </button>
        </div>
      </div>

      <div className="panel">
        <label className="field" style={{ marginTop: 0 }}>
          bundled demos — no key needed, great for a first render
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          {DEMOS.map(([id, title, note]) => (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="btn ghost sm" disabled={running} onClick={() => start("/api/math", { demo: id })}>
                Render
              </button>
              <strong>{title}</strong>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {note}
              </span>
            </div>
          ))}
        </div>
      </div>

      <JobLog job={job} />
    </div>
  );
}
