import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Action } from "@/components/ui/action";
import { Field } from "@/components/forms/field";
import { MutationOutcome, QueryState } from "@/components/ui/query-state";

afterEach(cleanup);

describe("shared actions", () => {
  it.each(["primary", "secondary", "quiet", "danger"] as const)(
    "keeps %s a native named button",
    (variant) => {
      render(<Action variant={variant}>Continue</Action>);
      expect(screen.getByRole("button", { name: "Continue" })).toHaveAttribute(
        "type",
        "button",
      );
    },
  );
  it("prevents disabled and pending actions, retaining progress copy", async () => {
    const onClick = vi.fn();
    render(
      <>
        <Action disabled onClick={onClick}>
          Disabled
        </Action>
        <Action
          variant="danger"
          pending
          pendingLabel="Removing…"
          onClick={onClick}
        >
          Remove
        </Action>
      </>,
    );
    const pending = screen.getByRole("button", { name: "Removing…" });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute("aria-busy", "true");
    await userEvent.click(pending);
    await userEvent.click(screen.getByRole("button", { name: "Disabled" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("shared fields", () => {
  it("associates label, help and error without losing existing descriptions", () => {
    render(
      <>
        <p id="existing">Existing guidance</p>
        <Field label="Name" help="Use your name" error="Name is required">
          <input aria-describedby="existing" required />
        </Field>
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "Existing guidance Use your name Name is required",
    );
  });
  it("preserves disabled select and read-only textarea semantics", () => {
    render(
      <>
        <Field label="Course" optionalLabel="Optional">
          <select disabled>
            <option>One</option>
          </select>
        </Field>
        <Field label="Notes">
          <textarea readOnly value="Saved" />
        </Field>
      </>,
    );
    expect(
      screen.getByRole("combobox", { name: "Course Optional" }),
    ).toBeDisabled();
    const notes = screen.getByRole("textbox", { name: "Notes" });
    expect(notes).toHaveAttribute("readonly");
    expect(notes).not.toBeDisabled();
  });
});

describe("honest state presentation", () => {
  it("announces loading as busy", () => {
    render(<QueryState kind="loading" title="Loading courses" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
  it.each(["empty", "unavailable", "restricted"] as const)(
    "renders caller-supplied %s explanation without inventing retry",
    (kind) => {
      render(
        <QueryState
          kind={kind}
          title={kind}
          description="Server-backed explanation"
        />,
      );
      expect(screen.getByText(kind)).toBeVisible();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    },
  );
  it("exposes an error and the caller's real recovery action", async () => {
    const retry = vi.fn();
    render(
      <QueryState
        kind="error"
        title="Request failed"
        action={<Action onClick={retry}>Retry</Action>}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Request failed");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("distinguishes local mutation success and failure", () => {
    render(
      <>
        <MutationOutcome kind="success">Saved</MutationOutcome>
        <MutationOutcome kind="error">Save failed</MutationOutcome>
      </>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByRole("alert")).toHaveTextContent("Save failed");
  });
});
