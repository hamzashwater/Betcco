import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import Link from "next/link";
import { Action, actionClassName } from "@/components/ui/action";
import { MutationOutcome, QueryState } from "@/components/ui/query-state";
import baseline from "./fixtures/ui-d01-04-baseline.json";
import { interactionPresentation } from "./helpers/ui-interaction-contract";
import { syntax } from "./helpers/ui-typography-contract";

afterEach(cleanup);

describe("UI-D01-04 presentation and ownership boundary", () => {
  it.each(["action.tsx", "query-state.tsx"] as const)(
    "retains the complete merged native/ARIA/caller contract in %s",
    (file) => {
      expect(
        syntax(
          interactionPresentation(
            readFileSync(`src/components/ui/${file}`, "utf8"),
            file,
          ),
        ),
      ).toBe(syntax(baseline.sources[`src/components/ui/${file}`]));
    },
  );

  it.each([
    ["action.tsx", "disabled={disabled || pending}", "disabled={disabled}"],
    ["action.tsx", 'type = "button"', 'type = "submit"'],
    [
      "action.tsx",
      "text-action-primary-foreground",
      "text-action-primary-text",
    ],
    ["query-state.tsx", "{description}", '"Replaced caller content"'],
    [
      "query-state.tsx",
      'kind === "error" ? "alert"',
      'kind === "error" ? "status"',
    ],
    [
      "query-state.tsx",
      'kind === "success" ? CircleCheck',
      'kind === "success" ? CircleAlert',
    ],
  ] as const)("still rejects drift in %s at %s", (file, from, to) => {
    const source = readFileSync(`src/components/ui/${file}`, "utf8");
    expect(source).toContain(from);
    expect(
      syntax(interactionPresentation(source.replace(from, to), file)),
    ).not.toBe(syntax(baseline.sources[`src/components/ui/${file}`]));
  });

  it("preserves foundation/font/copy/dependency files and deferred consumers", () => {
    for (const [file, hash] of Object.entries(baseline.protectedFiles))
      expect(
        createHash("sha256").update(readFileSync(file)).digest("hex"),
        file,
      ).toBe(hash);
  });

  it("preserves all Teacher query/mutation options and untouched domain sections", () => {
    for (const [file, calls] of Object.entries(baseline.teacherHooks)) {
      const source = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
      const ast = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const actual: string[] = [];
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          ["useQuery", "useMutation"].includes(node.expression.getText(ast))
        )
          actual.push(node.getText(ast));
        ts.forEachChild(node, visit);
      }
      visit(ast);
      expect(actual.map(syntax), file).toEqual(calls.map(syntax));
      const hash = (value: string) =>
        createHash("sha256").update(value).digest("hex");
      if (file.endsWith("teacher-area.tsx"))
        expect(
          hash(source.slice(source.indexOf("type WalletTransaction ="))),
        ).toBe(
          baseline.teacherUntouched["src/features/teacher/teacher-area.tsx"]
            .walletAndEvaluationTail,
        );
      else
        for (const node of ast.statements)
          if (
            ts.isFunctionDeclaration(node) &&
            node.name &&
            ["FormativeSignalCard", "StudentMetric"].includes(node.name.text)
          ) {
            const name = node.name.text as
              "FormativeSignalCard" | "StudentMetric";
            expect(hash(node.getText(ast))).toBe(
              baseline.teacherUntouched[
                "src/features/teacher/teacher-student-follow-up.tsx"
              ][name],
            );
          }
    }
  });
});

describe("Action keeps native behavior through deliberate visual states", () => {
  it.each(["primary", "secondary", "quiet", "danger"] as const)(
    "preserves %s props, submit semantics, keyboard and duplicate-submit guards",
    async (variant) => {
      const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
      const click = vi.fn();
      const user = userEvent.setup();
      const view = render(
        <form onSubmit={submit}>
          <Action
            variant={variant}
            type="submit"
            name="intent"
            value="RAW"
            title="RAW tooltip"
            onClick={click}
          >
            RAW label إجراء
          </Action>
        </form>,
      );
      const action = screen.getByRole("button", { name: "RAW label إجراء" });
      expect(action).toHaveAttribute("name", "intent");
      expect(action).toHaveAttribute("value", "RAW");
      expect(action).toHaveAttribute("title", "RAW tooltip");
      expect(action).toHaveClass("ui-type-label", "min-h-11", "rounded-lg");
      await user.tab();
      expect(action).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(click).toHaveBeenCalledOnce();
      expect(submit).toHaveBeenCalledOnce();
      view.rerender(
        <Action
          variant={variant}
          pending
          pendingLabel="RAW pending جارٍ الحفظ"
          onClick={click}
        >
          RAW label إجراء
        </Action>,
      );
      const pending = screen.getByRole("button", {
        name: "RAW pending جارٍ الحفظ",
      });
      expect(pending).toBeDisabled();
      expect(pending).toHaveAttribute("aria-busy", "true");
      await user.dblClick(pending);
      expect(click).toHaveBeenCalledOnce();
      view.rerender(
        <Action variant={variant} disabled onClick={click}>
          RAW disabled
        </Action>,
      );
      await user.click(screen.getByRole("button", { name: "RAW disabled" }));
      expect(click).toHaveBeenCalledOnce();
    },
  );

  it("keeps the helper a native link and forwards caller ARIA/class props", () => {
    render(
      <>
        <Link
          href="/RAW-route?scope=1#RAW"
          className={actionClassName("quiet")}
        >
          RAW destination
        </Link>
        <Action
          aria-busy
          aria-describedby="raw-description"
          className="caller-class"
        >
          RAW action
        </Action>
      </>,
    );
    expect(
      screen.getByRole("link", { name: "RAW destination" }),
    ).toHaveAttribute("href", "/RAW-route?scope=1#RAW");
    expect(screen.getByRole("link")).not.toHaveAttribute("role");
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-describedby",
      "raw-description",
    );
    expect(screen.getByRole("button")).toHaveClass("caller-class");
  });
});

describe("state semantics remain factual and caller-owned", () => {
  it.each([
    ["loading", "info", "status"],
    ["empty", "neutral", null],
    ["error", "danger", "alert"],
    ["unavailable", "warning", null],
    ["restricted", "warning", null],
  ] as const)(
    "preserves %s meaning, raw copy and optional recovery",
    async (kind, tone, role) => {
      const recover = vi.fn();
      const { container } = render(
        <QueryState
          kind={kind}
          title={`RAW ${kind} عنوان`}
          description={<bdi dir="auto">RAW server explanation شرح الخادم</bdi>}
          action={<Action onClick={recover}>RAW recovery</Action>}
        />,
      );
      const region = container.firstElementChild;
      if (role) expect(region).toHaveAttribute("role", role);
      else expect(region).not.toHaveAttribute("role");
      if (kind === "loading")
        expect(region).toHaveAttribute("aria-busy", "true");
      else expect(region).not.toHaveAttribute("aria-busy");
      expect(region).toHaveTextContent(`RAW ${kind} عنوان`);
      expect(region).toHaveTextContent("RAW server explanation شرح الخادم");
      expect(region).toHaveClass(`border-state-${tone}-border!`);
      expect(region?.querySelector("svg")).toHaveAttribute("width", "20");
      expect(region?.querySelector("svg")).toHaveAttribute("stroke-width", "2");
      await userEvent.click(
        screen.getByRole("button", { name: "RAW recovery" }),
      );
      expect(recover).toHaveBeenCalledOnce();
    },
  );

  it.each(["success", "error"] as const)(
    "keeps %s mutation feedback local with its native role",
    (kind) => {
      const { container } = render(
        <MutationOutcome kind={kind}>
          <bdi dir="auto">RAW outcome نتيجة الخادم</bdi>
        </MutationOutcome>,
      );
      const outcome = screen.getByRole(kind === "success" ? "status" : "alert");
      expect(outcome).toHaveTextContent("RAW outcome نتيجة الخادم");
      expect(outcome).toHaveClass(
        kind === "success" ? "bg-success-surface" : "bg-danger-surface",
      );
      expect(container.querySelector("svg")).toHaveAttribute(
        "stroke-width",
        "2",
      );
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    },
  );
});
