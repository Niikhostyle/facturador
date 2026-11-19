"use client";

/** Marca con latido pf-latido, como el logo de Pulsando. */
export function BrandMark({ subtitle = "GDT DevSur" }: { subtitle?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden className="shrink-0">
        <rect width="36" height="36" rx="10" fill="var(--fiscal)" />
        <circle cx="18" cy="18" r="7.5" className="pf-latido" fill="var(--pulso)" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
        <rect x="12" y="12" width="12" height="12" rx="2" fill="var(--fiscal-on)" opacity="0.92" />
        <path d="M15 18h6M18 15v6" stroke="var(--fiscal)" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="font-display text-[17px] font-bold tracking-[-0.02em] text-fiscal">Facturador</span>
        <span className="mt-[3px] font-sans text-[9.5px] font-medium uppercase tracking-[0.24em] text-[var(--ink-muted)]">
          {subtitle}
        </span>
      </span>
    </span>
  );
}
