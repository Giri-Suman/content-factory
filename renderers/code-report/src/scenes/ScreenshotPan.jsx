import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

// Ken Burns over a captured page/screenshot. pan: down | up | in | out
export const ScreenshotPan = ({ scene, frames = 150 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, frames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const dir = scene.pan || "down";
  const transform = {
    down: `scale(${1.12 + 0.05 * p}) translateY(${-4.5 * p}%)`,
    up: `scale(${1.12 + 0.05 * p}) translateY(${4.5 * p}%)`,
    in: `scale(${1.04 + 0.16 * p})`,
    out: `scale(${1.2 - 0.16 * p})`,
  }[dir];

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={staticFile(scene.img)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "top center",
          transform,
        }}
      />
      {/* subtle vignette so captions stay readable */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.45) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
