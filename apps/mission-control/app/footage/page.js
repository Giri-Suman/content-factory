"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useJob, JobLog } from "../../components/useJob.js";

export default function FootagePage() {
  const router = useRouter();
  const { job, start, running } = useJob();
  const [file, setFile] = useState("");
  const [noPunch, setNoPunch] = useState(false);
  const [noise, setNoise] = useState("-35dB");

  useEffect(() => {
    if (job?.status === "done") {
      const m = (job.log || "").match(/RESULT (\{.*\})/);
      const id = m ? JSON.parse(m[1]).id : null;
      const t = setTimeout(() => router.push(id ? `/renders#${id}` : "/renders"), 1200);
      return () => clearTimeout(t);
    }
  }, [job, router]);

  const go = () => file.trim() && start("/api/autoedit", { file: file.trim(), noPunch, noise });

  return (
    <div>
      <h1>Footage</h1>
      <p className="sub">
        Auto-edit filmed talking-head footage (the makeup channel): every pause becomes a jump cut, alternating
        punch-ins keep it kinetic, audio is loudness-normalized, and both aspect ratios land in Renders. 100% local —
        your footage never leaves this machine. Captions burn in automatically once whisper is installed
        (<span className="mono">factory doctor</span> has the options).
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
            no punch-ins (keep framing static)
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
