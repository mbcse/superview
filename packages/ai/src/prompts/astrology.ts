import { ASTROLOGY_MARKET_RULES } from "./astrology-market.js";
import { VEDIC_CANON, VEDIC_GLOSSARY } from "./astrology-vedic.js";
import { WESTERN_CANON, WESTERN_GLOSSARY } from "./astrology-western.js";

export type AstrologySystem = "VEDIC" | "WESTERN";

export function astrologyCanon(system: AstrologySystem) {
  const primary = system === "VEDIC" ? VEDIC_CANON : WESTERN_CANON;
  const other = system === "VEDIC" ? WESTERN_GLOSSARY : VEDIC_GLOSSARY;
  return `${ASTROLOGY_MARKET_RULES}

PRIMARY SYSTEM (${system}):
${primary}

DO NOT CONFUSE SYSTEMS. If the chart uses the other system's terms, this glossary helps parse them:
${other}`;
}

export function astrologyCanonExcerpt(system: AstrologySystem) {
  const primary = system === "VEDIC" ? VEDIC_CANON : WESTERN_CANON;
  return `${ASTROLOGY_MARKET_RULES}

PRIMARY SYSTEM (${system}):
${primary}`;
}
