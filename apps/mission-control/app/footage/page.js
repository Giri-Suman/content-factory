"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useJob, JobLog } from "../../components/useJob.js";
import { CloudFootagePicker } from "../../components/CloudFootagePicker.js";

export default function FootagePage() {
  const router = useRouter();
  const { job, start, running } = useJob();
  const [file, setFile] = useState("");
  const [uploads, setUploads] = useState([]);
  const [style, setStyle] = useState("edit-beauty");

  const refreshUploads = async () => {
    const data = await fetch("/api/upload").then((response) => response.json()).catch(() => null);
    if (data?.ok) setUploads(data.files || []);
  };

  useEffect(() => {
    refreshUploads();
  }, []);

  useEffect(() => {
    if (job?.status === "done") {
      const id = (job.log || "").match(/"id":"([A-Za-z0-9._-]+)"/)?.[1] || null;
      const t = setTimeout(() => router.push(id ? `/renders#${id}` : "/renders"), 1200);
      return () => clearTimeout(t);
    }
  }, [job, router]);

  const go = () => file.trim() && start("/api/run", { key: style, input: file.trim() });

  return (
    <div>
      <h1>Footage</h1>
      <p className="sub">
        AI Cut for filmed talking-head footage: pauses and filler words (“um”, “uh”) become jump cuts, self-corrections
        get backtracked (with an LLM key), audio is noise-cancelled + loudness-normalized, the picture gets a subtle
        grade/vignette/punch-ins, and karaoke captions burn in per aspect ratio. Upload from this device or choose footage
        already in the private family bucket; the cloud runner can edit it while the laptop is off.
      </p>

      <div className="panel">
        <label className="field" style={{ marginTop: 0 }}>footage</label>
        <CloudFootagePicker
          value={file}
          onChange={setFile}
          uploads={uploads}
          refreshUploads={refreshUploads}
          label="full path to footage"
        />
        <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13.5 }}>
            edit style
            <select value={style} onChange={(event) => setStyle(event.target.value)}>
              <option value="edit-beauty">captions + measured colour</option>
              <option value="edit-beauty-nocap">faster, without captions</option>
              <option value="edit-beauty-dissolve">soft dissolves</option>
              <option value="edit-hardcut">hard cuts</option>
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
