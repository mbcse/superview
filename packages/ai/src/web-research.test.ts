import { describe, expect, it } from "vitest";
import { parseDiligenceNotes, parseDiscoverHits } from "./web-research.js";

describe("parseDiligenceNotes", () => {
  it("splits JSON keyed by symbol", () => {
    const notes = parseDiligenceNotes(
      JSON.stringify({
        PFE: "Vaccines and oncology. https://pfizer.com",
        UNH: "Payor exposure via utilization."
      }),
      ["PFE", "UNH", "JNJ"]
    );
    expect(notes.PFE).toContain("Vaccines");
    expect(notes.UNH).toContain("Payor");
    expect(notes.JNJ).toBeUndefined();
  });

  it("maps unprefixed JSON keys onto RH-prefixed catalog symbols", () => {
    const notes = parseDiligenceNotes(`{"NVDA": "Data center GPUs."}`, ["RHNVDA"]);
    expect(notes.RHNVDA).toContain("GPUs");
  });

  it("splits markdown headings", () => {
    const notes = parseDiligenceNotes(
      `## PFE\nDrug sales rise.\n## UNH\nMore insured lives.\n`,
      ["PFE", "UNH"]
    );
    expect(notes.PFE).toContain("Drug sales");
    expect(notes.UNH).toContain("insured");
  });
});

describe("parseDiscoverHits", () => {
  it("reads a JSON array of companies", () => {
    const hits = parseDiscoverHits(
      `Here you go\n[{"name":"NVIDIA","description":"GPUs"},{"name":"Rockwell Automation"}]\n`,
      8
    );
    expect(hits.map((h) => h.name)).toEqual(["NVIDIA", "Rockwell Automation"]);
    expect(hits[0]?.description).toContain("GPU");
  });
});
