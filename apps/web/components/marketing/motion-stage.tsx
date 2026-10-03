"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Player, type PlayerRef } from "@remotion/player";

type Props = {
  component: ComponentType;
  still: ReactNode;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  label: string;
};

export function MotionStage({ component, still, durationInFrames, fps, width, height, label }: Props) {
  const player = useRef<PlayerRef>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [reduce, setReduce] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduce || !ready) return;
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) player.current?.play();
        else player.current?.pause();
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce, ready]);

  return (
    <div
      ref={wrap}
      className="overflow-hidden rounded-2xl border border-teal/14 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.94),0_18px_40px_-22px_rgba(14,116,144,0.28)]"
    >
      {reduce || !ready ? (
        still
      ) : (
        <Player
          ref={player}
          component={component}
          durationInFrames={durationInFrames}
          fps={fps}
          compositionWidth={width}
          compositionHeight={height}
          autoPlay
          loop
          controls={false}
          clickToPlay={false}
          spaceKeyToPlayOrPause={false}
          acknowledgeRemotionLicense
          style={{ width: "100%", height: "auto", aspectRatio: `${width} / ${height}` }}
        />
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}
