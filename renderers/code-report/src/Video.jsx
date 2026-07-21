import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { theme } from "./theme.js";
import { Captions } from "./chrome/Captions.jsx";
import { Intro } from "./chrome/Intro.jsx";
import { Outro } from "./chrome/Outro.jsx";
import { ProgressBar } from "./chrome/ProgressBar.jsx";
import { CodeBlock } from "./scenes/CodeBlock.jsx";
import { KineticText } from "./scenes/KineticText.jsx";
import { MemeCard } from "./scenes/MemeCard.jsx";
import { QuoteCard } from "./scenes/QuoteCard.jsx";
import { ScreenshotPan } from "./scenes/ScreenshotPan.jsx";
import { StatChart } from "./scenes/StatChart.jsx";
import { TerminalReplay } from "./scenes/TerminalReplay.jsx";

const REGISTRY = {
  kinetic: KineticText,
  code: CodeBlock,
  screenshot: ScreenshotPan,
  terminal: TerminalReplay,
  meme: MemeCard,
  stat: StatChart,
  quote: QuoteCard,
};

export const CodeReportVideo = ({ title, brand, date, scenes = [], timeline, outro, captionScale = 1 }) => {
  const { height, width } = useVideoConfig();
  const vertical = height > width;

  if (!timeline || scenes.length === 0) {
    return (
      <AbsoluteFill
        style={{
          background: theme.bg,
          color: theme.muted,
          justifyContent: "center",
          alignItems: "center",
          fontFamily: theme.fonts.mono,
          fontSize: 30,
        }}
      >
        <div>run: factory render &lt;script.json&gt;</div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {timeline.intro > 0 && (
        <Sequence durationInFrames={timeline.intro}>
          <Intro brand={brand} date={date} title={title} vertical={vertical} />
        </Sequence>
      )}

      {scenes.map((scene, i) => {
        const Comp = REGISTRY[scene.type] || KineticText;
        const t = timeline.scenes[i];
        return (
          <Sequence key={i} from={t.start} durationInFrames={t.frames}>
            {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
            <Comp scene={scene} vertical={vertical} frames={t.frames} />
            {scene.type !== "kinetic" && scene.words?.length ? (
              <Captions words={scene.words} vertical={vertical} captionScale={captionScale} />
            ) : null}
          </Sequence>
        );
      })}

      <Sequence from={timeline.totalFrames - timeline.outro} durationInFrames={timeline.outro}>
        <Outro brand={brand} outro={outro} vertical={vertical} />
      </Sequence>

      <ProgressBar total={timeline.totalFrames} />
    </AbsoluteFill>
  );
};
