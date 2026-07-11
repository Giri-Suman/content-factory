import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme.js";

// Large quotation with words fading in, attribution below.
export const QuoteCard = ({ scene, vertical }) => {
  const frame = useCurrentFrame();
  const words = (scene.quote || "").split(/\s+/).filter(Boolean);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: vertical ? "0 80px" : "0 260px" }}>
      <div style={{ position: "relative", maxWidth: 1300 }}>
        <div
          style={{
            position: "absolute",
            top: vertical ? -90 : -110,
            left: -30,
            fontSize: vertical ? 180 : 220,
            fontFamily: "Georgia, serif",
            color: theme.accent,
            opacity: 0.9,
            lineHeight: 1,
          }}
        >
          &#8220;
        </div>
        <div
          style={{
            fontFamily: theme.fonts.display,
            fontSize: vertical ? 56 : 64,
            fontWeight: 700,
            lineHeight: 1.35,
            color: theme.text,
            display: "flex",
            flexWrap: "wrap",
            gap: "0.3em",
          }}
        >
          {words.map((w, i) => {
            const o = interpolate(frame, [8 + i * 2, 16 + i * 2], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <span key={i} style={{ opacity: o }}>
                {w}
              </span>
            );
          })}
        </div>
        {scene.attribution ? (
          <div
            style={{
              marginTop: 38,
              fontFamily: theme.fonts.mono,
              fontSize: vertical ? 26 : 28,
              color: theme.muted,
              opacity: interpolate(frame, [10 + words.length * 2, 22 + words.length * 2], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            — {scene.attribution}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
