"use client";

import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C, GEIST, SAANS, STAGE_BG, clamp, enter } from "./lib";

export const HOW_FPS = 30;
export const HOW_DURATION = 360;
export const HOW_WIDTH = 960;
export const HOW_HEIGHT = 440;

const SENTENCE = "Robots will be big.";
const NAMES = [
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "ISRG", name: "Intuitive" },
  { symbol: "DE", name: "Deere" },
  { symbol: "ROK", name: "Rockwell" }
] as const;
const WEIGHTS = [0.24, 0.2, 0.18, 0.2, 0.18];
const STEPS = ["Write", "Research", "Basket", "Invest"] as const;

export function HowItWorksFilm() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const step = frame < 90 ? 0 : frame < 180 ? 1 : frame < 270 ? 2 : 3;
  const typed = SENTENCE.slice(0, Math.round(clamp(frame, 12, 78, 0, SENTENCE.length)));
  const caret = frame < 86 && Math.floor(frame / 8) % 2 === 0;
  const vs = clamp(frame, 286, 340, 0, 0.44);
  const dollars = Math.round(clamp(frame, 286, 330, 0, 100));

  return (
    <AbsoluteFill style={{ background: STAGE_BG, fontFamily: SAANS, color: C.ink }}>
      <Blob left={-90} top={-140} color="rgb(46 196 182 / 0.2)" />
      <Blob right={-80} bottom={-120} color="rgb(56 182 240 / 0.16)" />

      <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", padding: "8px 0 0" }}>
      <div style={{ padding: "10px 28px 0", display: "flex", gap: 22 }}>
        {STEPS.map((label, i) => {
          const on = i === step;
          const done = i < step;
          return (
            <div key={label} style={{ flex: 1 }}>
              <div
                style={{
                  height: 3,
                  borderRadius: 99,
                  background: on || done ? C.teal : "rgb(14 143 143 / 0.14)"
                }}
              />
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: GEIST,
                  color: on ? C.teal : C.muted,
                  opacity: on ? 1 : 0.6
                }}
              >
                {label}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: "18px 28px 0", minHeight: 58, fontSize: 30, fontWeight: 600, letterSpacing: "-0.03em" }}>
        {step === 0 ? (
          <>
            {typed}
            <span
              style={{
                display: "inline-block",
                width: 2,
                height: 28,
                marginLeft: 3,
                background: caret ? C.teal : "transparent",
                verticalAlign: "-4px"
              }}
            />
          </>
        ) : (
          SENTENCE
        )}
      </div>

      <div style={{ position: "relative", flex: 1, marginTop: 8, minHeight: 280 }}>
        <div
          style={{
            position: "absolute",
            inset: "0 28px 24px",
            opacity: step === 0 ? 1 : 0,
            pointerEvents: "none"
          }}
        >
          <p style={{ fontSize: 15, color: C.muted, fontFamily: GEIST, maxWidth: 420, lineHeight: 1.45 }}>
            A short belief about the world. SuperView reads it the way an analyst would.
          </p>
        </div>

        <div
          style={{
            position: "absolute",
            inset: "0 28px 24px",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignContent: "flex-start",
            opacity: step === 1 ? 1 : 0
          }}
        >
          {NAMES.map((n, i) => {
            const p = enter(frame, 96 + i * 12, fps);
            return (
              <div
                key={n.symbol}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 12px 7px 7px",
                  borderRadius: 12,
                  border: "1px solid rgb(14 143 143 / 0.14)",
                  background: C.white,
                  opacity: p,
                  transform: `translateY(${(1 - p) * 12}px)`
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: C.mist,
                    color: C.teal,
                    fontSize: 10,
                    fontWeight: 700,
                    display: "grid",
                    placeItems: "center",
                    fontFamily: GEIST
                  }}
                >
                  {n.symbol.slice(0, 2)}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.02em" }}>{n.symbol}</span>
                <span style={{ fontSize: 12, color: C.muted, fontFamily: GEIST }}>{n.name}</span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            position: "absolute",
            inset: "0 28px 24px",
            display: "grid",
            gap: 10,
            alignContent: "start",
            opacity: step === 2 ? 1 : 0
          }}
        >
          {NAMES.map((n, i) => {
            const fill = clamp(frame, 188 + i * 10, 228 + i * 10, 0, WEIGHTS[i] ?? 0);
            return (
              <div key={n.symbol} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 44, fontSize: 12, fontWeight: 600, fontFamily: GEIST }}>{n.symbol}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 99, background: "rgb(14 143 143 / 0.1)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${fill * 100}%`,
                      height: "100%",
                      borderRadius: 99,
                      background: "linear-gradient(90deg, #0E8F8F, #1680B8)"
                    }}
                  />
                </div>
                <span style={{ width: 40, textAlign: "right", fontSize: 12, fontWeight: 600, fontFamily: GEIST, fontVariantNumeric: "tabular-nums" }}>
                  {Math.round(fill * 100)}%
                </span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            position: "absolute",
            inset: "0 28px 24px",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            opacity: step === 3 ? 1 : 0
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: GEIST }}>vs S&P 500</div>
            <div
              style={{
                fontSize: 40,
                fontWeight: 600,
                color: C.gain,
                letterSpacing: "-0.03em",
                fontVariantNumeric: "tabular-nums",
                fontFamily: GEIST
              }}
            >
              +{vs.toFixed(2)}%
            </div>
          </div>
          <div
            style={{
              height: 40,
              padding: "0 18px",
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              background: "linear-gradient(120deg, #0E8F8F 0%, #1680B8 100%)"
            }}
          >
            Invested paper ${dollars}
          </div>
        </div>
      </div>
      </div>
    </AbsoluteFill>
  );
}

function Blob({ left, right, top, bottom, color }: { left?: number; right?: number; top?: number; bottom?: number; color: string }) {
  return (
    <div
      style={{
        position: "absolute",
        width: 400,
        height: 400,
        left,
        right,
        top,
        bottom,
        borderRadius: 999,
        background: `radial-gradient(circle, ${color}, transparent 68%)`
      }}
    />
  );
}

export function HowItWorksStill() {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: `${HOW_WIDTH} / ${HOW_HEIGHT}`,
        background: STAGE_BG,
        fontFamily: SAANS,
        color: C.ink,
        padding: "24px 28px",
        position: "relative"
      }}
    >
      <p style={{ fontSize: 12, color: C.teal, fontFamily: GEIST, fontWeight: 500 }}>Invest</p>
      <p style={{ marginTop: 8, fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>{SENTENCE}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        {NAMES.map((n) => (
          <span
            key={n.symbol}
            style={{
              border: "1px solid rgb(14 143 143 / 0.14)",
              borderRadius: 12,
              padding: "6px 10px",
              fontSize: 13,
              fontWeight: 600
            }}
          >
            {n.symbol}
          </span>
        ))}
      </div>
      <p style={{ marginTop: 24, fontSize: 32, fontWeight: 600, color: C.gain, fontFamily: GEIST }}>+0.44%</p>
    </div>
  );
}
