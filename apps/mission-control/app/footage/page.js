"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useJob, JobLog } from "../../components/useJob.js";

export default function FootagePage() {
  const router = useRouter();
  const { job, start, running } = useJob();
  const [file, setFile] = useState("");
  const [noPunch, setNoPunch] = useState(false);
  const [noDenoise, setNoDenoise] = useState(false);
  const [noFillers, setNoFillers] = useState(false);
  const [noise, setNoise] = useState("-35dB");

  useEffect(() => {
    if (job?.status === "done") {
      const m = (job.log || "").match(/RESULT (\{.*\})/);
      const id = m ? JSON.parse(m[1]).id : null;
      const t = setTimeout(() => router.push(id ? `/renders#${id}` : "/renders"), 1200);
      return () => clearTimeout(t);
    }
  }, [job, router]);

  const go = () => file.trim() && start("/api/autoedit", { file: file.trim(), noPunch, noDenoise, noFillers, noise });

  return (
    <div>
      <h1>Footage</h1>
      <p className="sub">
        AI Cut for filmed talking-head footage: pauses and filler words (“um”, “uh”) become jump cuts, self-corrections
        get backtracked (with an LLM key), audio is noise-cancelled + loudness-normalized, the picture gets a subtle
        grade/vignette/punch-ins, and karaoke captions burn in per aspect ratio. Your jargon spells right via{" "}
        <span className="mono">data/dictionary.json</span>. 100% local — footage never leaves this machine.
      </p>

      <div className="panel">
        <label className="field" style={{ marginTop: 0 }}>
          full path to your footage file
        </label>
        <input
          type="text"
          placeholder="D:\footage\gr-look-tutorial.mp4"
          value={file}
          onChange={(e) => setFile(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          className="mono"
        />
        <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13.5, cursor: "pointer" }}>
            <input type="checkbox" checked={noPunch} onChange={(e) => setNoPunch(e.target.checked)} />
            no punch-ins
          </label>
          <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13.5, cursor: "pointer" }}>
            <input type="checkbox" checked={noDenoise} onChange={(e) => setNoDenoise(e.target.checked)} />
            no noise cancellation
          </label>
          <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13.5, cursor: "pointer" }}>
            <input type="checkbox" checked={noFillers} onChange={(e) => setNoFillers(e.target.checked)} />
            keep “um” / “uh”
          </label>
          <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13.5 }}>
            silence threshold
            <select value={noise} onChange={(e) => setNoise(e.target.value)}>
              <option value="-30dB">-30dB (aggressive)</option>
              <option value="-35dB">-35dB (default)</option>
              <option value="-40dB">-40dB (gentle)</option>
              <option value="-45dB">-45dB (quiet room)</option>
            </select>
          </label>
          <button className="btn" disabled={running || !file.trim()} onClick={go}>
            {running ? <span className="spin" /> : null}Auto-edit
          </button>
        </div>
      </div>

      <JobLog job={job} />
    </div>
  );
}
