import {
  CircleAlert,
  CircleCheck,
  Inbox,
  Info,
  LockKeyhole,
  Loader,
} from "lucide-react";
import type { ReactNode } from "react";

type QueryStateKind =
  "loading" | "empty" | "error" | "unavailable" | "restricted";
const states = {
  loading: {
    icon: Loader,
    color: "text-info",
    surface: "border-s-2 border-info! bg-surface-muted",
  },
  empty: {
    icon: Inbox,
    color: "text-text-muted",
    surface: "border-s-2 border-border-subtle!",
  },
  error: {
    icon: CircleAlert,
    color: "text-danger",
    surface: "rounded-region border border-danger! bg-danger-surface",
  },
  unavailable: {
    icon: Info,
    color: "text-warning",
    surface: "border-s-2 border-warning! bg-warning-surface",
  },
  restricted: {
    icon: LockKeyhole,
    color: "text-warning",
    surface: "border-s-2 border-warning! bg-warning-surface",
  },
};

/** Callers select a state from actual query evidence and supply localized copy. */
export function QueryState({
  kind,
  title,
  description,
  action,
  className = "",
}: {
  kind: QueryStateKind;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { icon: Icon, color, surface } = states[kind];
  return (
    <div
      role={
        kind === "error" ? "alert" : kind === "loading" ? "status" : undefined
      }
      aria-busy={kind === "loading" ? true : undefined}
      className={`min-w-0 p-5 text-text-primary ${surface} ${className}`}
    >
      <div className="flex items-start gap-3">
        <Icon
          size={22}
          aria-hidden="true"
          className={`mt-0.5 shrink-0 ${color}`}
        />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-bold leading-6">{title}</p>
          {description ? (
            <div className="mt-1 text-sm leading-6 text-text-secondary">
              {description}
            </div>
          ) : null}
          {action ? (
            <div className="mt-4 flex flex-wrap gap-2">{action}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Local mutation feedback only; pending belongs to the initiating Action. */
export function MutationOutcome({
  kind,
  children,
}: {
  kind: "success" | "error";
  children: ReactNode;
}) {
  const Icon = kind === "success" ? CircleCheck : CircleAlert;
  return (
    <p
      role={kind === "success" ? "status" : "alert"}
      className={`flex items-start gap-2 text-sm font-semibold leading-6 ${kind === "success" ? "text-success" : "text-danger"}`}
    >
      <Icon size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
      {children}
    </p>
  );
}
