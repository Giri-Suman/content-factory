"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function ScriptsPage() {
  const [scripts, setScripts] = useState(null);

  useEffect(() => {
    fetch("/api/scripts")
      .then((r) => r.json())
      .then((d) => setScripts(d.scripts));
  }, []);

  return (
    <div>
      <h1>Scripts</h1>
      <p className="sub">Every draft the studio has produced. Open one to edit scenes and send it to the render farm.</p>

      {!scripts ? (
        <div className="empty">loading…</div>
      ) : scripts.length === 0 ? (
        <div className="empty">no scripts yet — draft one from the Trends page</div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          {scripts.map((s) => (
            <Link key={s.id} href={`/scripts/${s.id}`}>
              <div className="panel" style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{s.title}</div>
                  <div className="mono muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                    {s.sceneTypes.join(" → ") || "empty"}
                  </div>
                </div>
                {s.rendered ? <span className="badge ok">rendered</span> : <span className="badge cool">draft</span>}
              </div>
            </Link>
          ))}
        </motion.div>
      )}
    </div>
  );
}
