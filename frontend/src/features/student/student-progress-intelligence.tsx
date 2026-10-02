"use client";

import styles from "./student-course-player.module.css";
import { QueryState } from "@/components/dashboard/dashboard-ui";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleDot,
  Flag,
  Target,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

type Aim = {
  id: string;
  code: string;
  arabicTitle: string;
  englishTitle: string;
  isUnlocked: boolean;
  contentTotal: number;
  contentCompleted: number;
  contentComplete: boolean;
  assignmentId?: string | null;
  practiceAvailable: boolean;
  practiceStatus: string;
  maxAttempts: number;
  attemptsUsed: number;
  attemptsRemaining: number;
  trainingOutcome?: string | null;
  bestTrainingOutcome?: string | null;
  isComplete: boolean;
};
type FinalPractice = {
  assignmentId?: string | null;
  isAvailable: boolean;
  status: string;
  unavailableReason?: string | null;
  trainingOutcome?: string | null;
  isTrainingComplete: boolean;
};

type Unit = {
  id: string;
  arabicTitle: string;
  englishTitle: string;
  aims: Aim[];
  finalPractice?: FinalPractice | null;
};

type NextKey =
  | "unitComplete"
  | "waitingFinalConfiguration"
  | "waitingFinalReview"
  | "startFinalPractice"
  | "finalDeadlineExpired"
  | "finalAccessRestricted"
  | "waitingFinalAvailability"
  | "continueLearning"
  | "completePreviousAim"
  | "continueAimContent"
  | "waitingPracticeConfiguration"
  | "waitingPracticeReview"
  | "finishPracticeSubmission"
  | "startAimPractice"
  | "practiceUnavailable"
  | "unitUnavailable"
  | "waitingAimContent";

type Insight = {
  key: NextKey;
  values?: Record<string, string | number>;
};

export function StudentProgressIntelligence({
  courseId,
}: {
  courseId: string;
}) {
  const locale = useLocale();
  const t = useTranslations("studentProgressIntelligence");
  const result = useQuery({
    queryKey: ["learning-aim-practice", courseId],
    queryFn: () =>
      api<Unit[]>(`/student/courses/${courseId}/learning-aim-practice`),
  });

  if (result.isPending) {
    return (
      <section className={styles.journey}>
        <QueryState kind="loading" title={t("loading")} />
      </section>
    );
  }

  if (result.isError) {
    return (
      <section className={styles.journey}>
        <QueryState
          kind="error"
          title={t("loadError")}
          description={t("loadErrorDescription")}
        />
      </section>
    );
  }

  const units = result.data ?? [];
  if (!units.length) return null;
  const aims = units.flatMap((unit) => unit.aims);
  const totalContent = aims.reduce((sum, aim) => sum + aim.contentTotal, 0);
  const completedContent = aims.reduce(
    (sum, aim) => sum + aim.contentCompleted,
    0,
  );
  const completedAims = aims.filter((aim) => aim.isComplete).length;
  const completedUnits = units.filter(
    (unit) => unit.finalPractice?.isTrainingComplete,
  ).length;
  const readyForFinal = units.filter(
    (unit) =>
      unit.aims.length > 0 &&
      unit.aims.every((aim) => aim.isComplete) &&
      unit.finalPractice?.isAvailable &&
      !unit.finalPractice.isTrainingComplete,
  ).length;
  const focusUnit =
    units.find((unit) => !unit.finalPractice?.isTrainingComplete) ?? units[0];

  return (
    <section
      className={styles.journey}
      aria-labelledby="student-progress-intelligence-heading"
    >
      <div className={styles.journeyHeader}>
        <div>
          <h2
            id="student-progress-intelligence-heading"
            className="text-xl font-extrabold"
          >
            {t("title")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {t("description")}
          </p>
        </div>
      </div>
      <div className={styles.journeyMetrics}>
        <MetricCard
          icon={<BookOpenCheck size={18} />}
          label={t("metrics.content")}
          value={`${completedContent}/${totalContent}`}
        />
        <MetricCard
          icon={<Target size={18} />}
          label={t("metrics.aims")}
          value={`${completedAims}/${aims.length}`}
        />
        <MetricCard
          icon={<Flag size={18} />}
          label={t("metrics.readyForFinal")}
          value={String(readyForFinal)}
        />
        <MetricCard
          icon={<CheckCircle2 size={18} />}
          label={t("metrics.completedUnits")}
          value={`${completedUnits}/${units.length}`}
        />
      </div>
      <div className="min-w-0">
        {units.map((unit) => {
          const unitTitle =
            locale === "ar" ? unit.arabicTitle : unit.englishTitle;
          const contentTotal = unit.aims.reduce(
            (sum, aim) => sum + aim.contentTotal,
            0,
          );
          const contentCompleted = unit.aims.reduce(
            (sum, aim) => sum + aim.contentCompleted,
            0,
          );
          const aimComplete = unit.aims.filter((aim) => aim.isComplete).length;
          const unitNext = deriveNextAction(unit);
          return (
            <details
              key={unit.id}
              open={unit.id === focusUnit.id}
              className={styles.journeyUnit}
            >
              <summary className={`focus-ring ${styles.unitSummary}`}>
                <h3 className={styles.unitHeading}>{unitTitle}</h3>
                <div className={styles.unitOverview}>
                  <p className="text-xs text-text-secondary">
                    {t("unitSummary", {
                      contentCompleted,
                      contentTotal,
                      aimComplete,
                      aimTotal: unit.aims.length,
                    })}
                  </p>
                  <UnitState unit={unit} />
                </div>
              </summary>
              <div className="mt-3 min-w-0">
                <div className="grid gap-2">
                  {unit.aims.map((aim) => (
                    <AimRow
                      key={aim.id}
                      aim={aim}
                      focused={
                        aim.id ===
                        unit.aims.find((item) => !item.isComplete)?.id
                      }
                    />
                  ))}
                </div>
                <div className={styles.unitNext}>
                  <p className="flex items-center gap-2 text-sm font-black">
                    <ArrowRight
                      size={16}
                      className="text-primary rtl:rotate-180"
                      aria-hidden="true"
                    />
                    {t("next.unitTitle")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {t(`next.${unitNext.key}`, unitNext.values)}
                  </p>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function AimRow({ aim, focused }: { aim: Aim; focused: boolean }) {
  const locale = useLocale();
  const t = useTranslations("studentProgressIntelligence");
  const title = locale === "ar" ? aim.arabicTitle : aim.englishTitle;
  return (
    <div className={styles.aimRow} data-focus-aim={focused}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-black">
          {aim.code} · {title}
        </p>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted">
          {aim.isComplete
            ? t("aim.complete")
            : aim.isUnlocked
              ? t("aim.inProgress")
              : t("aim.locked")}
        </span>
      </div>{" "}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          {t("aim.content", {
            completed: aim.contentCompleted,
            total: aim.contentTotal,
          })}
        </span>
        {aim.maxAttempts > 0 ? (
          <span>
            {t("aim.attempts", {
              used: aim.attemptsUsed,
              max: aim.maxAttempts,
              remaining: aim.attemptsRemaining,
            })}
          </span>
        ) : null}
        {aim.trainingOutcome ? (
          <span>
            {t("aim.latest")}:{" "}
            {outcomeKey(aim.trainingOutcome)
              ? t(outcomeKey(aim.trainingOutcome)!)
              : aim.trainingOutcome}
          </span>
        ) : null}
        {aim.bestTrainingOutcome ? (
          <span>
            {t("aim.best")}:{" "}
            {outcomeKey(aim.bestTrainingOutcome)
              ? t(outcomeKey(aim.bestTrainingOutcome)!)
              : aim.bestTrainingOutcome}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function UnitState({ unit }: { unit: Unit }) {
  const t = useTranslations("studentProgressIntelligence");
  const final = unit.finalPractice;
  let label = t("unitStates.learning");
  if (final?.isTrainingComplete) label = t("unitStates.complete");
  else if (
    unit.aims.length > 0 &&
    unit.aims.every((aim) => aim.isComplete) &&
    final?.isAvailable
  )
    label = t("unitStates.readyForFinal");
  else if (unit.aims.length > 0 && unit.aims.every((aim) => aim.isComplete))
    label = t("unitStates.aimsComplete");
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-black text-primary">
      <CircleDot size={13} aria-hidden="true" />
      {label}
    </span>
  );
}
function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <article className={styles.journeyMetric}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true">{icon}</span>
        <p>{label}</p>
      </div>
      <strong>{value}</strong>
    </article>
  );
}

function deriveNextAction(unit: Unit): Insight {
  const allAimsComplete =
    unit.aims.length > 0 && unit.aims.every((aim) => aim.isComplete);
  const final = unit.finalPractice;

  if (final?.isTrainingComplete) return { key: "unitComplete" };

  if (allAimsComplete) {
    if (!final?.assignmentId) return { key: "waitingFinalConfiguration" };
    if (final.status === "Submitted") return { key: "waitingFinalReview" };
    if (final.isAvailable) return { key: "startFinalPractice" };
    if (final.unavailableReason === "DeadlineExpired")
      return { key: "finalDeadlineExpired" };
    if (final.unavailableReason === "AccessRestricted")
      return { key: "finalAccessRestricted" };
    return { key: "waitingFinalAvailability" };
  }

  const aim = unit.aims.find((item) => !item.isComplete);
  if (!aim) return { key: "continueLearning" };
  const title = aim.code || (unit.aims.indexOf(aim) + 1).toString();

  const aimIndex = unit.aims.indexOf(aim);
  if (!aim.isUnlocked) {
    const prerequisitesComplete = unit.aims
      .slice(0, aimIndex)
      .every((item) => item.isComplete);
    return prerequisitesComplete
      ? { key: "unitUnavailable" }
      : { key: "completePreviousAim", values: { aim: title } };
  }
  if (aim.contentTotal === 0)
    return { key: "waitingAimContent", values: { aim: title } };
  if (!aim.contentComplete)
    return {
      key: "continueAimContent",
      values: {
        aim: title,
        completed: aim.contentCompleted,
        total: aim.contentTotal,
      },
    };
  if (!aim.assignmentId || aim.practiceStatus === "NotConfigured")
    return { key: "waitingPracticeConfiguration", values: { aim: title } };
  if (aim.practiceStatus === "Submitted")
    return { key: "waitingPracticeReview", values: { aim: title } };
  if (aim.practiceStatus === "Draft")
    return { key: "finishPracticeSubmission", values: { aim: title } };
  if (aim.practiceAvailable)
    return { key: "startAimPractice", values: { aim: title } };
  return { key: "practiceUnavailable", values: { aim: title } };
}
function outcomeKey(
  outcome: string,
):
  | "outcomes.notyetachieved"
  | "outcomes.pass"
  | "outcomes.merit"
  | "outcomes.distinction"
  | null {
  switch (outcome) {
    case "NotYetAchieved":
      return "outcomes.notyetachieved";
    case "Pass":
      return "outcomes.pass";
    case "Merit":
      return "outcomes.merit";
    case "Distinction":
      return "outcomes.distinction";
    default:
      return null;
  }
}
