"use client";
import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }).then((r) => r.json());
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = next;
      return;
    }
    setError(res.error || "wrong password");
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", minHeight: "80vh", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={submit} className="panel" style={{ width: 340, padding: 26 }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: ".28em", color: "var(--accent)", marginBottom: 18 }}>
          CONTENT FACTORY
        </div>
        <label className="field" style={{ marginTop: 0 }}>Password</label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", marginTop: 6 }}
          placeholder="FACTORY_PASSWORD"
        />
        {error && <div style={{ color: "var(--red, #ff6b6b)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}
        <button className="btn" type="submit" disabled={busy || !password} style={{ width: "100%", marginTop: 16, justifyContent: "center" }}>
          {busy ? <span className="spin" /> : null}
          Sign in
        </button>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 14, lineHeight: 1.5 }}>
          This portal runs commands on the host machine. It is password-gated whenever
          <span className="mono"> FACTORY_PASSWORD</span> is set.
        </div>
      </form>
    </div>
  );
}
