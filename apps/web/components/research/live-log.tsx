"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { StreamItem } from "@/components/social/research-stream";

type Line = { id: string; kicker: string; title: string; detail?: string };

const AMBIENT: Record<string, string[]> = {
  queued: [
    "Opening a research desk for this view.",
    "Connecting the catalog, quotes, and models.",
    "Holding the sentence still before naming any company."
  ],
  interpret: [
    "Reading the belief, not hunting tickers yet.",
    "Asking who earns more if this view is right.",
    "Writing the mechanism, horizon, and what would prove it wrong."
  ],
  retrieve: [
    "Walking the Robinhood Chain catalog name by name.",
    "Setting aside companies that do not touch this story.",
    "Keeping a shortlist of names that actually fit."
  ],
  discover: [
    "Searching beyond the first catalog hit.",
    "Looking for suppliers and second-order names.",
    "Matching web names back to holdable stock tokens."
  ],
  diligence: [
    "Opening notes on each shortlisted name.",
    "Asking how clean the exposure is, not just the headline.",
    "Dropping names that rhyme but do not pay."
  ],
  analyst: [
    "Scoring how directly each name tracks the view.",
    "Separating core holdings from shared-interest names.",
    "Marking conviction so sizing is not guesswork."
  ],
  portfolio: [
    "Building a 5 to 12 name book, not a single bet.",
    "Capping any one name so the basket can survive a miss.",
    "Writing why each weight is here."
  ],
  critic: [
    "A second model is reading the book for overlap.",
    "Checking whether the basket still says the same thing twice.",
    "Pushing weak names out before publish."
  ],
  revise: [
    "Rebuilding weights after the risk pass.",
    "Keeping only the names that still earn a seat."
  ],
  draft: ["Locking the basket and preparing the public view."],
  done: ["Research is complete."]
};

function countIn(message: string) {
  const m = message.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function narrate(item: StreamItem): Omit<Line, "id"> {
  const n = countIn(item.message);
  const msg = item.message;
  const stage = item.stage.toLowerCase();

  if (stage === "queued") {
    return { kicker: "Desk", title: "Queued for research", detail: "The agent is picking up your view." };
  }
  if (stage === "interpret") {
    if (/reus/i.test(msg)) return { kicker: "Thesis", title: "Reusing the last thesis", detail: msg };
    if (/not a readable/i.test(msg)) return { kicker: "Thesis", title: "This view is not readable", detail: msg };
    if (/ready/i.test(msg)) return { kicker: "Thesis", title: "Thesis is ready", detail: "Mechanism, horizon, and falsifiers are locked." };
    return { kicker: "Thesis", title: "Reading your view", detail: "Finding the economic story underneath the sentence." };
  }
  if (stage === "retrieve") {
    if (/reading \d+/i.test(msg)) {
      return {
        kicker: "Catalog",
        title: `Reading ${n ?? "the"} Robinhood Chain names`,
        detail: "Screening listed stock tokens for a real link to this view."
      };
    }
    if (/screened/i.test(msg)) {
      return { kicker: "Catalog", title: msg.replace(" · ", ". "), detail: "Batches of the universe, scored for relevance." };
    }
    if (/look relevant/i.test(msg)) {
      return {
        kicker: "Shortlist",
        title: n != null ? `${n} companies look relevant` : msg,
        detail: "These names survived the first screen."
      };
    }
    return { kicker: "Catalog", title: msg, detail: "Still walking the listed universe." };
  }
  if (stage === "discover") {
    if (/web search for extra/i.test(msg)) {
      return { kicker: "Web", title: "Searching for extra names", detail: "Looking past the first catalog hits." };
    }
    if (/matched \d+/i.test(msg)) {
      return {
        kicker: "Web",
        title: n != null ? `Matched ${n} extra names` : msg,
        detail: "New companies mapped back to holdable stock tokens."
      };
    }
    return { kicker: "Web", title: msg, detail: "Discovery pass on the open web." };
  }
  if (stage === "diligence") {
    if (/web research on \d+/i.test(msg)) {
      return {
        kicker: "Diligence",
        title: n != null ? `Researching a basket of ${n} names` : msg,
        detail: "Reading why each name belongs, or should be cut."
      };
    }
    if (/researched basket/i.test(msg)) {
      return {
        kicker: "Diligence",
        title: n != null ? `Finished notes on ${n} names` : msg,
        detail: "Working set is researched and ready to score."
      };
    }
    if (/reused stored/i.test(msg)) return { kicker: "Diligence", title: msg, detail: "Using research already on file." };
    return { kicker: "Diligence", title: msg };
  }
  if (stage === "analyst") {
    if (/scored \d+/i.test(msg)) {
      return {
        kicker: "Scores",
        title: n != null ? `Scored ${n} names` : msg,
        detail: "Directness, purity, confidence, and risk are in."
      };
    }
    return { kicker: "Scores", title: msg, detail: "Ranking how tightly each name tracks the view." };
  }
  if (stage === "portfolio" || stage === "revise") {
    return { kicker: "Book", title: msg || "Sizing the basket", detail: "Weights, roles, and cash for a 5 to 12 name book." };
  }
  if (stage === "critic") {
    if (/revis/i.test(msg)) return { kicker: "Risk", title: "Revising the basket", detail: "The critic asked for a cleaner book." };
    return { kicker: "Risk", title: msg || "Risk officer is reading the book" };
  }
  if (stage === "draft" || stage === "done") {
    return { kicker: "Ready", title: "Basket ready", detail: msg };
  }
  if (stage === "failed" || stage === "refuse") {
    return { kicker: "Stopped", title: msg };
  }
  return { kicker: item.stage, title: msg };
}

export function ResearchLiveLog({ events }: { events: StreamItem[] }) {
  const reduce = useReducedMotion();
  const [pulse, setPulse] = useState(0);
  const last = events[events.length - 1];
  const stage = (last?.stage ?? "queued").toLowerCase();

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setPulse((n) => n + 1), 2200);
    return () => window.clearInterval(id);
  }, [reduce, stage, last?.message]);

  const real = events.map((item, i) => {
    const n = narrate(item);
    return { id: `${item.stage}-${i}-${item.message}`, ...n };
  });
  const ambientPool = AMBIENT[stage] ?? AMBIENT.queued!;
  const ambient = ambientPool[pulse % ambientPool.length]!;
  const current = real[real.length - 1] ?? {
    id: "wait",
    kicker: "Desk",
    title: "Starting research",
    detail: "Waiting for the first note from the agent."
  };
  const history = real.slice(-7, -1).reverse();

  return (
    <div className="w-full max-w-[560px]">
      <p className="text-[12px] uppercase tracking-[0.16em] text-aqua">{current.kicker}</p>
      <h1 key={current.id} className="research-enter display mt-3 text-[32px] leading-[1.05] text-white md:text-[46px]">
        {current.title}
      </h1>
      {current.detail ? <p className="mt-4 max-w-[34rem] text-[17px] leading-relaxed text-white/72">{current.detail}</p> : null}
      <p className="mt-5 text-[15px] leading-relaxed text-white/55" aria-live="polite">
        {ambient}
      </p>
      {history.length ? (
        <ol className="mt-10 space-y-3" aria-label="Earlier research notes">
          {history.map((line, i) => (
            <li
              key={line.id}
              className="border-l border-white/18 pl-4 text-[14px] leading-snug text-white/48"
              style={{ opacity: 1 - i * 0.12 }}
            >
              <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.12em] text-aqua/70">{line.kicker}</span>
              {line.title}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
