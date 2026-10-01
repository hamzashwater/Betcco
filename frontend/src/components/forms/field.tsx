"use client";

import { cloneElement, useId, type ReactElement, type ReactNode } from "react";

type ControlProps = {
  id?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

/** Receives validation state; the native input/select/textarea owns its behavior. */
export function Field({
  label,
  help,
  error,
  optionalLabel,
  children,
}: {
  label: string;
  help?: ReactNode;
  error?: string;
  optionalLabel?: string;
  children: ReactElement<ControlProps>;
}) {
  const generatedId = useId();
  const id = children.props.id ?? generatedId;
  const describedBy = [
    children.props["aria-describedby"],
    help ? `${id}-help` : undefined,
    error ? `${id}-error` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="min-w-0 text-text-primary">
      <label htmlFor={id} className="block text-sm font-bold leading-6">
        {label}{" "}
        {optionalLabel && !children.props.required ? (
          <span className="ms-2 font-normal text-text-muted">
            {optionalLabel}
          </span>
        ) : null}
      </label>
      {cloneElement(children, {
        id,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : children.props["aria-invalid"],
        className: `focus-ring mt-2 min-h-11 w-full min-w-0 rounded-control border bg-surface-raised px-3 py-2 text-sm leading-6 text-text-primary transition-colors duration-150 motion-reduce:transition-none disabled:cursor-not-allowed disabled:bg-action-disabled disabled:text-action-disabled-text read-only:bg-surface-muted ${error ? "border-danger!" : "border-border-default!"} ${children.props.className ?? ""}`,
      })}
      {help ? (
        <p id={`${id}-help`} className="mt-2 text-sm leading-6 text-text-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          className="mt-2 text-sm font-semibold leading-6 text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
