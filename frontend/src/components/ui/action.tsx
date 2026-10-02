import type { ButtonHTMLAttributes } from "react";

export type ActionVariant = "primary" | "secondary" | "quiet" | "danger";

const variants = {
  primary: "border-action-primary! bg-action-primary text-action-primary-text",
  secondary:
    "border-border-default! bg-action-secondary text-action-secondary-text",
  quiet: "border-transparent! bg-transparent text-text-link",
  danger: "border-action-danger! bg-action-danger text-action-danger-text",
};

/** Also usable on navigation links, without replacing their native semantics. */
export function actionClassName(
  variant: ActionVariant = "primary",
  className = "",
  pending = false,
) {
  return `focus-ring inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-control border px-4 py-2 text-sm font-bold leading-6 whitespace-normal break-words transition-colors duration-150 motion-reduce:transition-none enabled:hover:brightness-110 focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:opacity-100 ${pending ? "" : "disabled:border-border-default! disabled:bg-action-disabled disabled:text-action-disabled-text"} ${variants[variant]} ${className}`;
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
