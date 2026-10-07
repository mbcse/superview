"use client";

import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C, GEIST, SAANS, STAGE_BG, clamp, enter } from "./lib";

export const ASTRO_FPS = 30;
export const ASTRO_DURATION = 330;
export const ASTRO_WIDTH = 960;
export const ASTRO_HEIGHT = 440;

const CHART = "Saturn transits the 10th. Mars aspects the 6th of employment.";
const PREDICTION = "Labor stays tight and wages keep pressure on operating costs.";
const NAMES = [
  { symbol: "AMZN", w: 34 },
  { symbol: "MSFT", w: 30 },
  { symbol: "META", w: 18 }
] as const;

export function AstrologyView() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const typed = CHART.slice(0, Math.round(clamp(frame, 18, 110, 0, CHART.length)));
  const caret = frame < 118 && Math.floor(frame / 8) % 2 === 0;
  const showPred = frame >= 130;
  const predTyped = PREDICTION.slice(0, Math.round(clamp(frame, 150, 230, 0, PREDICTION.length)));

  return (
    <AbsoluteFill style={{ background: STAGE_BG, fontFamily: SAANS, color: C.ink }}>
      <div
        style={{
          position: "absolute",
          width: 380,
          height: 380,
          left: -100,
          top: -120,
          borderRadius: 999,
          background: "radial-gradient(circle, rgb(56 182 240 / 0.18), transparent 70%)"
        }}
      />
      <div style={{ padding: "22px 28px 0", display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 26,
            padding: "0 10px",
            borderRadius: 999,
            background: C.mist,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: GEIST
          }}
        >
          Astrology · Vedic
        </span>
        <span style={{ fontSize: 13, color: C.muted, fontFamily: GEIST, opacity: clamp(frame, 12, 36, 0, 1) }}>
          Chart → prediction → basket
        </span>
      </div>

      <div style={{ padding: "16px 28px 0" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.teal, fontFamily: GEIST }}>
          Astrology chart
        </div>
        <div style={{ marginTop: 8, minHeight: 52, fontSize: 20, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.4, color: C.muted }}>
          {typed}
          {frame < 118 ? (
            <span
              style={{
                display: "inline-block",
                width: 2,
                height: 18,
                marginLeft: 3,
                background: caret ? C.teal : "transparent",
                verticalAlign: "-3px"
              }}
            />
          ) : null}
        </div>
      </div>

      <div
        style={{
          padding: "8px 28px 0",
          opacity: showPred ? clamp(frame, 130, 155, 0, 1) : 0
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: C.teal,
            fontFamily: GEIST
          }}
        >
          <span style={{ width: 24, height: 1, background: "rgb(14 143 143 / 0.35)" }} />
          Prediction
        </div>
        <div style={{ marginTop: 8, minHeight: 48, fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.3 }}>
          {predTyped}
        </div>
      </div>

      <div style={{ padding: "12px 28px 0", display: "flex", gap: 8 }}>
        {NAMES.map((n, i) => {
          const p = enter(frame, 240 + i * 12, fps);
          return (
            <div
              key={n.symbol}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgb(14 143 143 / 0.14)",
                background: C.white,
                opacity: p,
                transform: `translateY(${(1 - p) * 10}px)`
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600 }}>{n.symbol}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: C.muted, fontFamily: GEIST }}>{n.w}%</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

export function AstrologyViewStill() {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: `${ASTRO_WIDTH} / ${ASTRO_HEIGHT}`,
        background: STAGE_BG,
        fontFamily: SAANS,
        color: C.ink,
        padding: "24px 28px"
      }}
    >
      <p
        style={{
          display: "inline-flex",
          alignItems: "center",
          minHeight: 26,
          padding: "0 10px",
          borderRadius: 999,
          background: C.mist,
          fontSize: 12,
          fontWeight: 600,
          fontFamily: GEIST
        }}
      >
        Astrology · Vedic
      </p>
      <p style={{ marginTop: 16, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.teal, fontFamily: GEIST }}>
        Astrology chart
      </p>
      <p style={{ marginTop: 8, fontSize: 18, color: C.muted }}>{CHART}</p>
      <p style={{ marginTop: 16, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.teal, fontFamily: GEIST }}>
        Prediction
      </p>
      <p style={{ marginTop: 8, fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em" }}>{PREDICTION}</p>
    </div>
  );
}
