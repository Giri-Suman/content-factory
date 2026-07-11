import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme.js";

const clean = (w) => w.toLowerCase().replace(/[^a-z0-9.+#-]/gi, "");

// Big words popping in, synced to the voice timestamps. Emphasis words get accent.
export const KineticText = ({ scene, vertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = scene.words || [];
  const emphasis = new Set((scene.emphasis || []).map(clean));

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: vertical ? "0 70px" : "0 200px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.34em",
          justifyContent: "center",
          fontFamily: theme.fonts.display,
          fontWeight: 800,
          fontSize: vertical ? 78 : 92,
          lineHeight: 1.16,
          textAlign: "center",
          letterSpacing: "-0.01em",
        }}
      >
        {words.map((w, i) => {
          const startF = w.start * fps;
          const s = spring({ frame: frame - startF, fps, config: { damping: 13, stiffness: 190 } });
          const emph = emphasis.has(clean(w.word));
          return (
            <span
              key={i}
              style={{
                color: emph ? theme.accent : theme.text,
                opacity: Math.min(1, s * 1.6),
                transform: `scale(${0.6 + 0.4 * s}) translateY(${(1 - s) * 20}px)`,
                display: "inline-block",
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
