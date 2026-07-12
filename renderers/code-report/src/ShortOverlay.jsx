import React from "react";
import {
  AbsoluteFill,
  Audio,
  Loop,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { theme } from "./theme.js";
import { Captions } from "./chrome/Captions.jsx";
import { ProgressBar } from "./chrome/ProgressBar.jsx";

/**
 * Wraps any rendered video (manim math scene, filmed footage...) with the
 * channel chrome: voiceover audio, karaoke captions, hook title card, brand
 * tag and progress bar. Comp length follows the AUDIO; the video loops or
 * freezes underneath if shorter.
 */
export const ShortOverlay = ({ video, audio, words = [], videoFrames, totalFrames, hook, brand }) => {
  const frame = useCurrentFrame();

  const hookOpacity = interpolate(frame, [8, 20, 80, 95], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {video ? (
        <Loop durationInFrames={Math.max(1, videoFrames || totalFrames)}>
          <OffthreadVideo
            src={staticFile(video)}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </Loop>
      ) : null}
      {audio ? <Audio src={staticFile(audio)} /> : null}

      {hook ? (
        <div
          style={{
            position: "absolute",
            top: "9%",
            left: 0,
            right: 0,
            padding: "0 70px",
            textAlign: "center",
            opacity: hookOpacity,
            fontFamily: theme.fonts.display,
            fontWeight: 800,
            fontSize: 58,
            lineHeight: 1.2,
            color: theme.text,
            textShadow: "0 3px 16px rgba(0,0,0,.9)",
          }}
        >
          {hook}
        </div>
      ) : null}

      {words.length ? <Captions words={words} vertical /> : null}

      <div
        style={{
          position: "absolute",
          bottom: "6.5%",
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: theme.fonts.mono,
          fontSize: 22,
          letterSpacing: "0.3em",
          color: theme.muted,
        }}
      >
        {(brand?.name || "CONTENT FACTORY").toUpperCase()}
      </div>

      <ProgressBar total={totalFrames} />
    </AbsoluteFill>
  );
};
