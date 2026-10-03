"use client";

import type { ReactNode } from "react";

export function HashLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      className={className}
      href={href}
      onClick={(e) => {
        const id = href.split("#")[1];
        if (!id) return;
        const el = document.getElementById(id);
        if (!el) return;
        e.preventDefault();
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        history.replaceState(null, "", `#${id}`);
      }}
    >
      {children}
    </a>
  );
}
