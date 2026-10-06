"use client";

import Link from "next/link";
import { MotionStage } from "@/components/marketing/motion-stage";
import { HowItWorksFilm, HowItWorksStill, HOW_DURATION, HOW_FPS, HOW_HEIGHT, HOW_WIDTH } from "@/remotion/how-it-works";
import { TokenMarket, TokenMarketStill, TOKEN_DURATION, TOKEN_FPS, TOKEN_HEIGHT, TOKEN_WIDTH } from "@/remotion/token-market";
import { MemeDesk, MemeDeskStill, MEME_DURATION, MEME_FPS, MEME_HEIGHT, MEME_WIDTH } from "@/remotion/meme-desk";
import { AstrologyView, AstrologyViewStill, ASTRO_DURATION, ASTRO_FPS, ASTRO_HEIGHT, ASTRO_WIDTH } from "@/remotion/astrology-view";
import { VsSpyGraph, VsSpyStill, GRAPH_DURATION, GRAPH_FPS, GRAPH_HEIGHT, GRAPH_WIDTH } from "@/remotion/vs-spy";
import { InvestFlow, InvestFlowStill, INVEST_DURATION, INVEST_FPS, INVEST_HEIGHT, INVEST_WIDTH } from "@/remotion/invest-flow";

const STEPS = [
  { title: "Write", body: "A short belief about the world — or an astrology chart — in your own words." },
  { title: "Research", body: "The agent maps it to stock tokens across chains, or to memecoins if that’s the desk." },
  { title: "Basket", body: "Weights, roles, and a live score versus the S&P 500 or SOL." },
  { title: "Invest", body: "Paper first, against live quotes. Live USDG when you are ready." }
] as const;

export function LandingStory() {
  return (
    <>
      <section id="how" className="mx-auto w-[min(1080px,calc(100%-24px))] scroll-mt-24 py-20 md:py-24">
        <h2 className="display max-w-[18ch] text-[28px] text-ink md:text-[36px]">A view becomes a basket</h2>
        <p className="mt-4 max-w-[38rem] text-[16px] leading-relaxed text-muted">
          You write a sentence. An agent finds what it touches, sizes the weights, and keeps watching as the story changes.
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
            <h2 className="display max-w-[16ch] text-[28px] text-ink md:text-[36px]">Stock tokens, on more than one chain</h2>
            <p className="mt-4 max-w-[36rem] text-[16px] leading-relaxed text-muted">
              SuperView invests in stock tokens across multiple blockchains. They track listed companies and give economic
              exposure, not share ownership.
            </p>
            <p className="mt-4 max-w-[36rem] text-[16px] leading-relaxed text-muted">
              Pick the chain when you write the view. Quotes are live. Paper USDG is a simulated ledger filled against those
              quotes. Live trading spends USDG from your wallet.
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

      <section id="memes" className="mx-auto w-[min(1080px,calc(100%-24px))] scroll-mt-24 py-20 md:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <MotionStage
            component={MemeDesk}
            still={<MemeDeskStill />}
            durationInFrames={MEME_DURATION}
            fps={MEME_FPS}
            width={MEME_WIDTH}
            height={MEME_HEIGHT}
            label="Memecoins on their own desk, marked versus SOL"
          />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-teal">Memecoins</p>
            <h2 className="display mt-3 max-w-[16ch] text-[28px] text-ink md:text-[36px]">Memecoins stay on their own book</h2>
            <p className="mt-4 max-w-[36rem] text-[16px] leading-relaxed text-muted">
              Switch to Memes and the agent screens launchpad coins instead of listed companies. Marks are versus SOL. Cash on
              this desk never mixes with stocks.
            </p>
            <p className="mt-4 max-w-[36rem] text-[16px] leading-relaxed text-muted">
              Memecoins are high risk. Coins can go to zero. Liquidity can vanish. This is not investment advice.
            </p>
          </div>
        </div>
      </section>

      <section id="astrology" className="mx-auto w-[min(1080px,calc(100%-24px))] scroll-mt-24 py-20 md:py-24">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-teal">Astrology</p>
        <h2 className="display mt-3 max-w-[20ch] text-[28px] text-ink md:text-[36px]">Astrology becomes a market view</h2>
        <p className="mt-4 max-w-[40rem] text-[16px] leading-relaxed text-muted">
          Write an astrology chart in Vedic or Western. SuperView reads the chart, writes a market prediction, then sizes a
          basket on the Stocks or Memes desk you picked.
        </p>
        <div className="mt-8">
          <MotionStage
            component={AstrologyView}
            still={<AstrologyViewStill />}
            durationInFrames={ASTRO_DURATION}
            fps={ASTRO_FPS}
            width={ASTRO_WIDTH}
            height={ASTRO_HEIGHT}
            label="An astrology chart becoming a market prediction and a basket"
          />
        </div>
      </section>

      <section id="score" className="mx-auto w-[min(1080px,calc(100%-24px))] scroll-mt-24 py-20 md:py-24">
        <h2 className="display text-[28px] text-ink md:text-[36px]">Scored against the market</h2>
        <p className="mt-4 max-w-[38rem] text-[16px] leading-relaxed text-muted">
          Stock views carry a live vs S&P mark. Meme views mark versus SOL. Follow the people whose views beat the
          benchmark, or copy a view into your own pocket.
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
