"use client";

import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const VIEW_FPS = 30;
export const VIEW_DURATION = 450;
export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 500;

const SENTENCE = "Robots will be big.";
const HOLDINGS = [
  { symbol: "NVDA", role: "Direct", weight: "22%", tint: "#E8F5F6" },
  { symbol: "TSLA", role: "Direct", weight: "18%", tint: "#E8F8FC" },
  { symbol: "ISRG", role: "Shared", weight: "16%", tint: "#F3F7F4" },
  { symbol: "DE", role: "Indirect", weight: "14%", tint: "#EEF6F7" },
  { symbol: "HON", role: "Indirect", weight: "12%", tint: "#E8F5F6" },
  { symbol: "ROK", role: "Shared", weight: "18%", tint: "#E8F8FC" }
] as const;

const SPARK = [0.04, 0.08, 0.05, 0.12, 0.16, 0.11, 0.22, 0.28, 0.24, 0.33, 0.38, 0.34, 0.41, 0.44];

const GLIDE = Easing.bezier(0.23, 1, 0.32, 1);

function clamp(frame: number, from: number, to: number, outFrom: number, outTo: number) {
  return interpolate(frame, [from, to], [outFrom, outTo], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: GLIDE
  });
}

function enter(frame: number, at: number, fps: number) {
  return spring({ frame: frame - at, fps, config: { damping: 16, stiffness: 160, mass: 0.7 } });
}

export function ViewJourney() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const typedCount = Math.round(clamp(frame, 18, 108, 0, SENTENCE.length));
  const typed = SENTENCE.slice(0, typedCount);
  const caretOn = frame < 118 && Math.floor(frame / 8) % 2 === 0;
  const press = interpolate(frame, [112, 120, 128], [1, 0.94, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const research = clamp(frame, 128, 155, 0, 1);
  const vs = clamp(frame, 278, 338, 0, 0.44);
  const sparkDraw = clamp(frame, 278, 350, 0, 1);
  const investFill = clamp(frame, 348, 392, 0, 1);
  const invested = frame >= 392;
  const dollars = Math.round(clamp(frame, 348, 392, 0, 100));

  const sparkPath = sparkPolyline(SPARK, 168, 44);
  const sparkLen = 420;

  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(165deg, rgb(255 255 255 / 0.94) 0%, rgb(255 255 255 / 0.74) 52%, rgb(232 245 246 / 0.7) 100%)",
        fontFamily: "var(--font-saans), saans, system-ui, sans-serif",
        color: "#0A1A21"
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 420,
          height: 420,
          left: -80,
          top: -120,
          borderRadius: 999,
          background: "radial-gradient(circle, rgb(46 196 182 / 0.22), transparent 68%)"
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 380,
          height: 380,
          right: -60,
          bottom: -100,
          borderRadius: 999,
          background: "radial-gradient(circle, rgb(56 182 240 / 0.18), transparent 70%)"
        }}
      />

      <div style={{ position: "relative", height: "100%", padding: "8px 0 0" }}>
        <Stages frame={frame} />

        <div style={{ padding: "8px 28px 0" }}>
          <div
            style={{
              minHeight: 52,
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.028em",
              lineHeight: 1.25
            }}
          >
            {typed}
            <span
              style={{
                display: "inline-block",
                width: 2,
                height: 26,
                marginLeft: 2,
                background: caretOn ? "#0E8F8F" : "transparent",
                verticalAlign: "-3px"
              }}
            />
          </div>
        </div>

        <div style={{ padding: "4px 28px 0", display: "flex", alignItems: "center", gap: 10, minHeight: 28 }}>
          <span
            style={{
              opacity: research,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "#587079"
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 99,
                background: "#2EC4B6",
                boxShadow: "0 0 0 4px rgb(46 196 182 / 0.18)",
                transform: `scale(${0.85 + 0.15 * Math.sin(frame / 6)})`
              }}
            />
            {frame < 175 ? "Reading the view…" : "Agent watching · extracting stocks"}
          </span>
        </div>

        <div style={{ padding: "12px 22px 0", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {HOLDINGS.map((h, i) => {
            const p = enter(frame, 168 + i * 14, fps);
            return (
              <div
                key={h.symbol}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px 6px 6px",
                  borderRadius: 10,
                  border: "1px solid rgb(14 143 143 / 0.14)",
                  background: "rgb(255 255 255 / 0.72)",
                  opacity: p,
                  transform: `translateY(${(1 - p) * 14}px)`
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    background: h.tint,
                    color: "#0E8F8F",
                    fontSize: 9,
                    fontWeight: 700,
                    display: "grid",
                    placeItems: "center"
                  }}
                >
                  {h.symbol.slice(0, 2)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.02em" }}>{h.symbol}</span>
                <span style={{ fontSize: 11, color: "#587079" }}>{h.role}</span>
                <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{h.weight}</span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            margin: "18px 22px 0",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            opacity: clamp(frame, 268, 292, 0, 1),
            transform: `translateY(${clamp(frame, 268, 292, 12, 0)}px)`
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "#587079", fontWeight: 500 }}>vs S&P 500</div>
            <div
              style={{
                marginTop: 4,
                fontSize: 36,
                fontWeight: 600,
                letterSpacing: "-0.03em",
                fontVariantNumeric: "tabular-nums",
                color: "#16A34A"
              }}
            >
              +{vs.toFixed(2)}%
            </div>
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#587079" }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: "#2EC4B6" }} />
              Live
            </div>
          </div>
          <svg width="168" height="44" viewBox="0 0 168 44" aria-hidden>
            <path
              d={sparkPath}
              fill="none"
              stroke="#16A34A"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={sparkLen}
              strokeDashoffset={sparkLen * (1 - sparkDraw)}
            />
          </svg>
        </div>

        <div
          style={{
            margin: "22px 22px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12
          }}
        >
          <div
            style={{
              transform: `scale(${press})`,
              opacity: frame < 175 ? 1 : clamp(frame, 175, 195, 1, 0)
            }}
          >
            <Pill filled={frame >= 112 && frame < 175}>Put this view</Pill>
          </div>
          <div
            style={{
              opacity: clamp(frame, 340, 360, 0, 1),
              transform: `translateY(${clamp(frame, 340, 360, 10, 0)}px)`
            }}
          >
            <div
              style={{
                position: "relative",
                overflow: "hidden",
                borderRadius: 999,
                minWidth: 176,
                height: 40,
                border: "1px solid rgb(14 143 143 / 0.2)"
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${investFill * 100}%`,
                  background: "linear-gradient(120deg, #0E8F8F 0%, #1680B8 100%)"
                }}
              />
              <div
                style={{
                  position: "relative",
                  height: "100%",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 13,
                  fontWeight: 600,
                  color: investFill > 0.45 ? "#fff" : "#0E8F8F"
                }}
              >
                {invested ? "Invested · Paper $100" : `Invest · Paper $${dollars}`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Stages({ frame }: { frame: number }) {
  const steps = ["Write", "Research", "Basket", "Invest"] as const;
  const active = frame < 128 ? 0 : frame < 268 ? 1 : frame < 348 ? 2 : 3;
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        padding: "16px 28px 8px",
        fontSize: 12,
        fontWeight: 500
      }}
    >
      {steps.map((label, i) => (
        <span key={label} style={{ color: i === active ? "#0E8F8F" : "#587079", opacity: i === active ? 1 : 0.55 }}>
          {label}
        </span>
      ))}
    </div>
  );
}

function Pill({ children, filled }: { children: string; filled?: boolean }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 40,
        padding: "0 18px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        color: filled ? "#fff" : "#0E8F8F",
        background: filled ? "linear-gradient(120deg, #0E8F8F 0%, #1680B8 100%)" : "rgb(255 255 255 / 0.7)",
        border: filled ? "none" : "1px solid rgb(14 143 143 / 0.18)",
        boxShadow: filled ? "0 10px 24px -12px rgba(14, 116, 144, 0.6)" : undefined
      }}
    >
      {children}
    </div>
  );
}

function sparkPolyline(values: number[], width: number, height: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function ViewJourneyStill() {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: `${VIEW_WIDTH} / ${VIEW_HEIGHT}`,
        background:
          "linear-gradient(165deg, rgb(255 255 255 / 0.94) 0%, rgb(255 255 255 / 0.74) 52%, rgb(232 245 246 / 0.7) 100%)",
        position: "relative",
        overflow: "hidden",
        fontFamily: "var(--font-saans), saans, system-ui, sans-serif",
        padding: "24px 28px"
      }}
    >
      <p style={{ fontSize: 12, color: "#0E8F8F", fontWeight: 500 }}>Invest</p>
      <p style={{ marginTop: 8, fontSize: 28, fontWeight: 600, letterSpacing: "-0.028em" }}>{SENTENCE}</p>
      <p style={{ marginTop: 8, fontSize: 12, color: "#587079" }}>Agent watching · extracting stocks</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        {HOLDINGS.map((h) => (
          <span
            key={h.symbol}
            style={{
              border: "1px solid rgb(14 143 143 / 0.14)",
              borderRadius: 10,
              padding: "6px 10px",
              fontSize: 13,
              fontWeight: 600
            }}
          >
            {h.symbol} {h.weight}
          </span>
        ))}
      </div>
      <p style={{ marginTop: 20, fontSize: 36, fontWeight: 600, color: "#16A34A", fontVariantNumeric: "tabular-nums" }}>+0.44%</p>
      <p style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: "#0E8F8F" }}>Invested · Paper $100</p>
    </div>
  );
}
