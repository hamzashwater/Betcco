"use client";

import { useState } from "react";
import { Action, actionClassName } from "@/components/ui/action";
import { QueryState } from "@/components/ui/query-state";
import {
  ConfirmedMilestone,
  CourseJourneyRail,
  DashboardContinuation,
  EvaluationLifecycle,
  LearningAimChecklist,
  TaskStateRow,
} from "./progress-patterns";
import { progressFixture, type ProgressScenario } from "./progress-fixtures";
import en from "./progress-copy.en.json";
import ar from "./progress-copy.ar.json";
import styles from "./progress-patterns.module.css";

// Isolated specimen entry. No application route imports it or the six models.
export function ProgressSpecimen({
  locale,
  scenario = "in-progress",
}: {
  locale: "en" | "ar";
  scenario?: ProgressScenario;
}) {
  const [courseIndex, setCourseIndex] = useState(0);
  const copy = locale === "ar" ? ar : en;
  const fixture = progressFixture(scenario, locale, courseIndex);
  const dataVisible = !["pending", "cold-error", "empty"].includes(scenario);
  return (
    <main
      className={styles.root}
      dir={locale === "ar" ? "rtl" : "ltr"}
      data-specimen-scenario={scenario}
    >
      <header className={styles.header}>
        <p className="ui-type-meta text-text-muted">
          UI-D01-06 · {copy.isolated}
        </p>
        <h1 className="ui-type-page">{copy.title}</h1>
        <p className="ui-type-body text-text-secondary">{copy.description}</p>
        <p className="ui-type-meta text-text-muted">{copy.evidence}</p>
        <label className={`ui-type-label ${styles.selector}`}>
          {copy.courseSelector}
          <select
            className="focus-ring"
            value={courseIndex}
            onChange={(event) => setCourseIndex(Number(event.target.value))}
          >
            {[0, 1].map((index) => (
              <option key={index} value={index}>
                {progressFixture(scenario, locale, index).course.localizedTitle}
              </option>
            ))}
          </select>
        </label>
      </header>
      {scenario === "pending" && (
        <QueryState kind="loading" title={copy.pending} />
      )}
      {scenario === "cold-error" && (
        <QueryState
          kind="error"
          title={copy.error}
          description={copy.rawError}
        />
      )}
      {scenario === "empty" && <QueryState kind="empty" title={copy.empty} />}
      {scenario === "cached-error" && (
        <QueryState kind="error" title={copy.error} description={copy.cached} />
      )}
      {scenario === "partial-data" && (
        <QueryState kind="unavailable" title={copy.partial} />
      )}
      {dataVisible && (
        <div className={styles.grid}>
          <CourseJourneyRail
            units={fixture.units}
            currentUnitId={fixture.unit.id}
            copy={copy}
            locale={locale}
          />
          <LearningAimChecklist aim={fixture.aim} copy={copy} locale={locale} />
          <TaskStateRow
            task={{
              title:
                fixture.aim[locale === "ar" ? "arabicTitle" : "englishTitle"],
              status: scenario === "partial-data" ? undefined : "Draft",
              effectiveDueAtUtc: "2026-12-10T09:00:00Z",
            }}
            copy={copy}
            locale={locale}
            action={
              scenario === "disabled" ? (
                <Action disabled>{copy.disabled}</Action>
              ) : (
                <a
                  className={actionClassName("secondary")}
                  href="#specimen-destination"
                >
                  {copy.openDraft}
                </a>
              )
            }
          />
          <EvaluationLifecycle
            request={fixture.request}
            copy={copy}
            locale={locale}
          />
          <DashboardContinuation
            course={fixture.course}
            copy={copy}
            locale={locale}
            action={
              scenario === "disabled" ? (
                <Action disabled>{copy.disabled}</Action>
              ) : (
                <a
                  className={actionClassName("primary")}
                  href="#specimen-destination"
                >
                  {copy.continue}
                </a>
              )
            }
          />
          <ConfirmedMilestone unit={fixture.unit} copy={copy} locale={locale} />
        </div>
      )}
      <p id="specimen-destination" className="ui-type-meta text-text-muted">
        {copy.evidence}
      </p>
    </main>
  );
}
