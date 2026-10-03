import { Easing, interpolate, spring } from "remotion";

export const C = {
  ink: "#0A1A21",
  muted: "#587079",
  teal: "#0E8F8F",
  aqua: "#2EC4B6",
  sky: "#38B6F0",
  skyDeep: "#1680B8",
  mist: "#E8F5F6",
  canvas: "#F7FAFB",
  gain: "#16A34A",
  white: "rgb(255 255 255 / 0.78)"
} as const;

export const SAANS = "var(--font-saans), saans, system-ui, sans-serif";
export const GEIST = "var(--font-geist-sans), Geist, system-ui, sans-serif";
export const GLIDE = Easing.bezier(0.23, 1, 0.32, 1);

export const STAGE_BG =
  "linear-gradient(165deg, rgb(255 255 255 / 0.94) 0%, rgb(255 255 255 / 0.74) 52%, rgb(232 245 246 / 0.7) 100%)";

export function clamp(frame: number, from: number, to: number, outFrom: number, outTo: number) {
  return interpolate(frame, [from, to], [outFrom, outTo], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: GLIDE
  });
}

export function enter(frame: number, at: number, fps: number) {
  return spring({ frame: frame - at, fps, config: { damping: 16, stiffness: 160, mass: 0.7 } });
}

export function polyline(values: number[], width: number, height: number, pad = 2) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - pad * 2) - pad;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function area(values: number[], width: number, height: number, pad = 2) {
  const line = polyline(values, width, height, pad);
  return `${line} L${width} ${height} L0 ${height} Z`;
}
