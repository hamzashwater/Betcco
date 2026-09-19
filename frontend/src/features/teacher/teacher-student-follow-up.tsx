"use client";

import { DashboardHeader } from "@/components/dashboard/dashboard-ui";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

export type AttentionLevel = "High" | "Medium";
export type FollowUpReason =
  "LowProgress" | "MissedAssignments" | "LowQuizScore" | "Inactive14Days";
type AttentionFilter = "All" | AttentionLevel;
type ReasonFilter = "All" | FollowUpReason;
type FollowUpSort =
  | "priority"
  | "progress"
  | "missedAssignments"
  | "quizAverage"
  | "lastActivity";

export type TeacherFollowUpStudent = {
  studentUserId: string;
  studentName: string;
  riskLevel: AttentionLevel;
  reasons: FollowUpReason[];
  progressPercent: number;
  missedAssignments: number;
  averageQuizScore?: number | null;
  lastActiveAtUtc?: string | null;
};

export type TeacherAnalytics = {
  courses: number;
  students: number;
  pendingReviews: number;
  quizAttempts: number;
  averageQuizScore: number;
  averageLessonProgress: number;
  studentsAtRisk: TeacherFollowUpStudent[];
  studentsAtRiskCount: number;
  filteredStudentsAtRiskCount?: number;
  page?: number;
  pageSize?: number;
};

const attentionFilters: AttentionFilter[] = ["All", "High", "Medium"];
const reasonFilters: FollowUpReason[] = [
  "LowProgress",
  "MissedAssignments",
  "LowQuizScore",
  "Inactive14Days",
];
const pageSize = 10;

export function TeacherStudentFollowUp() {
  const locale = useLocale();
  const t = useTranslations("teacherStudentFollowUp");
  const [search, setSearch] = useState("");
  const [attention, setAttention] = useState<AttentionFilter>("All");
  const [reason, setReason] = useState<ReasonFilter>("All");
  const [sort, setSort] = useState<FollowUpSort>("priority");
  const [page, setPage] = useState(1);
  const normalizedSearch = search.trim();
  const queryPath = useMemo(() => {
    const query = new URLSearchParams({
      followUp: "true",
      page: String(page),
      pageSize: String(pageSize),
      sort,
    });
    if (normalizedSearch) query.set("search", normalizedSearch);
    if (attention !== "All") query.set("attention", attention);
    if (reason !== "All") query.set("reason", reason);
    return `/teacher/analytics?${query.toString()}`;
  }, [attention, normalizedSearch, page, reason, sort]);
  const result = useQuery({
    queryKey: [
      "teacher-analytics-follow-up",
      page,
      normalizedSearch,
      attention,
      reason,
      sort,
    ],
    queryFn: () => api<TeacherAnalytics>(queryPath),
  });
  const filteredCount = result.data?.filteredStudentsAtRiskCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const from = filteredCount ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, filteredCount);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en-JO", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  const resetFilters = () => {
    setSearch("");
    setAttention("All");
    setReason("All");
    setSort("priority");
    setPage(1);
  };

  return (
    <section className="shell py-10" dir={locale === "ar" ? "rtl" : "ltr"}>
      <DashboardHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <div
        className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-foreground"
        role="note"
      >
        <AlertTriangle
          size={20}
          className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300"
          aria-hidden="true"
        />
        <p>{t("disclaimer")}</p>
      </div>

      <div className="card mt-5 p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,0.4fr)_minmax(13rem,0.4fr)] lg:items-end">
          <div>
            <label
              htmlFor="teacher-student-search"
              className="text-sm font-bold text-foreground"
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
                id="teacher-student-search"
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={t("searchPlaceholder")}
                className="focus-ring min-w-0 flex-1 border-0 bg-transparent px-1 py-3 text-sm text-foreground outline-none"
              />
              {search && (
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
              )}
            </div>
          </div>
          <div>
            <label
              htmlFor="teacher-student-reason"
              className="text-sm font-bold text-foreground"
            >
              {t("reasonFilterLabel")}
            </label>
            <select
              id="teacher-student-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value as ReasonFilter);
                setPage(1);
              }}
              className="focus-ring mt-2 w-full rounded-xl border border-border bg-surface-solid px-3 py-3 text-sm font-semibold text-foreground"
            >
              <option value="All">{t("reasons.All")}</option>
              {reasonFilters.map((value) => (
                <option key={value} value={value}>
                  {t(`reasons.${value}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="teacher-student-sort"
              className="text-sm font-bold text-foreground"
            >
              {t("sortLabel")}
            </label>
            <select
              id="teacher-student-sort"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as FollowUpSort);
                setPage(1);
              }}
              className="focus-ring mt-2 w-full rounded-xl border border-border bg-surface-solid px-3 py-3 text-sm font-semibold text-foreground"
            >
              <option value="priority">{t("sort.priority")}</option>
              <option value="progress">{t("sort.progress")}</option>
              <option value="missedAssignments">
                {t("sort.missedAssignments")}
              </option>
              <option value="quizAverage">{t("sort.quizAverage")}</option>
              <option value="lastActivity">{t("sort.lastActivity")}</option>
            </select>
          </div>
        </div>

        <div
          className="mt-4 flex flex-wrap gap-2"
          role="group"
          aria-label={t("attentionFilterLabel")}
        >
          {attentionFilters.map((value) => {
            const active = attention === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setAttention(value);
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
      </div>

      <div aria-live="polite" aria-busy={result.isPending}>
        {result.isPending ? (
          <div className="card mt-4 p-6 text-sm text-muted">{t("loading")}</div>
        ) : result.isError ? (
          <div className="card mt-4 p-6" role="alert">
            <p className="text-sm text-muted">{t("loadError")}</p>
            <button
              type="button"
              onClick={() => void result.refetch()}
              className="focus-ring mt-3 rounded-xl border border-border px-4 py-2 text-sm font-bold text-primary"
            >
              {t("retry")}
            </button>
          </div>
        ) : result.data.studentsAtRisk.length ? (
          <>
            <p className="mt-4 text-sm font-semibold text-muted">
              {t("results", { from, to, count: filteredCount })}
            </p>
            <ul
              className="mt-3 grid min-w-0 gap-4 lg:grid-cols-2"
              aria-label={t("studentListLabel")}
            >
              {result.data.studentsAtRisk.map((student) => (
                <li key={student.studentUserId} className="min-w-0">
                  <article
                    className="card h-full min-w-0 p-5"
                    data-risk-level={student.riskLevel}
                  >
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                      <h2 className="min-w-0 break-words text-lg font-black text-foreground">
                        {student.studentName}
                      </h2>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${
                          student.riskLevel === "High"
                            ? "bg-red-500/15 text-red-600 dark:text-red-300"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {t(`attention.${student.riskLevel}`)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {student.reasons.map((value) => (
                        <span
                          key={value}
                          className="rounded-full border border-border px-2 py-1 text-xs text-muted"
                        >
                          {t(`reasons.${value}`)}
                        </span>
                      ))}
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <StudentMetric
                        label={t("fields.progress")}
                        value={`${student.progressPercent}%`}
                      />
                      <StudentMetric
                        label={t("fields.missedAssignments")}
                        value={String(student.missedAssignments)}
                      />
                      <StudentMetric
                        label={t("fields.quizAverage")}
                        value={
                          student.averageQuizScore == null
                            ? t("unavailable")
                            : `${student.averageQuizScore}%`
                        }
                      />
                      <StudentMetric
                        label={t("fields.lastActivity")}
                        value={
                          student.lastActiveAtUtc
                            ? dateFormatter.format(
                                new Date(student.lastActiveAtUtc),
                              )
                            : t("unavailable")
                        }
                      />
                    </dl>
                  </article>
                </li>
              ))}
            </ul>
            <nav
              className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-4"
              aria-label={t("paginationLabel")}
            >
              <button
                type="button"
                disabled={page <= 1 || result.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="focus-ring inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-bold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft
                  size={17}
                  className="rtl:-scale-x-100"
                  aria-hidden="true"
                />
                {t("previous")}
              </button>
              <span
                className="text-sm font-bold text-muted"
                aria-current="page"
              >
                {t("currentPage", { page, totalPages })}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || result.isFetching}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                className="focus-ring inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-bold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("next")}
                <ChevronRight
                  size={17}
                  className="rtl:-scale-x-100"
                  aria-hidden="true"
                />
              </button>
            </nav>
          </>
        ) : (
          <EmptyState
            message={
              result.data.studentsAtRiskCount === 0
                ? t("empty.noFollowUp")
                : normalizedSearch
                  ? t("empty.noSearch")
                  : attention !== "All"
                    ? t("empty.noAttention")
                    : reason !== "All"
                      ? t("empty.noReason")
                      : t("empty.noResults")
            }
            resetLabel={t("reset")}
            onReset={resetFilters}
            showReset={
              Boolean(normalizedSearch) ||
              attention !== "All" ||
              reason !== "All" ||
              sort !== "priority"
            }
          />
        )}
      </div>
    </section>
  );
}

export function TeacherFollowUpPreview({
  pending,
  students,
  totalCount,
}: {
  pending: boolean;
  students: TeacherFollowUpStudent[];
  totalCount: number;
}) {
  const locale = useLocale();
  const t = useTranslations("teacherStudentFollowUp");
  const preview = students.slice(0, 4);
  return (
    <section
      className="card mt-5 p-5"
      aria-labelledby="teacher-follow-up-preview-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300">
            <AlertTriangle size={20} aria-hidden="true" />
          </span>
          <div>
            <h2
              id="teacher-follow-up-preview-heading"
              className="font-black text-foreground"
            >
              {t("dashboardTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {t("dashboardDescription")}
            </p>
          </div>
        </div>
        <Link
          href={`/${locale}/teacher/students`}
          className="focus-ring inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-black text-primary hover:bg-primary/10"
        >
          {t("viewAll")}
          <ArrowUpRight
            size={17}
            className="rtl:-scale-x-100"
            aria-hidden="true"
          />
        </Link>
      </div>
      {pending ? (
        <p className="mt-4 text-sm text-muted" aria-busy="true">
          {t("loading")}
        </p>
      ) : preview.length ? (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {preview.map((student) => (
            <li
              key={student.studentUserId}
              className="rounded-xl border border-border bg-white/5 p-4"
              data-risk-level={student.riskLevel}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 break-words font-black text-foreground">
                  {student.studentName}
                </p>
                <span className="shrink-0 text-xs font-black text-amber-700 dark:text-amber-300">
                  {t(`attention.${student.riskLevel}`)}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted">
                {t("previewProgress", {
                  progress: student.progressPercent,
                })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted">
          {t("empty.noFollowUp")}
        </p>
      )}
      {!pending && totalCount > preview.length ? (
        <p className="mt-3 text-xs font-semibold text-muted">
          {t("previewCount", {
            visible: preview.length,
            total: totalCount,
          })}
        </p>
      ) : null}
    </section>
  );
}

function StudentMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-solid p-3">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-1 break-words font-black text-foreground">{value}</dd>
    </div>
  );
}

function EmptyState({
  message,
  resetLabel,
  onReset,
  showReset,
}: {
  message: string;
  resetLabel: string;
  onReset: () => void;
  showReset: boolean;
}) {
  return (
    <div className="card mt-4 p-6 text-center">
      <p className="font-bold text-foreground">{message}</p>
      {showReset ? (
        <button
          type="button"
          onClick={onReset}
          className="focus-ring mt-3 rounded-xl border border-border px-4 py-2 text-sm font-bold text-primary"
        >
          {resetLabel}
        </button>
      ) : null}
    </div>
  );
}
