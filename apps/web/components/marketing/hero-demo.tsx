"use client";

import { MotionStage } from "@/components/marketing/motion-stage";
import { LandingComposer } from "@/components/marketing/landing-composer";
import {
  VIEW_DURATION,
  VIEW_FPS,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  ViewJourney,
  ViewJourneyStill
} from "@/remotion/view-journey";

export function HeroDemo() {
  return (
    <div>
      <MotionStage
        component={ViewJourney}
        still={<ViewJourneyStill />}
        durationInFrames={VIEW_DURATION}
        fps={VIEW_FPS}
        width={VIEW_WIDTH}
        height={VIEW_HEIGHT}
        label="A view being typed, researched into stock tokens, then invested"
      />
      <LandingComposer />
    </div>
  );
}
