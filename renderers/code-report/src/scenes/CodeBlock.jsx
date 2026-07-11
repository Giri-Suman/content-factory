import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme.js";

// Editor panel: lines slide in sequentially; optional focus range dims the rest.
export const CodeBlock = ({ scene, vertical }) => {
  const frame = useCurrentFrame();
  const lines = scene.tokens || [];
  const perLine = 5;
  const revealEnd = lines.length * perLine;
  const focus = scene.focus || null; // [startLine, endLine], 1-indexed

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: vertical ? 36 : 100 }}>
      <div
        style={{
          background: theme.panel,
          border: `1px solid ${theme.panelBorder}`,
          borderRadius: 14,
          padding: "24px 36px 30px",
          maxWidth: "100%",
          boxShadow: "0 30px 90px rgba(0,0,0,.55)",
        }}
      >
        <div style={{ display: "flex", gap: 9, marginBottom: 20 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 15, height: 15, borderRadius: 8, background: c }} />
          ))}
        </div>
        <pre
          style={{
            margin: 0,
            fontFamily: theme.fonts.mono,
            fontSize: vertical ? 25 : 30,
            lineHeight: 1.6,
            overflow: "hidden",
          }}
        >
          {lines.map((line, i) => {
            const local = frame - i * perLine;
            const appear = interpolate(local, [0, 7], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const slide = interpolate(local, [0, 7], [16, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const inFocus = !focus || (i + 1 >= focus[0] && i + 1 <= (focus[1] || focus[0]));
            const dim = focus
              ? interpolate(frame, [revealEnd + 12, revealEnd + 24], [1, inFocus ? 1 : 0.25], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })
              : 1;
            return (
              <div key={i} style={{ opacity: appear * dim, transform: `translateX(${slide}px)` }}>
                {line.length === 0
                  ? " "
                  : line.map((tok, j) => (
                      <span key={j} style={{ color: tok.c || theme.text }}>
                        {tok.t}
                      </span>
                    ))}
              </div>
            );
          })}
        </pre>
      </div>
    </AbsoluteFill>
  );
};
