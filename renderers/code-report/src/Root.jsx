import React from "react";
import { Composition } from "remotion";
import { CodeReportVideo } from "./Video.jsx";

const FPS = 30;

// duration comes from the prepared props (--props file), not hardcoded
const calc = ({ props }) => ({
  durationInFrames: props?.timeline?.totalFrames || 300,
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
  </>
);
