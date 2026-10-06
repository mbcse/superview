import { MarketingChrome } from "@/components/marketing/chrome";

export default function LegalPage() {
  return (
    <>
    <MarketingChrome />
    <main className="mx-auto w-[min(720px,calc(100%-24px))] py-16">
      <h1 className="display text-[28px] md:text-[32px]">Legal</h1>
      <p className="mt-5 text-[17px] leading-[1.6] text-muted">
        Stock tokens are economic exposure, not share ownership. They trade on more than one blockchain. Memecoins are a
        separate desk and can go to zero. SuperView is not investment advice. Access is restricted in several
        jurisdictions including the United States, United Kingdom, Canada, Switzerland, and the UAE.
      </p>
      <p className="mt-4 text-[17px] leading-[1.6] text-muted">
        Paper USDG is a simulated ledger filled against live quotes. Live trading spends USDG from your wallet when
        enabled.
      </p>
    </main>
    </>
  );
}
