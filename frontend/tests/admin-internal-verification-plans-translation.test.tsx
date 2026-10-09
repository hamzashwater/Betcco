import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InternalVerificationPlanManagement } from "@/features/admin/internal-verification-plan-management";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import {
  candidate,
  plan,
  staff,
  taxonomy,
} from "./fixtures/admin-governance-gradebook";
import {
  deferred,
  mount,
  refreshKeys,
} from "./helpers/admin-governance-gradebook-render";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
const paths = {
  plans: "/internal-verification/plans",
  staff: "/internal-verification/plans/eligible-staff",
  candidates: "/internal-verification/plans/plan/candidates?take=100",
  sample: "/internal-verification/plans/plan/samples",
};
function read(p: string) {
  if (p === paths.plans) return [plan];
  if (p === paths.staff) return staff;
  if (p.startsWith("/taxonomy?locale=")) return taxonomy;
  if (p.endsWith("/candidates?take=100")) return [candidate];
  throw Error(`Unexpected read: ${p}`);
}
beforeEach(() => {
  apiMock
    .mockReset()
    .mockImplementation((p: string, o?: RequestInit) =>
      Promise.resolve(
        o?.method ? (p === paths.plans ? plan : undefined) : read(p),
      ),
    );
});
function writes() {
  return apiMock.mock.calls.filter(([, o]) => o?.method);
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function setup(locale: "en" | "ar") {
  const v = mount(locale, <InternalVerificationPlanManagement />),
    c = v.copy.internalVerificationPlans;
  const ready = () =>
    screen.findByText(plan.selectionRationale, { selector: "p" });
  const open = async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: c.create }));
    await screen.findByRole("option", { name: taxonomy.grades[0].name });
  };
  const selectPlan = async () => {
    await ready();
    fireEvent.click(screen.getByText(plan.selectionRationale));
    await screen.findByLabelText(c.sampleReason);
  };
  return { ...v, c, ready, open, selectPlan };
}
describe.each(["en", "ar"] as const)(
  "IV sampling %s — MOCKED UI-CONTRACT EVIDENCE",
  (locale) => {
    it("keeps all GETs/keys, retry=false and disabled candidates until a plan is selected", async () => {
      const v = setup(locale);
      await v.ready();
      expect(screen.getByRole("heading", { name: v.c.title })).toBeVisible();
      expect(screen.getByText(v.c.description)).toBeVisible();
      for (const p of [paths.plans, paths.staff, `/taxonomy?locale=${locale}`])
        expect(apiMock).toHaveBeenCalledWith(p);
      expect(apiMock).not.toHaveBeenCalledWith(paths.candidates);
      expect(
        v.client
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ).toEqual([
        ["internal-verification-plans"],
        ["taxonomy", locale],
        ["internal-verification-eligible-staff"],
        ["internal-verification-candidates", undefined],
      ]);
      expect(
        v.client
          .getQueryCache()
          .getAll()
          .every((q) => q.options.retry === false),
      ).toBe(true);
      await v.selectPlan();
      expect(apiMock).toHaveBeenCalledWith(paths.candidates);
      expect(
        v.client
          .getQueryCache()
          .find({ queryKey: ["internal-verification-candidates", "plan"] })
          ?.options.retry,
      ).toBe(false);
    });
    it("keeps assessor/verifier roles independent, mixed roles, raw names/emails/taxonomy and self-review exclusion", async () => {
      const v = setup(locale);
      await v.open();
      const assessor = screen.getByLabelText(v.c.assessor);
      expect(
        Array.from(assessor.querySelectorAll("option")).map((o) => o.value),
      ).toEqual(["", "assessor", "teacher", "mixed"]);
      expect(
        assessor.querySelector('option[value="assessor"]')?.textContent,
      ).toBe("Raw Assessor — assessor@example.invalid");
      for (const [label, data] of [
        [v.c.grade, taxonomy.grades],
        [v.c.specialization, taxonomy.specializations],
        [v.c.taskType, taxonomy.taskTypes],
      ] as const)
        expect(
          within(screen.getByLabelText(label)).getByRole("option", {
            name: data[0].name,
          }),
        ).toHaveValue(data[0].id);
      await v.selectPlan();
      const verifier = screen.getByLabelText(v.c.assignVerifier);
      expect(
        Array.from(verifier.querySelectorAll("option")).map((o) => o.value),
      ).toEqual(["", "verifier", "lead", "admin", "mixed"]);
      expect(
        verifier.querySelector('option[value="verifier"]')?.textContent,
      ).toBe("Raw Verifier — verifier@example.invalid");
      expect(screen.getByLabelText(v.c.sampleReason)).toHaveValue(
        plan.selectionRationale,
      );
      expect(screen.getByText(v.c.sampleHint)).toBeVisible();
    });
    it.each(["assessor", "grade", "specialization", "taskType"] as const)(
      "requires real %s scope; outcome alone is insufficient",
      async (field) => {
        const v = setup(locale);
        await v.open();
        const save = () => screen.getByRole("button", { name: v.c.save });
        change(v.c.outcome, "Pass");
        expect(save()).toBeDisabled();
        expect(screen.getByText(v.c.scopeRequired)).toBeVisible();
        const map = {
          assessor: [v.c.assessor, "assessor"],
          grade: [v.c.grade, "grade"],
          specialization: [v.c.specialization, "specialization"],
          taskType: [v.c.taskType, "task"],
        };
        change(map[field][0], map[field][1]);
        expect(save()).toBeEnabled();
        change(map[field][0], "");
        expect(save()).toBeDisabled();
        expect(writes()).toEqual([]);
      },
    );
    it.each([false, true])(
      "posts exact null/trim/ISO payload, selects returned plan, resets every field and invalidates plans only (date=%s)",
      async (withDate) => {
        const pending = deferred();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method ? pending.promise : Promise.resolve(read(p)),
        );
        const v = setup(locale);
        await v.open();
        change(v.c.grade, "grade");
        change(v.c.rationale, "  Documented rationale  ");
        if (withDate) {
          change(v.c.assessor, "assessor");
          change(v.c.specialization, "specialization");
          change(v.c.taskType, "task");
          change(v.c.outcome, "Pass");
          change(v.c.activeUntil, "2026-12-01T13:30");
        }
        const rationale = screen.getByLabelText(v.c.rationale);
        expect(rationale).toBeRequired();
        expect(rationale).toHaveAttribute("minlength", "10");
        expect(rationale).toHaveAttribute("maxlength", "2000");
        expect(screen.getByLabelText(v.c.activeUntil)).toHaveAttribute(
          "type",
          "datetime-local",
        );
        expect(screen.getByLabelText(v.c.activeUntil)).not.toBeRequired();
        fireEvent.submit(rationale.closest("form")!);
        await waitFor(() => expect(writes()).toHaveLength(1));
        expect(writes()[0]).toEqual([
          paths.plans,
          {
            method: "POST",
            body: JSON.stringify({
              assessorUserId: withDate ? "assessor" : null,
              gradeId: "grade",
              specializationId: withDate ? "specialization" : null,
              taskTypeId: withDate ? "task" : null,
              targetOutcome: withDate ? "Pass" : null,
              selectionRationale: "Documented rationale",
              activeUntilUtc: withDate
                ? new Date("2026-12-01T13:30").toISOString()
                : null,
            }),
          },
        ]);
        expect(screen.getByRole("button", { name: v.c.saving })).toBeDisabled();
        await act(async () => pending.resolve(plan));
        await screen.findByLabelText(v.c.sampleReason);
        expect(refreshKeys(v.invalidations)).toEqual([
          ["internal-verification-plans"],
        ]);
        await v.open();
        for (const label of [
          v.c.assessor,
          v.c.grade,
          v.c.specialization,
          v.c.taskType,
          v.c.outcome,
          v.c.rationale,
          v.c.activeUntil,
        ])
          expect(screen.getByLabelText(label)).toHaveValue("");
      },
    );
    it("preserves default rationale, empty override/minimum guard, exact sample payload and both success invalidations/resets", async () => {
      const pending = deferred();
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o?.method ? pending.promise : Promise.resolve(read(p)),
      );
      const v = setup(locale);
      await v.selectPlan();
      change(v.c.assignVerifier, "verifier");
      const reason = screen.getByLabelText(v.c.sampleReason);
      expect(reason).not.toBeRequired();
      expect(reason).toHaveAttribute("minlength", "10");
      expect(reason).toHaveAttribute("maxlength", "2000");
      const button = () => screen.getByRole("button", { name: v.c.select });
      expect(button()).toBeEnabled();
      change(v.c.sampleReason, "");
      expect(reason).toHaveValue("");
      expect(button()).toBeDisabled();
      change(v.c.sampleReason, "  123456789  ");
      expect(button()).toBeDisabled();
      change(v.c.sampleReason, "  1234567890  ");
      expect(button()).toBeEnabled();
      fireEvent.click(button());
      await waitFor(() => expect(writes()).toHaveLength(1));
      expect(writes()[0]).toEqual([
        paths.sample,
        {
          method: "POST",
          body: JSON.stringify({
            evaluationRequestId: "evaluation",
            assignedVerifierUserId: "verifier",
            selectionRationale: "1234567890",
          }),
        },
      ]);
      expect(
        screen.getByRole("button", { name: v.c.selecting }),
      ).toBeDisabled();
      await act(async () => pending.resolve(undefined));
      await waitFor(() =>
        expect(screen.getByLabelText(v.c.assignVerifier)).toHaveValue(""),
      );
      expect(reason).toHaveValue(plan.selectionRationale);
      expect(refreshKeys(v.invalidations)).toEqual([
        ["internal-verification-plans"],
        ["internal-verification-candidates", "plan"],
      ]);
    });
    it.each(["plans", "create", "candidate", "sample"] as const)(
      "preserves raw %s errors",
      async (target) => {
        apiMock.mockImplementation((p: string, o?: RequestInit) => {
          if (
            (target === "plans" && p === paths.plans && !o) ||
            (target === "candidate" && p === paths.candidates) ||
            (target === "create" && p === paths.plans && o) ||
            (target === "sample" && p === paths.sample && o)
          )
            return Promise.reject(Error("RAW_SERVER_FAILURE"));
          return Promise.resolve(o ? plan : read(p));
        });
        const v = setup(locale);
        if (target === "create") {
          await v.open();
          change(v.c.grade, "grade");
          change(v.c.rationale, "Raw valid rationale");
          fireEvent.submit(
            screen.getByLabelText(v.c.rationale).closest("form")!,
          );
        }
        if (target === "candidate" || target === "sample") {
          await v.ready();
          fireEvent.click(screen.getByText(plan.selectionRationale));
          if (target === "sample") {
            await screen.findByLabelText(v.c.sampleReason);
            change(v.c.assignVerifier, "verifier");
            fireEvent.click(screen.getByRole("button", { name: v.c.select }));
          }
        }
        expect(await screen.findByText("RAW_SERVER_FAILURE")).toBeVisible();
      },
    );
    it("keeps locale date formatting, raw numbers/rationale and localized outcomes with exact internal option values", async () => {
      const v = setup(locale);
      await v.open();
      const outcomes = screen.getByLabelText(v.c.outcome);
      for (const value of ["Pass", "Merit", "Distinction"] as const)
        expect(
          within(outcomes).getByRole("option", {
            name: v.c.outcomeLabels[value],
          }),
        ).toHaveValue(value);
      await v.selectPlan();
      expect(screen.getByText(`${v.c.attempt} 3`)).toBeVisible();
      expect(screen.getByText(`${v.c.samples}: 7`)).toBeVisible();
      expect(
        screen.getByText(
          (_, e) =>
            e?.tagName === "P" &&
            e.textContent ===
              formatLocalizedDateTime(plan.activeFromUtc, locale),
        ),
      ).toBeVisible();
      expect(
        screen.getByText(
          (_, e) =>
            e?.tagName === "P" &&
            e.textContent ===
              `${v.c.submitted}: ${formatLocalizedDateTime(candidate.submittedForVerificationAtUtc, locale)}`,
        ),
      ).toBeVisible();
    });
  },
);
