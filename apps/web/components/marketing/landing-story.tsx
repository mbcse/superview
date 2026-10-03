"use client";

import Link from "next/link";
import { MotionStage } from "@/components/marketing/motion-stage";
import { HowItWorksFilm, HowItWorksStill, HOW_DURATION, HOW_FPS, HOW_HEIGHT, HOW_WIDTH } from "@/remotion/how-it-works";
import { TokenMarket, TokenMarketStill, TOKEN_DURATION, TOKEN_FPS, TOKEN_HEIGHT, TOKEN_WIDTH } from "@/remotion/token-market";
import { VsSpyGraph, VsSpyStill, GRAPH_DURATION, GRAPH_FPS, GRAPH_HEIGHT, GRAPH_WIDTH } from "@/remotion/vs-spy";
import { InvestFlow, InvestFlowStill, INVEST_DURATION, INVEST_FPS, INVEST_HEIGHT, INVEST_WIDTH } from "@/remotion/invest-flow";

const STEPS = [
  { title: "Write", body: "A short belief about the world, in your own words." },
  { title: "Research", body: "SuperView maps the view to listed companies on Robinhood Chain." },
  { title: "Basket", body: "Weights, roles, and a live score versus the S&P 500." },
  { title: "Invest", body: "Paper first, against live quotes. Live USDG when you are ready." }
] as const;

export function LandingStory() {
  return (
    <>
      <section id="how" className="mx-auto w-[min(1080px,calc(100%-24px))] scroll-mt-24 py-20 md:py-24">
        <h2 className="display max-w-[18ch] text-[28px] text-ink md:text-[36px]">A view becomes a basket</h2>
        <p className="mt-4 max-w-[38rem] text-[16px] leading-relaxed text-muted">
          You write a sentence. An agent finds the companies, sizes the weights, and keeps watching as the story changes.
        </p>
        <div className="mt-8">
          <MotionStage
            component={HowItWorksFilm}
            still={<HowItWorksStill />}
            durationInFrames={HOW_DURATION}
            fps={HOW_FPS}
            width={HOW_WIDTH}
            height={HOW_HEIGHT}
            label="How a view becomes a researched basket and invests"
          />
        </div>
        <ol className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li key={step.title}>
              <p className="display text-[18px] text-ink">{step.title}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="tokens" className="mx-auto w-[min(1080px,calc(100%-24px))] scroll-mt-24 py-20 md:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div>
            <h2 className="display max-w-[14ch] text-[28px] text-ink md:text-[36px]">Stock tokens, not shares</h2>
            <p className="mt-4 max-w-[36rem] text-[16px] leading-relaxed text-muted">
              SuperView invests in Robinhood Chain stock tokens. They track listed companies and give economic exposure, not
              share ownership.
            </p>
            <p className="mt-4 max-w-[36rem] text-[16px] leading-relaxed text-muted">
              Quotes are live. Paper USDG is a simulated ledger filled against those quotes. Live trading spends USDG from
              your wallet.
            </p>
            <p className="mt-4 max-w-[36rem] text-[16px] leading-relaxed text-muted">
              Access is restricted in the United States, United Kingdom, Canada, Switzerland, the UAE, and other countries.{" "}
              <Link href="/legal" className="text-teal underline-offset-4 hover:underline">
                Legal
              </Link>
            </p>
          </div>
          <MotionStage
            component={TokenMarket}
            still={<TokenMarketStill />}
            durationInFrames={TOKEN_DURATION}
            fps={TOKEN_FPS}
            width={TOKEN_WIDTH}
            height={TOKEN_HEIGHT}
            label="Stock tokens assembling into a view basket"
          />
        </div>
      </section>

      <section id="score" className="mx-auto w-[min(1080px,calc(100%-24px))] scroll-mt-24 py-20 md:py-24">
        <h2 className="display text-[28px] text-ink md:text-[36px]">Scored against the S&P 500</h2>
        <p className="mt-4 max-w-[38rem] text-[16px] leading-relaxed text-muted">
          Every published view carries a live vs S&P mark. Follow the people whose views beat the market, or copy a view
          into your own pocket.
        </p>
        <div className="mt-8">
          <MotionStage
            component={VsSpyGraph}
            still={<VsSpyStill />}
            durationInFrames={GRAPH_DURATION}
            fps={GRAPH_FPS}
            width={GRAPH_WIDTH}
            height={GRAPH_HEIGHT}
            label="Illustrative chart of a view basket versus the S&P 500"
          />
        </div>
      </section>

      <section id="invest" className="mx-auto w-[min(1080px,calc(100%-24px))] scroll-mt-24 py-20 md:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <MotionStage
            component={InvestFlow}
            still={<InvestFlowStill />}
            durationInFrames={INVEST_DURATION}
            fps={INVEST_FPS}
            width={INVEST_WIDTH}
            height={INVEST_HEIGHT}
            label="Paper money filling a view basket from live quotes"
          />
          <div>
            <h2 className="display max-w-[16ch] text-[28px] text-ink md:text-[36px]">Invest in what you believe</h2>
            <p className="mt-4 max-w-[36rem] text-[16px] leading-relaxed text-muted">
              Put money behind a view: yours, or one you copy from the feed. Start on paper. Go live when it earns it.
            </p>
            <div className="mt-8 grid gap-8">
              <div className="border-t border-teal/15 pt-5">
                <p className="display text-[20px] text-ink">Paper</p>
                <p className="mt-2 max-w-[36ch] text-[15px] leading-relaxed text-muted">
                  Live markets, simulated USDG. See how a view would have done without spending real money.
                </p>
              </div>
              <div className="border-t border-teal/15 pt-5">
                <p className="display text-[20px] text-ink">Live</p>
                <p className="mt-2 max-w-[36ch] text-[15px] leading-relaxed text-muted">
                  Spend USDG from your Privy wallet. The same basket, the same agent, real fills.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
