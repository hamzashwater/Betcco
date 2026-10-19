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
    color: "text-state-info-foreground",
    surface: "border-s-2 border-state-info-border! bg-info-surface",
  },
  empty: {
    icon: Inbox,
    color: "text-state-neutral-foreground",
    surface: "border-s-2 border-state-neutral-border! bg-state-neutral-surface",
  },
  error: {
    icon: CircleAlert,
    color: "text-state-danger-foreground",
    surface: "border-s-2 border-state-danger-border! bg-danger-surface",
  },
  unavailable: {
    icon: Info,
    color: "text-state-warning-foreground",
    surface: "border-s-2 border-state-warning-border! bg-warning-surface",
  },
  restricted: {
    icon: LockKeyhole,
    color: "text-state-warning-foreground",
    surface: "border-s-2 border-state-warning-border! bg-warning-surface",
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
      className={`min-w-0 rounded-xl p-4 text-text-primary [overflow-wrap:anywhere] ${surface} ${className}`}
    >
      <div className="flex items-start gap-3">
        <Icon
          size={20}
          strokeWidth={2}
          aria-hidden="true"
          className={`mt-0.5 shrink-0 ${color}`}
        />
        <div className="min-w-0 flex-1">
          <p className="ui-type-label break-words">{title}</p>
          {description ? (
            <div className="ui-type-body mt-1 text-text-secondary">
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
      className={`ui-type-label flex min-w-0 items-start gap-2 rounded-lg border-s-2 p-3 [overflow-wrap:anywhere] ${kind === "success" ? "border-state-success-border! bg-success-surface text-state-success-foreground" : "border-state-danger-border! bg-danger-surface text-state-danger-foreground"}`}
    >
      <Icon
        size={20}
        strokeWidth={2}
        aria-hidden="true"
        className="mt-0.5 shrink-0"
      />
      {children}
    </p>
  );
}
