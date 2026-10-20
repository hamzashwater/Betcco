import { readFileSync, readdirSync } from "node:fs";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CourseJourneyRail,
  LearningAimChecklist,
  TaskStateRow,
  EvaluationLifecycle,
  DashboardContinuation,
  ConfirmedMilestone,
} from "../specimens/progress-patterns";
import { ProgressSpecimen } from "../specimens/ui-d01-06";
import {
  progressFixture,
  progressScenarios,
} from "../specimens/progress-fixtures";
import en from "../specimens/progress-copy.en.json";
import ar from "../specimens/progress-copy.ar.json";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe.each(["en", "ar"] as const)(
  "six progress specimens in %s",
  (locale) => {
    const copy = locale === "ar" ? ar : en,
      props = { locale, copy };
    it.each(progressScenarios)(
      "renders %s from isolated snapshots",
      (scenario) => {
        const fixture = progressFixture(scenario, locale);
        render(<ProgressSpecimen locale={locale} scenario={scenario} />);
        expect(screen.getByRole("main")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        expect(screen.getAllByText("MOCKED UI-CONTRACT EVIDENCE")).toHaveLength(
          2,
        );
        const unavailable = ["pending", "cold-error", "empty"].includes(
          scenario,
        );
        expect(document.querySelectorAll("[data-progress-model]")).toHaveLength(
          unavailable ? 0 : 6,
        );
        if (unavailable)
          expect(screen.queryByRole("link")).not.toBeInTheDocument();
        if (scenario === "pending")
          expect(screen.getByRole("status")).toHaveAttribute(
            "aria-busy",
            "true",
          );
        if (scenario === "cold-error" || scenario === "cached-error")
          expect(screen.getByRole("alert")).toHaveTextContent(copy.error);
        if (scenario === "cached-error")
          expect(
            screen.getByRole("region", { name: copy.dashboardSummary }),
          ).toHaveTextContent(fixture.course.localizedTitle);
        if (scenario === "disabled")
          expect(
            screen.getAllByRole("button", { name: copy.disabled }),
          ).toHaveLength(2);
      },
    );
    it("does not substitute 100 percent or lesson counts for state, access or mastery", () => {
      const fixture = progressFixture("in-progress", locale);
      render(
        <DashboardContinuation
          {...props}
          course={{
            ...fixture.course,
            completedLessons: 8,
            totalLessons: 8,
            progressPercent: 100,
            progressState: "InProgress",
            accessAvailable: false,
          }}
          action={<a href="#continue">{copy.continue}</a>}
        />,
      );
      expect(screen.getByText(copy.states.InProgress)).toBeVisible();
      expect(screen.getByText(copy.accessUnavailable)).toBeVisible();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Pass", { exact: true }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("100%")).not.toBeInTheDocument();
    });
    it("does not declare a milestone from completed Aims, a reviewed status or a count", () => {
      const fixture = progressFixture("complete", locale);
      render(
        <ConfirmedMilestone
          {...props}
          unit={{
            ...fixture.unit,
            finalPractice: {
              ...fixture.unit.finalPractice,
              isTrainingComplete: false,
            },
          }}
        />,
      );
      expect(screen.getByText(copy.notConfirmed)).toBeVisible();
      expect(
        document.querySelector('[data-confirmed="true"]'),
      ).not.toBeInTheDocument();
      expect(screen.getByText(copy.noAward)).toBeVisible();
    });
    it("renders a confirmed learning marker only from the actual server boolean", () => {
      const fixture = progressFixture("complete", locale);
      render(<ConfirmedMilestone {...props} unit={fixture.unit} />);
      expect(screen.getByText(copy.confirmedComplete)).toBeVisible();
      expect(document.querySelector('[data-confirmed="true"]')).toBeVisible();
      expect(screen.getByText(fixture.unit.id)).toBeVisible();
    });
    it("keeps empty and missing Unit data distinct, without generated rail nodes", () => {
      const { rerender } = render(<CourseJourneyRail {...props} />);
      expect(screen.getByText(copy.unavailable)).toBeVisible();
      expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
      rerender(<CourseJourneyRail {...props} units={[]} />);
      expect(screen.getByText(copy.noUnits)).toBeVisible();
      expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    });
    it("keeps raw server order/identity and native expandable Units", async () => {
      const fixture = progressFixture("in-progress", locale);
      render(
        <CourseJourneyRail
          {...props}
          units={fixture.units}
          currentUnitId={fixture.unit.id}
        />,
      );
      const details = [...document.querySelectorAll("details")];
      expect(details.map((d) => d.open)).toEqual([false, true, false]);
      expect(
        screen
          .getAllByRole("listitem")
          .map((row) => row.querySelector("summary span")?.textContent),
      ).toEqual(
        fixture.units.map((u) =>
          locale === "ar" ? u.arabicTitle : u.englishTitle,
        ),
      );
      const u = userEvent.setup();
      await u.tab();
      expect(details[0].querySelector("summary")).toHaveFocus();
      // jsdom does not implement the native Enter default action for summary.
      // Actual keyboard toggling is tested by progress-specimen-browser.mjs.
      await u.click(details[0].querySelector("summary")!);
      expect(details[0]).toHaveAttribute("open");
      expect(details[1].querySelector("summary")).toHaveAttribute(
        "aria-current",
        "step",
      );
    });
    it("keeps content, submitted practice and formative latest/best outcomes independent", () => {
      const fixture = progressFixture("aim-waiting-review", locale);
      render(
        <LearningAimChecklist
          {...props}
          aim={{
            ...fixture.aim,
            contentComplete: false,
            trainingOutcome: "Merit",
            bestTrainingOutcome: "Distinction",
            attemptsRemaining: 0,
          }}
        />,
      );
      expect(screen.getByText(copy.notConfirmed)).toBeVisible();
      expect(screen.getByText(copy.states.Submitted)).toBeVisible();
      expect(screen.getByText("Merit")).toBeVisible();
      expect(screen.getByText("Distinction")).toBeVisible();
      expect(screen.getByText(copy.formativeOnly)).toBeVisible();
      expect(screen.getByText(copy.noFeedback)).toBeVisible();
      expect(
        screen.queryByText("Pass", { exact: true }),
      ).not.toBeInTheDocument();
    });
    it("preserves unknown status/feedback strings and does not fill missing stages", () => {
      const fixture = progressFixture("partial-data", locale);
      const { rerender } = render(
        <LearningAimChecklist {...props} aim={fixture.aim} />,
      );
      expect(screen.getAllByText(copy.unknown).length).toBeGreaterThan(0);
      expect(screen.getByText(copy.noFeedback)).toBeVisible();
      expect(screen.queryByText(copy.contentComplete)).not.toBeInTheDocument();
      rerender(
        <LearningAimChecklist
          {...props}
          aim={{
            ...fixture.aim,
            practiceStatus: "RAW_FUTURE_STATE",
            strengths: "RAW feedback — شرح الخادم",
            trainingOutcome: "RAW_RESULT",
          }}
        />,
      );
      expect(screen.getByText("RAW_FUTURE_STATE")).toBeVisible();
      expect(screen.getByText("RAW feedback — شرح الخادم")).toBeVisible();
      expect(screen.getByText("RAW_RESULT")).toBeVisible();
    });
    it("shows no task action while saved state is unknown, and preserves the supplied due timestamp", () => {
      const due = "2026-12-10T09:00:00Z";
      const { rerender } = render(
        <TaskStateRow
          {...props}
          task={{ title: "RAW task", effectiveDueAtUtc: due }}
          action={<a href="#draft">{copy.openDraft}</a>}
        />,
      );
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(document.querySelector("time")).toHaveAttribute("dateTime", due);
      rerender(
        <TaskStateRow
          {...props}
          task={{ title: "RAW task", status: "Draft", effectiveDueAtUtc: due }}
          action={<a href="#draft">{copy.openDraft}</a>}
        />,
      );
      expect(screen.getByRole("link")).toHaveAttribute("href", "#draft");
    });
    it("keeps revision feedback on the same request without inventing a payment/history/stage", () => {
      const fixture = progressFixture("revision", locale);
      render(<EvaluationLifecycle {...props} request={fixture.request} />);
      expect(screen.getByText(copy.revision)).toBeVisible();
      expect(screen.getByText(fixture.request.feedback[0].body)).toBeVisible();
      expect(screen.getByText(copy.gradeUnknown)).toBeVisible();
      expect(screen.getByText(copy.fundingUnknown)).toBeVisible();
      expect(screen.getByText(copy.historyUnknown)).toBeVisible();
      expect(screen.queryByText(copy.resit)).not.toBeInTheDocument();
      expect(document.querySelectorAll('[aria-current="step"]')).toHaveLength(
        1,
      );
    });
    it("keeps Resit relation and historical Retake independent of revision and grade", () => {
      const fixture = progressFixture("resit", locale);
      const { rerender } = render(
        <EvaluationLifecycle {...props} request={fixture.request} />,
      );
      expect(screen.getByText(copy.resit)).toBeVisible();
      expect(screen.getByText("eval-original")).toBeVisible();
      expect(screen.getByText(copy.states.PendingPayment)).toBeVisible();
      expect(screen.getByText(copy.gradeUnknown)).toBeVisible();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      rerender(
        <EvaluationLifecycle
          {...props}
          request={progressFixture("historical-retake", locale).request}
        />,
      );
      expect(screen.getByText(copy.retake)).toBeVisible();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
    it("keeps raw feedback ordering and distinguishes formal grade from workflow completion", () => {
      const fixture = progressFixture("complete", locale);
      render(
        <EvaluationLifecycle
          {...props}
          request={{
            ...fixture.request,
            calculatedGrade: null,
            feedback: [
              {
                body: "RAW first",
                requestsResubmission: false,
                createdAtUtc: "2026-10-03T10:00:00Z",
              },
              {
                body: "RAW second",
                requestsResubmission: true,
                createdAtUtc: "2026-10-01T10:00:00Z",
              },
            ],
          }}
        />,
      );
      expect(screen.getByText(copy.states.Completed)).toBeVisible();
      expect(screen.getByText(copy.gradeUnknown)).toBeVisible();
      expect(
        [...document.querySelectorAll("time")].map((e) => e.dateTime),
      ).toEqual(["2026-10-03T10:00:00Z", "2026-10-01T10:00:00Z"]);
    });
    it("changes the synthetic course context without any network request", async () => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      render(<ProgressSpecimen locale={locale} />);
      const u = userEvent.setup();
      await u.selectOptions(screen.getByRole("combobox"), "1");
      const dashboard = screen.getByRole("region", {
        name: copy.dashboardSummary,
      });
      expect(
        within(dashboard).getByRole("heading", { level: 3 }),
      ).toHaveTextContent(
        progressFixture("in-progress", locale, 1).course.localizedTitle,
      );
      expect(fetch).not.toHaveBeenCalled();
    });
    it("renders all six models from the same deeply frozen source snapshots without altering inputs", () => {
      function freeze<T>(value: T): T {
        if (value && typeof value === "object") {
          Object.freeze(value);
          Object.values(value).forEach(freeze);
        }
        return value;
      }
      const fixture = freeze(progressFixture("complete", locale));
      const before = JSON.stringify(fixture);
      render(
        <>
          <CourseJourneyRail
            {...props}
            units={fixture.units}
            currentUnitId={fixture.unit.id}
          />
          <LearningAimChecklist {...props} aim={fixture.aim} />
          <TaskStateRow
            {...props}
            task={freeze({ title: "RAW task", status: "Submitted" })}
          />
          <EvaluationLifecycle {...props} request={fixture.request} />
          <DashboardContinuation {...props} course={fixture.course} />
          <ConfirmedMilestone {...props} unit={fixture.unit} />
        </>,
      );
      expect(JSON.stringify(fixture)).toBe(before);
      expect(document.querySelectorAll("[data-progress-model]")).toHaveLength(
        6,
      );
    });
  },
);

describe("isolated progress ownership and source contracts", () => {
  it("keeps synthetic specimens outside the production import graph", () => {
    for (const file of readdirSync("src", {
      recursive: true,
      encoding: "utf8",
    }).filter((file) => /\.[cm]?[jt]sx?$/.test(file))) {
      const source = readFileSync(`src/${file}`, "utf8");
      expect(source, file).not.toMatch(
        /(?:from\s*|import\s*\()\s*["'][^"']*specimens(?:\/|["'])/,
      );
    }
  });
  it("has paired catalogue keys for every new label and status", () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(ar.states).sort()).toEqual(
      Object.keys(en.states).sort(),
    );
    expect(Object.keys(ar.reasons).sort()).toEqual(
      Object.keys(en.reasons).sort(),
    );
    for (const value of Object.values(ar))
      if (typeof value === "string") expect(value.length).toBeGreaterThan(0);
  });
  it("covers the current formal status enum without adding stored lifecycle states", () => {
    const source = readFileSync(
      "../backend/src/Betcco.Domain/Common/Enums.cs",
      "utf8",
    );
    const values = source
      .match(/enum EvaluationStatus \{([^}]+)\}/)![1]
      .split(",")
      .map((s) => s.trim());
    for (const state of values) expect(Object.keys(en.states)).toContain(state);
    const patterns = readFileSync("specimens/progress-patterns.tsx", "utf8");
    expect(patterns).not.toMatch(
      /useQuery|useMutation|fetch\(|router\.|progressbar|setInterval|Math\.round|Math\.min|Date\.now/,
    );
    expect(patterns.match(/export function /g)).toHaveLength(6);
  });
  it("uses logical rail direction, semantic tokens and scoped reduced motion", () => {
    const css = readFileSync("specimens/progress-patterns.module.css", "utf8");
    expect(css).toContain("border-inline-start");
    expect(css).toContain("inset-inline-start");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("transition: none !important");
    expect(css).not.toMatch(
      /#[\da-f]{3,8}|linear-gradient|box-shadow|backdrop-filter|infinite|\bleft:|\bright:/i,
    );
  });
});
