import React from "react";
import { Composition } from "remotion";
import { CodeReportVideo } from "./Video.jsx";
import { ShortOverlay } from "./ShortOverlay.jsx";
import { EffectLab } from "./effects/Effects.jsx";

const FPS = 30;

// duration comes from the prepared props (--props file), not hardcoded
const calc = ({ props }) => ({
  durationInFrames: props?.timeline?.totalFrames || 300,
});

const calcOverlay = ({ props }) => ({
  durationInFrames: props?.totalFrames || 300,
});

export const Root = () => (
  <>
    <Composition
      id="CodeReport"
      component={CodeReportVideo}
      durationInFrames={300}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{}}
      calculateMetadata={calc}
    />
    <Composition
      id="CodeReportVertical"
      component={CodeReportVideo}
      durationInFrames={300}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{}}
      calculateMetadata={calc}
    />
    <Composition
      id="CodeReportLinkedIn"
      component={CodeReportVideo}
      durationInFrames={300}
      fps={FPS}
      width={1080}
      height={1350}
      defaultProps={{}}
      calculateMetadata={calc}
    />
    <Composition
      id="CodeReportSquare"
      component={CodeReportVideo}
      durationInFrames={300}
      fps={FPS}
      width={1080}
      height={1080}
      defaultProps={{}}
      calculateMetadata={calc}
    />
    <Composition
      id="ShortOverlay"
      component={ShortOverlay}
      durationInFrames={300}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{}}
      calculateMetadata={calcOverlay}
    />
    <Composition
      id="EffectLab"
      component={EffectLab}
      durationInFrames={120}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ effect: "aurora-mesh", text: "Motion Lab" }}
      calculateMetadata={calcOverlay}
    />
  </>
);
