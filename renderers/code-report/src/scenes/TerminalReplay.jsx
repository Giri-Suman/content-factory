import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme.js";

// Types out terminal lines at ~38 chars/sec. Lines starting "$ " get a prompt.
export const TerminalReplay = ({ scene, vertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = scene.lines || [];
  const budget = Math.floor((frame / fps) * 38);

  let used = 0;
  const visible = [];
  for (const line of lines) {
    const cost = line.length + 6; // small pause between lines
    if (used + line.length <= budget) {
      visible.push({ text: line, partial: false });
    } else if (used < budget) {
      visible.push({ text: line.slice(0, budget - used), partial: true });
      used = budget;
      break;
    } else {
      break;
    }
    used += cost;
  }
  const done = visible.length === lines.length && !visible.some((v) => v.partial);
  const cursorOn = Math.floor(frame / 14) % 2 === 0;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: vertical ? 36 : 120 }}>
      <div
        style={{
          background: "#0a0d12",
          border: `1px solid ${theme.panelBorder}`,
          borderRadius: 14,
          width: "100%",
          maxWidth: vertical ? 980 : 1500,
          boxShadow: "0 30px 90px rgba(0,0,0,.55)",
        }}
      >
        <div
          style={{
            padding: "14px 22px",
            borderBottom: `1px solid ${theme.panelBorder}`,
            fontFamily: theme.fonts.mono,
            fontSize: 20,
            color: theme.muted,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
            ))}
          </div>
          content-factory — bash
        </div>
        <pre
          style={{
            margin: 0,
            padding: "26px 30px",
            fontFamily: theme.fonts.mono,
            fontSize: vertical ? 26 : 30,
            lineHeight: 1.65,
            minHeight: vertical ? 300 : 260,
          }}
        >
          {visible.map((v, i) => {
            const isCmd = v.text.startsWith("$ ");
            const last = i === visible.length - 1;
            return (
              <div key={i} style={{ color: isCmd ? theme.text : theme.green }}>
                {isCmd ? (
                  <>
                    <span style={{ color: theme.accent }}>$ </span>
                    {v.text.slice(2)}
                  </>
                ) : (
                  v.text
                )}
                {last && (v.partial || !done) && cursorOn ? (
                  <span style={{ background: theme.text, color: theme.text }}>&#9608;</span>
                ) : null}
              </div>
            );
          })}
        </pre>
      </div>
    </AbsoluteFill>
  );
};
