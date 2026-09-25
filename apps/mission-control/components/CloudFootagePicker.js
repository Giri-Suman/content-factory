"use client";

import { useState } from "react";

/** Pick existing R2 footage or upload a new video directly from this browser. */
export function CloudFootagePicker({ value, onChange, uploads, refreshUploads, label = "footage file" }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const init = await fetch("/api/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, type: file.type, label: file.name.replace(/\.[^.]+$/, "") }),
      }).then((response) => response.json());
      if (!init.ok) throw new Error(init.error || "could not start upload");

      const send = (url, bytes, headers, offset) => new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        for (const [name, val] of Object.entries(headers || {})) xhr.setRequestHeader(name, val);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round(((offset + event.loaded) / file.size) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else {
            let message;
            try { message = JSON.parse(xhr.responseText).error; } catch { /* R2 may return plain text. */ }
            reject(new Error(message || `upload failed (${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new Error(init.upload.mode === "worker-multipart"
          ? "could not reach the portal during upload"
          : "could not reach R2 — check the bucket CORS policy"));
        xhr.send(bytes);
      });

      if (init.upload.mode === "worker-multipart") {
        const partSize = init.upload.partSize;
        for (let offset = 0, part = 1; offset < file.size; offset += partSize, part++) {
          const url = `/api/upload?name=${encodeURIComponent(init.upload.name)}&part=${part}`;
          await send(url, file.slice(offset, offset + partSize), { "content-type": "application/octet-stream" }, offset);
        }
      } else {
        await send(init.upload.url, file, init.upload.headers, 0);
      }

      const done = await fetch("/api/upload", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: init.upload.name }),
      }).then((response) => response.json());
      if (!done.ok) throw new Error(done.error || "upload could not be verified");
      await refreshUploads();
      onChange(done.path || done.name);
    } catch (uploadError) {
      setError(uploadError.message || "upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={value || ""} onChange={(event) => onChange(event.target.value)} style={{ minWidth: 260, fontSize: 12 }}>
          <option value="">{uploads.length ? "pick uploaded footage…" : "no footage uploaded yet"}</option>
          {uploads.map((item) => (
            <option key={item.name} value={item.path}>
              {item.name} · {(item.bytes / 1e6).toFixed(0)}MB
            </option>
          ))}
        </select>
        <label className="btn ghost sm" style={{ cursor: busy ? "default" : "pointer" }}>
          {busy ? <span className="spin" /> : null}
          {busy ? `uploading ${progress}%` : "Upload from this device"}
          <input
            type="file"
            accept=".mp4,.mov,.mkv,.avi,.m4v,.webm,video/*"
            style={{ display: "none" }}
            disabled={busy}
            onChange={(event) => upload(event.target.files?.[0])}
          />
        </label>
      </div>
      <input
        className="mono"
        placeholder={`…or type a path when using the portal locally — ${label}`}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: "100%", maxWidth: 500, fontSize: 11.5, marginTop: 6 }}
      />
      {error && <div style={{ color: "#ff6b6b", fontSize: 11.5, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
