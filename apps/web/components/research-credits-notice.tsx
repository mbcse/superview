export function ResearchCreditsNotice({ size = "banner" }: { size?: "hero" | "banner" }) {
  const hero = size === "hero";
  return (
    <aside
      role="status"
      className={
        hero
          ? "rounded-[32px] border border-warn/25 bg-[#fff6e8] px-5 py-8 md:px-10 md:py-12"
          : "rounded-[28px] border border-warn/25 bg-[#fff6e8] px-5 py-6 md:px-7 md:py-7"
      }
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-warn">Research paused</p>
      <p
        className={
          hero
            ? "display mt-3 text-[clamp(32px,5.4vw,52px)] leading-[1.08] text-ink"
            : "display mt-2 text-[clamp(24px,3.8vw,36px)] leading-[1.12] text-ink"
        }
      >
        Due to high demand, we ran out of credits for testing the platform.
      </p>
      <p className={`max-w-[40rem] leading-relaxed text-muted ${hero ? "mt-4 text-[17px] md:text-[19px]" : "mt-3 text-[15px] md:text-[16px]"}`}>
        Research will not work. We are working to get it back as soon as possible.
      </p>
    </aside>
  );
}
