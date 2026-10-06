"use client";

import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C, GEIST, SAANS, STAGE_BG, clamp, enter } from "./lib";

export const TOKEN_FPS = 30;
export const TOKEN_DURATION = 300;
export const TOKEN_WIDTH = 720;
export const TOKEN_HEIGHT = 480;

const TOKENS = [
  { symbol: "AAPL", company: "Apple", px: 198.4 },
  { symbol: "NVDA", company: "NVIDIA", px: 230.2 },
  { symbol: "MSFT", company: "Microsoft", px: 419.1 },
  { symbol: "AMZN", company: "Amazon", px: 186.7 },
  { symbol: "META", company: "Meta", px: 512.3 },
  { symbol: "TSLA", company: "Tesla", px: 356.8 }
] as const;

export function TokenMarket() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const grouped = frame >= 150;

  return (
    <AbsoluteFill style={{ background: STAGE_BG, fontFamily: SAANS, color: C.ink }}>
      <div
        style={{
          position: "absolute",
          width: 360,
          height: 360,
          right: -80,
          top: -90,
          borderRadius: 999,
          background: "radial-gradient(circle, rgb(14 143 143 / 0.18), transparent 70%)"
        }}
      />
      <div style={{ padding: "22px 26px 0" }}>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.15 }}>
          Stock tokens on multiple chains
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            color: C.muted,
            fontFamily: GEIST,
            opacity: clamp(frame, 8, 28, 0, 1)
          }}
        >
          Economic exposure to listed companies. Not share ownership.
        </div>
      </div>

      <div
        style={{
          padding: "20px 22px 0",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8
        }}
      >
        {TOKENS.map((t, i) => {
          const p = enter(frame, 24 + i * 10, fps);
          const tick = t.px + Math.sin((frame + i * 9) / 18) * 0.18;
          return (
            <div
              key={t.symbol}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgb(14 143 143 / 0.14)",
                background: C.white,
                opacity: p,
                transform: `translateY(${(1 - p) * 14}px)`
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  background: C.mist,
                  color: C.teal,
                  fontSize: 10,
                  fontWeight: 700,
                  display: "grid",
                  placeItems: "center",
                  fontFamily: GEIST
                }}
              >
                {t.symbol.slice(0, 2)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.02em" }}>{t.symbol}</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: GEIST }}>{t.company}</div>
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: GEIST,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.03em"
                }}
              >
                {tick.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          margin: "18px 22px 0",
          padding: "14px 16px",
          borderRadius: 16,
          border: "1px solid rgb(14 143 143 / 0.14)",
          background: "rgb(255 255 255 / 0.7)",
          opacity: clamp(frame, 150, 178, 0, 1),
          transform: `translateY(${clamp(frame, 150, 178, 12, 0)}px)`
        }}
      >
        <div style={{ fontSize: 12, color: C.muted, fontFamily: GEIST }}>{grouped ? "A view sizes these into a basket" : ""}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {TOKENS.map((t, i) => {
            const w = clamp(frame, 168 + i * 8, 210 + i * 8, 0, [18, 22, 16, 14, 15, 15][i] ?? 14);
            return (
              <div key={t.symbol} style={{ flex: w || 0.001, minWidth: 0 }}>
                <div
                  style={{
                    height: 28,
                    borderRadius: 8,
                    background: i % 2 === 0 ? C.teal : C.skyDeep,
                    opacity: 0.85
                  }}
                />
                <div style={{ marginTop: 6, fontSize: 10, fontFamily: GEIST, fontWeight: 600, color: C.muted }}>{t.symbol}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function TokenMarketStill() {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: `${TOKEN_WIDTH} / ${TOKEN_HEIGHT}`,
        background: STAGE_BG,
        fontFamily: SAANS,
        color: C.ink,
        padding: "24px 26px"
      }}
    >
      <p style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.03em" }}>Stock tokens on multiple chains</p>
      <p style={{ marginTop: 8, fontSize: 13, color: C.muted, fontFamily: GEIST }}>
        Economic exposure to listed companies. Not share ownership.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 20 }}>
        {TOKENS.map((t) => (
          <div
            key={t.symbol}
            style={{
              border: "1px solid rgb(14 143 143 / 0.14)",
              borderRadius: 14,
              padding: "10px 12px",
              fontSize: 14,
              fontWeight: 600
            }}
          >
            {t.symbol}
            <span style={{ marginLeft: 8, color: C.muted, fontWeight: 500 }}>{t.px.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
