"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

export function MotivationCard({
  variant,
  className = "",
}: {
  variant: "dashboard" | "player";
  className?: string;
}) {
  const t = useTranslations("motivation");
  return (
    <aside
      className={`relative overflow-hidden rounded-2xl border border-primary/25 bg-[linear-gradient(125deg,color-mix(in_srgb,var(--primary)_16%,transparent),color-mix(in_srgb,var(--secondary)_15%,transparent))] p-5 shadow-[var(--shadow)] ${className}`}
      aria-label={t(`${variant}.label`)}
    >
      <span className="pointer-events-none absolute -end-9 -top-9 size-28 rounded-full border border-primary/30" />
      <div className="relative flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-slate-950">
          <Sparkles size={20} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
            {t(`${variant}.label`)}
          </p>
          <h2 className="mt-1 font-black text-foreground">
            {t(`${variant}.title`)}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {t(`${variant}.description`)}
          </p>
        </div>
      </div>
    </aside>
  );
}
