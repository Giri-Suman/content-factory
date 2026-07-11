import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme.js";

const COLORS = [theme.accent, theme.green, theme.blue, theme.red];

// Animated horizontal bar chart. scene.stats: [{ name, value, suffix? }]
export const StatChart = ({ scene, vertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stats = scene.stats || [];
  const max = Math.max(...stats.map((s) => s.value), 1);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: vertical ? 50 : 160 }}>
      <div style={{ width: "100%", maxWidth: vertical ? 940 : 1400, fontFamily: theme.fonts.display }}>
        {scene.label ? (
          <div style={{ fontSize: vertical ? 44 : 52, fontWeight: 800, color: theme.text, marginBottom: 44 }}>
            {scene.label}
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: vertical ? 30 : 34 }}>
          {stats.map((s, i) => {
            const v = spring({ frame: frame - 8 - i * 7, fps, config: { damping: 200, stiffness: 90 } });
            const pct = (s.value / max) * 100 * v;
            const shown = Math.round(s.value * v);
            return (
              <div key={i}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: vertical ? 30 : 32,
                    fontWeight: 650,
                    color: theme.text,
                    marginBottom: 10,
                  }}
                >
                  <span>{s.name}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: COLORS[i % COLORS.length] }}>
                    {shown}
                    {s.suffix || ""}
                  </span>
                </div>
                <div style={{ height: vertical ? 22 : 26, background: theme.panel, borderRadius: 13 }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      background: COLORS[i % COLORS.length],
                      borderRadius: 13,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
