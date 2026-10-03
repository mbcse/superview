"use client";

import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C, GEIST, SAANS, STAGE_BG, clamp, enter } from "./lib";

export const INVEST_FPS = 30;
export const INVEST_DURATION = 240;
export const INVEST_WIDTH = 720;
export const INVEST_HEIGHT = 400;

const ROWS = [
  { symbol: "NVDA", usd: 24 },
  { symbol: "TSLA", usd: 20 },
  { symbol: "ISRG", usd: 18 },
  { symbol: "DE", usd: 20 },
  { symbol: "ROK", usd: 18 }
] as const;

export function InvestFlow() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = Math.round(clamp(frame, 40, 160, 0, 100));
  const paper = frame >= 48;

  return (
    <AbsoluteFill style={{ background: STAGE_BG, fontFamily: SAANS, color: C.ink }}>
      <div
        style={{
          position: "absolute",
          width: 340,
          height: 340,
          left: -90,
          top: -80,
          borderRadius: 999,
          background: "radial-gradient(circle, rgb(14 143 143 / 0.18), transparent 68%)"
        }}
      />
      <div style={{ padding: "22px 26px 0" }}>
        <div style={{ fontSize: 13, color: C.muted, fontFamily: GEIST }}>Robots will be big.</div>
        <div style={{ marginTop: 6, fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>
          {paper ? "Paper" : "Invest"} ${total}
        </div>
      </div>
      <div style={{ padding: "16px 26px 0", display: "grid", gap: 8 }}>
        {ROWS.map((row, i) => {
          const p = enter(frame, 36 + i * 10, fps);
          const usd = Math.round(clamp(frame, 50 + i * 8, 150 + i * 8, 0, row.usd));
          return (
            <div
              key={row.symbol}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid rgb(14 143 143 / 0.12)",
                background: C.white,
                opacity: p,
                transform: `translateY(${(1 - p) * 10}px)`
              }}
            >
              <span style={{ width: 52, fontSize: 14, fontWeight: 600 }}>{row.symbol}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 99, background: "rgb(14 143 143 / 0.1)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${(usd / 24) * 100}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #0E8F8F, #1680B8)"
                  }}
                />
              </div>
              <span
                style={{
                  width: 48,
                  textAlign: "right",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: GEIST,
                  fontVariantNumeric: "tabular-nums"
                }}
              >
                ${usd}
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          right: 26,
          bottom: 20,
          fontSize: 12,
          color: C.muted,
          fontFamily: GEIST,
          opacity: clamp(frame, 160, 190, 0, 1)
        }}
      >
        Live quotes. Simulated USDG.
      </div>
    </AbsoluteFill>
  );
}

export function InvestFlowStill() {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: `${INVEST_WIDTH} / ${INVEST_HEIGHT}`,
        background: STAGE_BG,
        fontFamily: SAANS,
        color: C.ink,
        padding: "24px 26px"
      }}
    >
      <p style={{ fontSize: 13, color: C.muted, fontFamily: GEIST }}>Robots will be big.</p>
      <p style={{ marginTop: 6, fontSize: 28, fontWeight: 600 }}>Paper $100</p>
      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
        {ROWS.map((row) => (
          <div key={row.symbol} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
            <span>{row.symbol}</span>
            <span style={{ fontFamily: GEIST }}>${row.usd}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
