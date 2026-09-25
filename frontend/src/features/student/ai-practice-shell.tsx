"use client";

import { api } from "@/lib/api";
import type { StudentCoursesLearningHubResult } from "@/features/student/student-courses-learning-hub";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  FileText,
  History,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useMemo, useState } from "react";

const OUTCOMES = ["NYA", "P", "M", "D"] as const;

export function AiPracticeShell() {
  const locale = useLocale();
  const t = useTranslations("aiPractice");
  const [courseId, setCourseId] = useState("");
  const courses = useQuery({
    queryKey: ["ai-practice-courses", locale],
    queryFn: () =>
      api<StudentCoursesLearningHubResult>(
        `/learning/my-courses?locale=${locale}&page=1&pageSize=50&progress=All&sort=Recent`,
      ),
  });
  const selectedCourse = useMemo(
    () => courses.data?.items.find((course) => course.courseId === courseId),
    [courseId, courses.data?.items],
  );

  return (
    <section
      className="shell min-w-0 py-10"
      dir={locale === "ar" ? "rtl" : "ltr"}
      aria-labelledby="ai-practice-heading"
    >
      <header className="card relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_42%)]" />{" "}
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
              <Sparkles size={14} aria-hidden="true" />
              {t("comingSoon")}
            </span>
            <span className="rounded-full border border-border px-3 py-1 text-xs font-bold text-muted">
              {t("formativeOnly")}
            </span>
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-primary">
            BETCCO AI Practice
          </p>
          <h1
            id="ai-practice-heading"
            className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl"
          >
            {t("title")}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
            {t("description")}
          </p>
        </div>
      </header>

      <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.65fr)]">
        <div className="min-w-0 space-y-5">
          {" "}
          <article className="card p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <BrainCircuit size={22} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-xl font-black">{t("workspace.title")}</h2>
                <p className="mt-1 text-sm leading-6 text-muted">
                  {t("workspace.description")}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <label className="text-sm font-bold">
                {t("fields.course")}
                <select
                  value={courseId}
                  onChange={(event) => setCourseId(event.target.value)}
                  disabled={courses.isPending || courses.isError}
                  className="focus-ring mt-2 w-full rounded-xl border border-border bg-surface-solid px-3 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">
                    {courses.isPending
                      ? t("fields.loadingCourses")
                      : t("fields.chooseCourse")}
                  </option>{" "}
                  {courses.data?.items.map((course) => (
                    <option key={course.courseId} value={course.courseId}>
                      {course.localizedTitle}
                    </option>
                  ))}
                </select>
              </label>
              <DisabledSelect
                label={t("fields.unit")}
                placeholder={t("fields.unitPlaceholder")}
              />
              <DisabledSelect
                label={t("fields.learningAim")}
                placeholder={t("fields.learningAimPlaceholder")}
              />
            </div>

            {courses.isError ? (
              <p
                className="mt-3 text-sm font-semibold text-danger"
                role="alert"
              >
                {t("fields.courseLoadError")}
              </p>
            ) : null}

            <div className="mt-5 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-5">
              <div className="flex flex-col items-center text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <UploadCloud size={24} aria-hidden="true" />
                </span>{" "}
                <h3 className="mt-3 font-black">{t("upload.title")}</h3>
                <p className="mt-1 max-w-lg text-sm leading-6 text-muted">
                  {t("upload.description")}
                </p>
                <button
                  type="button"
                  disabled
                  className="mt-4 inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-black text-muted opacity-70"
                >
                  <LockKeyhole size={16} aria-hidden="true" />
                  {t("upload.disabledAction")}
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-solid p-4">
              <div>
                <p className="font-black">
                  {selectedCourse
                    ? t("ready.selected", {
                        title: selectedCourse.localizedTitle,
                      })
                    : t("ready.title")}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {t("ready.description")}
                </p>
              </div>
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-primary/20 px-4 py-2 text-sm font-black text-primary opacity-70"
              >
                <Sparkles size={16} aria-hidden="true" />
                {t("analyze")}
              </button>
            </div>
          </article>{" "}
          <article
            className="card p-5 sm:p-6"
            aria-labelledby="ai-preview-title"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
                  {t("preview.eyebrow")}
                </p>
                <h2 id="ai-preview-title" className="mt-2 text-xl font-black">
                  {t("preview.title")}
                </h2>
              </div>
              <Target className="text-primary" size={24} aria-hidden="true" />
            </div>
            <div className="mt-5 rounded-2xl border border-border bg-surface-solid p-4">
              <p className="text-xs font-bold text-muted">
                {t("preview.outcome")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {OUTCOMES.map((outcome) => (
                  <span
                    key={outcome}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-black text-muted"
                  >
                    {outcome}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-muted">
                {t("preview.pending")}
              </p>
            </div>{" "}
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <PreviewPanel
                title={t("preview.strengths")}
                icon={<CheckCircle2 size={18} />}
              >
                {t("preview.empty")}
              </PreviewPanel>
              <PreviewPanel
                title={t("preview.gaps")}
                icon={<FileText size={18} />}
              >
                {t("preview.empty")}
              </PreviewPanel>
              <PreviewPanel
                title={t("preview.guidance")}
                icon={<Target size={18} />}
              >
                {t("preview.empty")}
              </PreviewPanel>
            </div>
          </article>
        </div>

        <aside className="min-w-0 space-y-5">
          <article className="card p-5">
            <h2 className="flex items-center gap-2 font-black">
              <Sparkles size={18} className="text-primary" aria-hidden="true" />
              {t("flow.title")}
            </h2>
            <ol className="mt-4 space-y-4">
              {[1, 2, 3, 4].map((step) => (
                <li key={step} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-black text-primary">
                    {step}
                  </span>
                  <div>
                    <p className="text-sm font-black">
                      {t(`flow.step${step}.title`)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {t(`flow.step${step}.description`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </article>{" "}
          <article className="card p-5">
            <h2 className="flex items-center gap-2 font-black">
              <ShieldCheck
                size={18}
                className="text-primary"
                aria-hidden="true"
              />
              {t("boundary.title")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              {t("boundary.description")}
            </p>
          </article>
          <article className="card p-5">
            <h2 className="flex items-center gap-2 font-black">
              <History size={18} className="text-primary" aria-hidden="true" />
              {t("history.title")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              {t("history.empty")}
            </p>
          </article>
          <Link
            href={`/${locale}/student/courses`}
            className="focus-ring inline-flex items-center gap-2 rounded-xl border border-primary/40 px-4 py-2 text-sm font-black text-primary"
          >
            {t("backToCourses")}
            <ArrowUpRight
              size={16}
              className="rtl:-scale-x-100"
              aria-hidden="true"
            />
          </Link>
        </aside>
      </div>
    </section>
  );
}
function DisabledSelect({
  label,
  placeholder,
}: {
  label: string;
  placeholder: string;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      <select
        disabled
        className="mt-2 w-full cursor-not-allowed rounded-xl border border-border bg-surface-solid px-3 py-3 text-sm font-semibold text-muted opacity-70"
      >
        <option>{placeholder}</option>
      </select>
    </label>
  );
}

function PreviewPanel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-solid p-4">
      <p className="flex items-center gap-2 text-sm font-black text-foreground">
        <span className="text-primary" aria-hidden="true">
          {icon}
        </span>
        {title}
      </p>
      <p className="mt-3 text-xs leading-5 text-muted">{children}</p>
    </div>
  );
}
