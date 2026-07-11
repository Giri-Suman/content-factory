import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme.js";

// Original generated meme: giant emoji + impact caption on a tilted card.
// (No copyrighted clips — this is deliberate. See assets/brand/README.md.)
export const MemeCard = ({ scene, vertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 11, stiffness: 170 } });
  const wobble = Math.sin(frame / 9) * 1.3;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          transform: `scale(${pop}) rotate(${-3 + wobble}deg)`,
          background: theme.panel,
          border: `1px solid ${theme.panelBorder}`,
          borderRadius: 26,
          padding: vertical ? "60px 60px" : "64px 110px",
          textAlign: "center",
          boxShadow: "0 40px 110px rgba(0,0,0,.6)",
        }}
      >
        <div style={{ fontSize: vertical ? 170 : 190, lineHeight: 1.1 }}>{scene.emoji || "🤖"}</div>
        <div
          style={{
            fontFamily: theme.fonts.display,
            fontWeight: 900,
            fontSize: vertical ? 56 : 66,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            color: theme.text,
            marginTop: 26,
            maxWidth: 800,
          }}
        >
          {scene.text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
