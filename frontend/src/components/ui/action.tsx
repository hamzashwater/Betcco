import type { ButtonHTMLAttributes } from "react";

export type ActionVariant = "primary" | "secondary" | "quiet" | "danger";

const variants = {
  primary:
    "border-action-primary-surface! bg-action-primary-surface text-action-primary-foreground not-disabled:hover:border-action-primary-surface-hover! not-disabled:hover:bg-action-primary-surface-hover not-disabled:active:border-action-primary-surface-pressed! not-disabled:active:bg-action-primary-surface-pressed",
  secondary:
    "border-border-interactive! bg-action-secondary text-action-secondary-text not-disabled:hover:bg-action-secondary-hover not-disabled:active:bg-action-secondary-pressed",
  quiet:
    "border-transparent! bg-action-quiet text-action-quiet-text not-disabled:hover:bg-action-quiet-hover not-disabled:active:bg-action-quiet-pressed",
  danger:
    "border-action-danger! bg-action-danger text-action-danger-text not-disabled:hover:border-action-danger-hover! not-disabled:hover:bg-action-danger-hover not-disabled:active:border-action-danger-pressed! not-disabled:active:bg-action-danger-pressed",
};

/** Also usable on navigation links, without replacing their native semantics. */
export function actionClassName(
  variant: ActionVariant = "primary",
  className = "",
  pending = false,
) {
  return `focus-ring inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 ui-type-label whitespace-normal break-words [overflow-wrap:anywhere] transition-[background-color,border-color,color] duration-120 motion-reduce:transition-none focus-visible:outline-offset-2! disabled:cursor-not-allowed disabled:opacity-100 ${pending ? "" : "disabled:border-border-interactive! disabled:bg-action-disabled disabled:text-action-disabled-text"} ${variants[variant]} ${className}`;
}

type ActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ActionVariant;
} & (
    | { pending: true; pendingLabel: string }
    | { pending?: false; pendingLabel?: string }
    | { pending: boolean; pendingLabel: string }
  );

export function Action({
  variant = "primary",
  pending = false,
  pendingLabel,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ActionProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || props["aria-busy"]}
      className={actionClassName(variant, className, pending)}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
