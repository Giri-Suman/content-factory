import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme.js";

export const Intro = ({ brand, date, title, vertical }) => {
  const f = useCurrentFrame();

  // accent bar sweeps in from the left, then exits right
  const sweepIn = interpolate(f, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sweepOut = interpolate(f, [14, 26], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sweeping = f <= 12;

  const contentIn = interpolate(f, [12, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rise = interpolate(contentIn, [0, 1], [30, 0]);

  return (
    <AbsoluteFill style={{ background: theme.bg, justifyContent: "center", alignItems: "center" }}>
      <AbsoluteFill
        style={{
          background: brand?.accent || theme.accent,
          transform: `scaleX(${sweeping ? sweepIn : sweepOut})`,
          transformOrigin: sweeping ? "left" : "right",
        }}
      />
      <div
        style={{
          opacity: contentIn,
          transform: `translateY(${rise}px)`,
          textAlign: "center",
          padding: "0 60px",
          fontFamily: theme.fonts.display,
        }}
      >
        <div
          style={{
            fontFamily: theme.fonts.mono,
            fontSize: vertical ? 26 : 24,
            letterSpacing: "0.35em",
            color: brand?.accent || theme.accent,
            marginBottom: 26,
          }}
        >
          {(brand?.name || "CONTENT FACTORY").toUpperCase()}
        </div>
        <div
          style={{
            fontSize: vertical ? 72 : 92,
            fontWeight: 800,
            color: theme.text,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            maxWidth: vertical ? 900 : 1400,
          }}
        >
          {title}
        </div>
        <div style={{ fontFamily: theme.fonts.mono, fontSize: vertical ? 24 : 26, color: theme.muted, marginTop: 30 }}>
          {date}
        </div>
      </div>
    </AbsoluteFill>
  );
};
