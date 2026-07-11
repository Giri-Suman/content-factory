import React from "react";
import { useCurrentFrame } from "remotion";
import { theme } from "../theme.js";

export const ProgressBar = ({ total }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        height: 8,
        width: `${(frame / total) * 100}%`,
        background: theme.accent,
      }}
    />
  );
};
