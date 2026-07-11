import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme.js";

export const Outro = ({ brand, outro, vertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 6, fps, config: { damping: 12, stiffness: 180 } });
  const fade = spring({ frame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill
      style={{
        background: theme.bg,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: theme.fonts.display,
        gap: 34,
      }}
    >
      <div
        style={{
          opacity: fade,
          fontFamily: theme.fonts.mono,
          letterSpacing: "0.35em",
          color: brand?.accent || theme.accent,
          fontSize: vertical ? 26 : 24,
        }}
      >
        {(brand?.name || "CONTENT FACTORY").toUpperCase()}
      </div>
      <div
        style={{
          transform: `scale(${pop})`,
          background: "#e02f2f",
          color: "#fff",
          fontWeight: 800,
          fontSize: vertical ? 56 : 62,
          padding: "22px 66px",
          borderRadius: 18,
          letterSpacing: "0.02em",
        }}
      >
        SUBSCRIBE
      </div>
      {outro?.cta ? (
        <div style={{ opacity: fade, color: theme.muted, fontSize: vertical ? 32 : 34, maxWidth: 900, textAlign: "center" }}>
          {outro.cta}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
