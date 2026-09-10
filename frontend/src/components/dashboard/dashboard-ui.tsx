import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function DashboardHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_85%_15%,color-mix(in_srgb,var(--primary)_24%,transparent),transparent_38%),linear-gradient(125deg,color-mix(in_srgb,var(--surface)_92%,transparent),color-mix(in_srgb,var(--surface-solid)_72%,transparent))] p-6 shadow-[var(--shadow)] sm:p-8">
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
            {description}
          </p>
        </div>
        {actions && (
          <div className="relative z-10 flex flex-wrap gap-2">{actions}</div>
        )}
      </div>
      <span className="pointer-events-none absolute -bottom-16 -end-12 size-52 rounded-full border border-primary/20" />
      <span className="pointer-events-none absolute -bottom-24 -end-4 size-52 rounded-full border border-secondary/15" />
    </header>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: LucideIcon;
  tone?: "primary" | "secondary" | "accent" | "warm";
}) {
  const colors = {
    primary: "bg-primary/15 text-primary",
    secondary: "bg-secondary/15 text-secondary",
    accent: "bg-accent/15 text-accent",
    warm: "bg-warm/15 text-warm",
  };
  return (
    <article className="card group p-5" data-interactive>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-muted">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-foreground">
            {value}
          </p>
          {detail && (
            <p className="mt-2 text-xs leading-5 text-muted">{detail}</p>
          )}
        </div>
        <span
          className={`grid size-10 place-items-center rounded-xl ${colors[tone]}`}
        >
          <Icon size={20} aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}

export function ActionCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <article className="card group h-full p-5" data-interactive>
      <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary transition-transform duration-300 group-hover:scale-110">
        <Icon size={20} aria-hidden="true" />
      </span>
      <h2 className="mt-5 font-black text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      {children}
    </article>
  );
}

export function ProgressBar({
  value,
  label,
  className = "",
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted">
        <span>{label}</span>
        <span className="font-bold text-foreground">{bounded}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-accent transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${bounded}%` }}
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={bounded}
        />
      </div>
    </div>
  );
}
