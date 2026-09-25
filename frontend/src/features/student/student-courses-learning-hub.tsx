"use client";

/* Course covers are delivered by an existing same-origin API endpoint. */
/* eslint-disable @next/next/no-img-element */

import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BookOpenCheck,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  ImageOff,
  Layers3,
  LockKeyhole,
  Search,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useDeferredValue, useMemo, useState } from "react";

export type StudentCourseProgressState =
  "NotStarted" | "InProgress" | "Completed";

export type StudentCourseLearningHubItem = {
  courseId: string;
  arabicTitle: string;
  englishTitle: string;
  localizedTitle: string;
  completedLessons: number;
  totalLessons: number;
  publishedModuleCount: number;
  progressPercent: number;
  progressState: StudentCourseProgressState;
  hasCover: boolean;
  teacherName?: string | null;
  enrolledAtUtc: string;
  recentProgressAtUtc?: string | null;
  accessAvailable: boolean;
  accessReason?: string | null;
  accessAvailableAtUtc?: string | null;
};

export type StudentCoursesLearningHubResult = {
  items: StudentCourseLearningHubItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  summary: {
    totalCourses: number;
    notStarted: number;
    inProgress: number;
    completed: number;
    completedLessons: number;
    totalLessons: number;
    progressPercent: number;
  };
};

type ProgressFilter = "All" | StudentCourseProgressState;
type CourseSort = "Recent" | "Progress" | "Title";

const progressFilters: ProgressFilter[] = [
  "All",
  "NotStarted",
  "InProgress",
  "Completed",
];

function queryString(options: {
  locale: string;
  page: number;
  pageSize: number;
  search?: string;
  progress?: ProgressFilter;
  sort?: CourseSort;
}) {
  const params = new URLSearchParams({
    locale: options.locale,
    page: String(options.page),
    pageSize: String(options.pageSize),
    progress: options.progress ?? "All",
    sort: options.sort ?? "Recent",
  });
  if (options.search) params.set("search", options.search);
  return `/learning/my-courses?${params.toString()}`;
}

export function compactStudentCoursesQueryOptions(locale: string) {
  return {
    queryKey: ["student-courses-learning-hub", locale, "compact"] as const,
    queryFn: () =>
      api<StudentCoursesLearningHubResult>(
        queryString({ locale, page: 1, pageSize: 3 }),
      ),
  };
}

export function StudentCoursesLearningHub({
  variant = "full",
}: {
  variant?: "full" | "compact";
}) {
  const locale = useLocale();
  const t = useTranslations("studentCoursesLearningHub");
  const ai = useTranslations("aiPractice");
  const [search, setSearch] = useState("");
  const [progress, setProgress] = useState<ProgressFilter>("All");
  const [sort, setSort] = useState<CourseSort>("Recent");
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());
  const fullQuery = useMemo(
    () => ({
      queryKey: [
        "student-courses-learning-hub",
        locale,
        "full",
        page,
        deferredSearch,
        progress,
        sort,
      ] as const,
      queryFn: () =>
        api<StudentCoursesLearningHubResult>(
          queryString({
            locale,
            page,
            pageSize: 12,
            search: deferredSearch,
            progress,
            sort,
          }),
        ),
      placeholderData: (
        previous: StudentCoursesLearningHubResult | undefined,
      ) => previous,
    }),
    [deferredSearch, locale, page, progress, sort],
  );
  const result = useQuery<StudentCoursesLearningHubResult>({
    ...(variant === "compact"
      ? compactStudentCoursesQueryOptions(locale)
      : fullQuery),
    placeholderData: (previous) => previous,
  });

  if (result.isPending) {
    return (
      <section
        className={variant === "full" ? "shell py-10" : "min-w-0"}
        dir={locale === "ar" ? "rtl" : "ltr"}
      >
        <div className="card p-6 text-sm text-muted" aria-busy="true">
          {t("loading")}
        </div>
      </section>
    );
  }

  if (result.isError) {
    return (
      <section
        className={variant === "full" ? "shell py-10" : "min-w-0"}
        dir={locale === "ar" ? "rtl" : "ltr"}
      >
        <div className="card p-6" role="alert">
          <p className="font-bold text-foreground">{t("loadError")}</p>
          <button
            type="button"
            className="focus-ring mt-4 rounded-xl border border-border px-4 py-2 text-sm font-black text-primary"
            onClick={() => void result.refetch()}
          >
            {t("retry")}
          </button>
        </div>
      </section>
    );
  }

  const data = result.data;
  const pageCount = Math.max(1, Math.ceil(data.totalCount / data.pageSize));
  const hasNoEnrollments = data.summary.totalCourses === 0 && !deferredSearch;
  const hasNoMatches = data.items.length === 0 && !hasNoEnrollments;

  if (variant === "compact") {
    return (
      <section
        className="min-w-0"
        dir={locale === "ar" ? "rtl" : "ltr"}
        aria-labelledby="student-courses-compact-heading"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="student-courses-compact-heading"
              className="text-xl font-black"
            >
              {t("compactTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {t("compactDescription", { count: data.summary.totalCourses })}
            </p>
          </div>
          <Link
            href={`/${locale}/student/courses`}
            className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-primary/40 px-3 py-2 text-sm font-black text-primary"
          >
            {t("viewAll")}
            <ArrowUpRight
              size={16}
              className="rtl:-scale-x-100"
              aria-hidden="true"
            />
          </Link>
        </div>
        {data.items.length ? (
          <ul className="mt-4 grid gap-3" aria-label={t("courseListLabel")}>
            {data.items.map((course) => (
              <li key={course.courseId}>
                <CourseCard course={course} compact />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyEnrollment />
        )}
      </section>
    );
  }

  return (
    <section
      className="shell min-w-0 py-10"
      dir={locale === "ar" ? "rtl" : "ltr"}
      aria-labelledby="student-courses-heading"
    >
      <header className="card overflow-hidden p-6 sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          {t("eyebrow")}
        </p>
        <h1
          id="student-courses-heading"
          className="mt-3 text-3xl font-black tracking-tight sm:text-4xl"
        >
          {t("title")}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
          {t("description")}
        </p>
      </header>

      <article className="card relative mt-5 overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--primary)_16%,transparent),transparent_45%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <BrainCircuit size={24} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black">
                  {ai("courseBanner.title")}
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">
                  <Sparkles size={13} aria-hidden="true" />
                  {ai("comingSoon")}
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                {ai("courseBanner.description")}
              </p>
            </div>
          </div>
          <Link
            href={`/${locale}/student/ai-practice`}
            className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/40 px-4 py-2 text-sm font-black text-primary"
          >
            {ai("courseBanner.action")}
            <ArrowUpRight
              size={16}
              className="rtl:-scale-x-100"
              aria-hidden="true"
            />
          </Link>
        </div>
      </article>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label={t("summary.total")}
          value={data.summary.totalCourses}
        />
        <SummaryCard
          label={t("summary.notStarted")}
          value={data.summary.notStarted}
        />
        <SummaryCard
          label={t("summary.inProgress")}
          value={data.summary.inProgress}
        />
        <SummaryCard
          label={t("summary.completed")}
          value={data.summary.completed}
        />
      </div>

      {!hasNoEnrollments ? (
        <div className="card mt-5 p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,0.35fr)] lg:items-end">
            <div>
              <label
                htmlFor="student-course-search"
                className="text-sm font-bold"
              >
                {t("searchLabel")}
              </label>
              <div className="mt-2 flex min-w-0 items-center gap-2 rounded-xl border border-border bg-surface-solid px-3">
                <Search
                  size={18}
                  className="shrink-0 text-muted"
                  aria-hidden="true"
                />
                <input
                  id="student-course-search"
                  type="search"
                  maxLength={200}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder={t("searchPlaceholder")}
                  className="focus-ring min-w-0 flex-1 border-0 bg-transparent px-1 py-3 text-sm outline-none"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setPage(1);
                    }}
                    className="focus-ring grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-primary/10 hover:text-primary"
                    aria-label={t("clearSearch")}
                  >
                    <X size={17} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
            <div>
              <label
                htmlFor="student-course-sort"
                className="text-sm font-bold"
              >
                {t("sortLabel")}
              </label>
              <select
                id="student-course-sort"
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as CourseSort);
                  setPage(1);
                }}
                className="focus-ring mt-2 w-full rounded-xl border border-border bg-surface-solid px-3 py-3 text-sm font-semibold"
              >
                <option value="Recent">{t("sort.recent")}</option>
                <option value="Progress">{t("sort.progress")}</option>
                <option value="Title">{t("sort.title")}</option>
              </select>
            </div>
          </div>
          <div
            className="mt-4 flex flex-wrap gap-2"
            role="group"
            aria-label={t("filterLabel")}
          >
            {progressFilters.map((value) => {
              const active = progress === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setProgress(value);
                    setPage(1);
                  }}
                  className={`focus-ring rounded-full border px-3 py-2 text-sm font-bold transition-colors motion-reduce:transition-none ${
                    active
                      ? "border-primary bg-primary text-slate-950"
                      : "border-border bg-surface-solid text-muted hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {t(`filters.${value}`)}
                </button>
              );
            })}
          </div>
          <p
            className="mt-4 text-xs font-semibold text-muted"
            aria-live="polite"
          >
            {t("results", { count: data.totalCount })}
            {result.isFetching ? ` · ${t("updating")}` : ""}
          </p>
        </div>
      ) : null}

      {hasNoEnrollments ? (
        <EmptyEnrollment />
      ) : hasNoMatches ? (
        <div className="card mt-5 p-6 text-center">
          <p className="font-bold">{t("empty.noMatches")}</p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setProgress("All");
              setPage(1);
            }}
            className="focus-ring mt-4 rounded-xl border border-border px-4 py-2 text-sm font-black text-primary"
          >
            {t("showAll")}
          </button>
        </div>
      ) : (
        <ul
          className="mt-5 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3"
          aria-label={t("courseListLabel")}
        >
          {data.items.map((course) => (
            <li key={course.courseId} className="min-w-0">
              <CourseCard course={course} />
            </li>
          ))}
        </ul>
      )}

      {data.totalCount > data.pageSize ? (
        <nav
          className="mt-6 flex flex-wrap items-center justify-center gap-3"
          aria-label={t("pagination.label")}
        >
          <button
            type="button"
            disabled={page <= 1 || result.isFetching}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="focus-ring inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ChevronLeft
              size={16}
              className="rtl:rotate-180"
              aria-hidden="true"
            />
            {t("pagination.previous")}
          </button>
          <span className="text-sm font-bold text-muted">
            {t("pagination.page", { page, pageCount })}
          </span>
          <button
            type="button"
            disabled={page >= pageCount || result.isFetching}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            className="focus-ring inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-45"
          >
            {t("pagination.next")}
            <ChevronRight
              size={16}
              className="rtl:rotate-180"
              aria-hidden="true"
            />
          </button>
        </nav>
      ) : null}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="card p-4">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </article>
  );
}

function EmptyEnrollment() {
  const locale = useLocale();
  const t = useTranslations("studentCoursesLearningHub");
  return (
    <div className="card mt-5 p-6 text-center">
      <BookOpenCheck
        className="mx-auto text-primary"
        size={28}
        aria-hidden="true"
      />
      <p className="mt-3 font-bold">{t("empty.noCourses")}</p>
      <Link
        href={`/${locale}/courses`}
        className="focus-ring mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950"
      >
        {t("exploreCourses")}
      </Link>
    </div>
  );
}

function CourseCard({
  course,
  compact = false,
}: {
  course: StudentCourseLearningHubItem;
  compact?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("studentCoursesLearningHub");
  const [coverFailed, setCoverFailed] = useState(false);
  const formatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    [locale],
  );
  const progress = Math.max(0, Math.min(100, course.progressPercent));
  const action = t(`actions.${course.progressState}`);
  const accessMessage = course.accessAvailableAtUtc
    ? t("access.availableAt", {
        date: new Date(course.accessAvailableAtUtc).toLocaleString(locale),
      })
    : t("access.unavailable");

  return (
    <article
      className="card flex h-full min-w-0 flex-col overflow-hidden"
      data-interactive
    >
      {!compact ? (
        <div className="relative aspect-[16/8] overflow-hidden bg-primary/10">
          {course.hasCover && !coverFailed ? (
            <img
              src={`/api/v1/catalog/courses/${course.courseId}/cover`}
              alt={t("coverAlt", { title: course.localizedTitle })}
              className="size-full object-cover"
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <div
              className="grid size-full place-items-center"
              data-testid="course-cover-fallback"
            >
              <ImageOff size={30} className="text-primary" aria-hidden="true" />
              <span className="sr-only">{t("coverFallback")}</span>
            </div>
          )}
        </div>
      ) : null}
      <div
        className={
          compact
            ? "flex min-w-0 flex-1 flex-col p-4"
            : "flex min-w-0 flex-1 flex-col p-5"
        }
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="break-words font-black">{course.localizedTitle}</h3>
            {course.teacherName ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                <UserRound size={14} aria-hidden="true" />
                {course.teacherName}
              </p>
            ) : null}
          </div>
          <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
            {t(`statuses.${course.progressState}`)}
          </span>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-3 text-xs text-muted">
            <span>{t("progressLabel")}</span>
            <span className="font-black text-foreground">
              {formatter.format(course.progressPercent)}%
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-accent transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-label={t("progressLabel")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={course.progressPercent}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-muted">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-solid px-2.5 py-2">
            <CircleCheckBig size={14} aria-hidden="true" />
            {t("lessons", {
              completed: course.completedLessons,
              total: course.totalLessons,
            })}
          </span>
          {!compact ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-solid px-2.5 py-2">
              <Layers3 size={14} aria-hidden="true" />
              {t("modules", { count: course.publishedModuleCount })}
            </span>
          ) : null}
        </div>

        <div className="mt-auto pt-4">
          {course.accessAvailable ? (
            <Link
              href={`/${locale}/student/learn/${course.courseId}`}
              aria-label={t("courseActionLabel", {
                action,
                title: course.localizedTitle,
              })}
              className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-black text-slate-950"
            >
              {action}
              <ArrowUpRight
                size={16}
                className="rtl:-scale-x-100"
                aria-hidden="true"
              />
            </Link>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-bold text-muted"
              aria-disabled="true"
            >
              <LockKeyhole size={16} aria-hidden="true" />
              {accessMessage}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
