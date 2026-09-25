"use client";

import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleDot,
  Flag,
  Gauge,
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
      <section className="card mt-6 p-5" aria-busy="true">
        <p className="text-sm text-muted">{t("loading")}</p>
      </section>
    );
  }

  if (result.isError) {
    return (
      <section className="card mt-6 p-5" role="alert">
        <p className="font-black">{t("loadError")}</p>
        <p className="mt-1 text-sm text-muted">{t("loadErrorDescription")}</p>
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
  const next = deriveNextAction(focusUnit);

  return (
    <section
      className="card mt-6 overflow-hidden p-5 sm:p-6"
      aria-labelledby="student-progress-intelligence-heading"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
            {t("eyebrow")}
          </p>
          <h2
            id="student-progress-intelligence-heading"
            className="mt-2 text-2xl font-black"
          >
            {t("title")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            {t("description")}
          </p>
        </div>
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 lg:max-w-md">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-primary">
            <Target size={16} aria-hidden="true" />
            {t("next.title")}
          </p>
          <p className="mt-2 font-black">
            {t(`next.${next.key}`, next.values)}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            {t("next.ruleBased")}
          </p>
        </div>
      </div>{" "}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
      <div className="mt-5 grid gap-4">
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
            <article
              key={unit.id}
              className="rounded-2xl border border-border bg-surface-solid/45 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black">{unitTitle}</h3>
                  <p className="mt-1 text-xs font-semibold text-muted">
                    {t("unitSummary", {
                      contentCompleted,
                      contentTotal,
                      aimComplete,
                      aimTotal: unit.aims.length,
                    })}
                  </p>
                </div>
                <UnitState unit={unit} />
              </div>{" "}
              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.35fr)]">
                <div className="grid gap-2">
                  {unit.aims.map((aim) => (
                    <AimRow key={aim.id} aim={aim} />
                  ))}
                </div>
                <div className="rounded-xl border border-border bg-page/35 p-4">
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
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AimRow({ aim }: { aim: Aim }) {
  const locale = useLocale();
  const t = useTranslations("studentProgressIntelligence");
  const title = locale === "ar" ? aim.arabicTitle : aim.englishTitle;
  return (
    <div className="rounded-xl border border-border bg-page/25 p-3">
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
    <article className="rounded-2xl border border-border bg-surface-solid/55 p-4">
      <div className="flex items-center gap-2 text-primary" aria-hidden="true">
        <Gauge size={18} />
        {icon}
      </div>
      <p className="mt-3 text-xs font-bold text-muted">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
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
