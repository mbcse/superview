"use client";

import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, GEIST, SAANS, STAGE_BG, area, clamp, polyline } from "./lib";

export const GRAPH_FPS = 30;
export const GRAPH_DURATION = 270;
export const GRAPH_WIDTH = 960;
export const GRAPH_HEIGHT = 420;

const SPY = [0, 0.03, 0.05, 0.04, 0.07, 0.09, 0.08, 0.11, 0.13, 0.12, 0.15, 0.17, 0.16, 0.19];
const VIEW = [0, 0.02, 0.08, 0.01, 0.1, 0.06, 0.16, 0.21, 0.18, 0.28, 0.34, 0.31, 0.39, 0.44];
const W = 860;
const H = 210;

export function VsSpyGraph() {
  const frame = useCurrentFrame();
  const spyDraw = clamp(frame, 18, 110, 0, 1);
  const viewDraw = clamp(frame, 48, 160, 0, 1);
  const vs = clamp(frame, 150, 210, 0, 0.44);
  const spyPath = polyline(SPY, W, H);
  const viewPath = polyline(VIEW, W, H);
  const viewArea = area(VIEW, W, H);
  const head = pointOn(VIEW, W, H, viewDraw);

  return (
    <AbsoluteFill style={{ background: STAGE_BG, fontFamily: SAANS, color: C.ink }}>
      <div
        style={{
          position: "absolute",
          width: 420,
          height: 420,
          left: -100,
          bottom: -140,
          borderRadius: 999,
          background: "radial-gradient(circle, rgb(22 163 74 / 0.12), transparent 68%)"
        }}
      />
      <div style={{ padding: "20px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 13, color: C.muted, fontFamily: GEIST }}>This view vs S&P 500</div>
          <div
            style={{
              marginTop: 4,
              fontSize: 40,
              fontWeight: 600,
              letterSpacing: "-0.04em",
              fontVariantNumeric: "tabular-nums",
              fontFamily: GEIST,
              color: C.gain
            }}
          >
            +{vs.toFixed(2)}%
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, fontSize: 12, fontFamily: GEIST, color: C.muted }}>
          <Legend color={C.gain} label="View basket" />
          <Legend color="rgb(14 143 143 / 0.55)" label="S&P 500" />
        </div>
      </div>

      <svg width={W} height={H + 8} viewBox={`0 0 ${W} ${H}`} style={{ margin: "18px 50px 0" }} aria-hidden>
        {[0.25, 0.5, 0.75].map((y) => (
          <line
            key={y}
            x1="0"
            x2={W}
            y1={H * y}
            y2={H * y}
            stroke="rgb(14 143 143 / 0.1)"
            strokeWidth="1"
          />
        ))}
        <path d={viewArea} fill="rgb(22 163 74 / 0.1)" opacity={viewDraw} />
        <path
          d={spyPath}
          fill="none"
          stroke="rgb(14 143 143 / 0.5)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={1100}
          strokeDashoffset={1100 * (1 - spyDraw)}
        />
        <path
          d={viewPath}
          fill="none"
          stroke={C.gain}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={1100}
          strokeDashoffset={1100 * (1 - viewDraw)}
        />
        <circle cx={head.x} cy={head.y} r={5} fill={C.gain} opacity={viewDraw} />
      </svg>

      <div
        style={{
          padding: "16px 28px 0",
          fontSize: 12,
          color: C.muted,
          fontFamily: GEIST,
          opacity: clamp(frame, 170, 200, 0, 1)
        }}
      >
        Illustrative path from a sample view. Live marks update from market quotes.
      </div>
    </AbsoluteFill>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 18, height: 2, background: color, borderRadius: 99 }} />
      {label}
    </span>
  );
}

function pointOn(values: number[], width: number, height: number, t: number) {
  const i = Math.min(values.length - 1, Math.max(0, t * (values.length - 1)));
  const i0 = Math.floor(i);
  const i1 = Math.min(values.length - 1, i0 + 1);
  const f = i - i0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const v = (values[i0] ?? 0) * (1 - f) + (values[i1] ?? 0) * f;
  return {
    x: (i / (values.length - 1)) * width,
    y: height - ((v - min) / span) * (height - 4) - 2
  };
}

export function VsSpyStill() {
  const spyPath = polyline(SPY, W, H);
  const viewPath = polyline(VIEW, W, H);
  const viewArea = area(VIEW, W, H);
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: `${GRAPH_WIDTH} / ${GRAPH_HEIGHT}`,
        background: STAGE_BG,
        fontFamily: SAANS,
        color: C.ink,
        padding: "24px 28px"
      }}
    >
      <p style={{ fontSize: 13, color: C.muted, fontFamily: GEIST }}>This view vs S&P 500</p>
      <p style={{ marginTop: 4, fontSize: 40, fontWeight: 600, color: C.gain, fontFamily: GEIST }}>+0.44%</p>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ marginTop: 16 }} aria-hidden>
        <path d={viewArea} fill="rgb(22 163 74 / 0.1)" />
        <path d={spyPath} fill="none" stroke="rgb(14 143 143 / 0.5)" strokeWidth="2" />
        <path d={viewPath} fill="none" stroke={C.gain} strokeWidth="2.6" />
      </svg>
    </div>
  );
}
