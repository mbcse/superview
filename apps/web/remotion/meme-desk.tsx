"use client";

import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C, GEIST, SAANS, STAGE_BG, clamp, enter } from "./lib";

export const MEME_FPS = 30;
export const MEME_DURATION = 300;
export const MEME_WIDTH = 720;
export const MEME_HEIGHT = 480;

const COINS = [
  { symbol: "BONK", chg: 12.4, w: 28 },
  { symbol: "WIF", chg: -6.1, w: 22 },
  { symbol: "PNUT", chg: 8.7, w: 18 },
  { symbol: "MEW", chg: 4.2, w: 16 },
  { symbol: "POPCAT", chg: -3.8, w: 16 }
] as const;

export function MemeDesk() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vs = clamp(frame, 210, 270, 0, 2.18);
  const grouped = frame >= 150;

  return (
    <AbsoluteFill style={{ background: STAGE_BG, fontFamily: SAANS, color: C.ink }}>
      <div
        style={{
          position: "absolute",
          width: 360,
          height: 360,
          right: -90,
          top: -100,
          borderRadius: 999,
          background: "radial-gradient(circle, rgb(46 196 182 / 0.2), transparent 70%)"
        }}
      />
      <div style={{ padding: "22px 26px 0" }}>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.15 }}>Memecoins</div>
        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            color: C.muted,
            fontFamily: GEIST,
            opacity: clamp(frame, 8, 28, 0, 1)
          }}
        >
          Own desk. Scored versus SOL. Cash never mixes with stocks.
        </div>
      </div>

      <div style={{ padding: "18px 22px 0", display: "grid", gap: 8 }}>
        {COINS.map((c, i) => {
          const p = enter(frame, 22 + i * 10, fps);
          const tick = c.chg + Math.sin((frame + i * 13) / 14) * 1.4;
          const up = tick >= 0;
          return (
            <div
              key={c.symbol}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgb(14 143 143 / 0.14)",
                background: C.white,
                opacity: p,
                transform: `translateY(${(1 - p) * 12}px)`
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
                {c.symbol.slice(0, 2)}
              </span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, letterSpacing: "-0.02em" }}>{c.symbol}</span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: GEIST,
                  fontVariantNumeric: "tabular-nums",
                  color: up ? C.gain : "#E5484D"
                }}
              >
                {up ? "+" : ""}
                {tick.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          margin: "16px 22px 0",
          padding: "14px 16px",
          borderRadius: 16,
          border: "1px solid rgb(14 143 143 / 0.14)",
          background: "rgb(255 255 255 / 0.7)",
          opacity: clamp(frame, 150, 178, 0, 1),
          transform: `translateY(${clamp(frame, 150, 178, 12, 0)}px)`
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 12, color: C.muted, fontFamily: GEIST }}>{grouped ? "vs SOL" : ""}</span>
          <span
            style={{
              fontSize: 22,
              fontWeight: 600,
              fontFamily: GEIST,
              color: C.gain,
              fontVariantNumeric: "tabular-nums"
            }}
          >
            +{vs.toFixed(2)}%
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {COINS.map((c, i) => {
            const w = clamp(frame, 168 + i * 8, 210 + i * 8, 0, c.w);
            return (
              <div key={c.symbol} style={{ flex: w || 0.001, minWidth: 0 }}>
                <div
                  style={{
                    height: 22,
                    borderRadius: 8,
                    background: i % 2 === 0 ? C.teal : C.skyDeep,
                    opacity: 0.85
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function MemeDeskStill() {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: `${MEME_WIDTH} / ${MEME_HEIGHT}`,
        background: STAGE_BG,
        fontFamily: SAANS,
        color: C.ink,
        padding: "24px 26px"
      }}
    >
      <p style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.03em" }}>Memecoins</p>
      <p style={{ marginTop: 8, fontSize: 13, color: C.muted, fontFamily: GEIST }}>Own desk. Scored versus SOL.</p>
      <div style={{ marginTop: 20, display: "grid", gap: 8 }}>
        {COINS.map((c) => (
          <div
            key={c.symbol}
            style={{
              display: "flex",
              justifyContent: "space-between",
              border: "1px solid rgb(14 143 143 / 0.14)",
              borderRadius: 14,
              padding: "10px 12px",
              fontSize: 14,
              fontWeight: 600
            }}
          >
            <span>{c.symbol}</span>
            <span style={{ fontFamily: GEIST, color: c.chg >= 0 ? C.gain : "#E5484D" }}>
              {c.chg >= 0 ? "+" : ""}
              {c.chg.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
