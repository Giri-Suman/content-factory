import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme.js";

// Word-karaoke captions driven by voice timestamps (relative to scene start).
export const Captions = ({ words, vertical, captionScale = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tSec = frame / fps;

  const chunks = [];
  for (let i = 0; i < words.length; i += 4) chunks.push(words.slice(i, i + 4));
  const chunk = chunks.find((ch) => tSec <= ch[ch.length - 1].end + 0.15) || chunks[chunks.length - 1];
  if (!chunk) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: vertical ? "18%" : 64,
        display: "flex",
        justifyContent: "center",
        gap: "0.32em",
        flexWrap: "wrap",
        padding: "0 60px",
        fontFamily: theme.fonts.display,
        fontWeight: 800,
        fontSize: (vertical ? 54 : 44) * captionScale,
        textShadow: "0 3px 14px rgba(0,0,0,.9), 0 0 3px rgba(0,0,0,.9)",
      }}
    >
      {chunk.map((w, i) => {
        const active = tSec >= w.start;
        return (
          <span
            key={i}
            style={{
              color: active ? theme.accent : theme.text,
              transform: active ? "scale(1.04)" : "scale(1)",
              display: "inline-block",
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};
