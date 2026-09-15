"use client";

import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BookOpen,
  Image as ImageIcon,
  ImageOff,
  Layers3,
  Plus,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

type CourseStatus =
  | "Draft"
  | "SubmittedForReview"
  | "Approved"
  | "Rejected"
  | "Published"
  | "Archived"
  | "Scheduled";

export type TeacherCourse = {
  id: string;
  arabicTitle: string;
  englishTitle: string;
  status: CourseStatus;
  price: number;
  isFree: boolean;
  hasCover: boolean;
  moduleCount: number;
  lessonCount: number;
};

type CourseFilter =
  "All" | "Draft" | "SubmittedForReview" | "Published" | "Rejected";

type CourseSort = "title" | "status" | "content";

const courseFilters: CourseFilter[] = [
  "All",
  "Draft",
  "SubmittedForReview",
  "Published",
  "Rejected",
];

const statusOrder: Record<CourseStatus, number> = {
  Draft: 0,
  Rejected: 1,
  SubmittedForReview: 2,
  Approved: 3,
  Scheduled: 4,
  Published: 5,
  Archived: 6,
};

const emptyFilterKey: Record<Exclude<CourseFilter, "All">, string> = {
  Draft: "draft",
  SubmittedForReview: "submittedForReview",
  Published: "published",
  Rejected: "rejected",
};

function localizedTitle(course: TeacherCourse, locale: string) {
  return locale === "ar" ? course.arabicTitle : course.englishTitle;
}

function isEditable(course: TeacherCourse) {
  return course.status === "Draft" || course.status === "Rejected";
}

export function TeacherCoursesManagement() {
  const locale = useLocale();
  const t = useTranslations("teacherCoursesManagement");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CourseFilter>("All");
  const [sort, setSort] = useState<CourseSort>("title");
  const result = useQuery({
    queryKey: ["teacher-courses"],
    queryFn: () => api<TeacherCourse[]>("/teacher/courses"),
  });
  const collator = useMemo(
    () => new Intl.Collator(locale, { sensitivity: "base", numeric: true }),
    [locale],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleCourses = useMemo(() => {
    const matching = (result.data ?? []).filter((course) => {
      const matchesFilter = filter === "All" || course.status === filter;
      const matchesSearch =
        !normalizedSearch ||
        [course.arabicTitle, course.englishTitle].some((title) =>
          title.toLocaleLowerCase().includes(normalizedSearch),
        );
      return matchesFilter && matchesSearch;
    });

    return matching.sort((left, right) => {
      const titleComparison = collator.compare(
        localizedTitle(left, locale),
        localizedTitle(right, locale),
      );
      if (sort === "status") {
        const statusComparison =
          statusOrder[left.status] - statusOrder[right.status];
        return (
          statusComparison || titleComparison || left.id.localeCompare(right.id)
        );
      }
      if (sort === "content") {
        const leftContent = left.moduleCount + left.lessonCount;
        const rightContent = right.moduleCount + right.lessonCount;
        return (
          rightContent - leftContent ||
          titleComparison ||
          left.id.localeCompare(right.id)
        );
      }
      return titleComparison || left.id.localeCompare(right.id);
    });
  }, [collator, filter, locale, normalizedSearch, result.data, sort]);

  const priceFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === "ar" ? "ar-JO" : "en-JO", {
        style: "currency",
        currency: "JOD",
      }),
    [locale],
  );

  if (result.isPending) {
    return (
      <div className="card p-5 text-sm text-muted" aria-busy="true">
        {t("loading")}
      </div>
    );
  }

  if (result.isError) {
    return (
      <div className="card p-5" role="alert">
        <p className="text-sm text-muted">{t("loadError")}</p>
        <button
          type="button"
          className="focus-ring mt-3 rounded-xl border border-border px-4 py-2 text-sm font-bold text-foreground"
          onClick={() => void result.refetch()}
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  const courses = result.data;

  return (
    <section
      className="min-w-0"
      dir={locale === "ar" ? "rtl" : "ltr"}
      aria-labelledby="teacher-courses-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="teacher-courses-heading" className="text-xl font-black">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("description")}</p>
        </div>
        <Link
          href={`/${locale}/teacher/courses/new`}
          className="focus-ring inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-slate-950"
        >
          <Plus size={18} aria-hidden="true" />
          {t("addCourse")}
        </Link>
      </div>

      {!courses.length ? (
        <div className="card mt-5 p-5 text-sm text-muted">
          <p>{t("empty.noCourses")}</p>
          <Link
            href={`/${locale}/teacher/courses/new`}
            className="focus-ring mt-3 inline-flex items-center gap-2 font-bold text-primary underline"
          >
            <Plus size={16} aria-hidden="true" />
            {t("addCourse")}
          </Link>
        </div>
      ) : (
        <>
          <div className="card mt-5 p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,0.35fr)] lg:items-end">
              <div>
                <label
                  htmlFor="teacher-course-search"
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
                    id="teacher-course-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("searchPlaceholder")}
                    className="focus-ring min-w-0 flex-1 border-0 bg-transparent px-1 py-3 text-sm text-foreground outline-none"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
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
                  htmlFor="teacher-course-sort"
                  className="text-sm font-bold text-foreground"
                >
                  {t("sortLabel")}
                </label>
                <select
                  id="teacher-course-sort"
                  value={sort}
                  onChange={(event) =>
                    setSort(event.target.value as CourseSort)
                  }
                  className="focus-ring mt-2 w-full rounded-xl border border-border bg-surface-solid px-3 py-3 text-sm font-semibold text-foreground"
                >
                  <option value="title">{t("sort.title")}</option>
                  <option value="status">{t("sort.status")}</option>
                  <option value="content">{t("sort.content")}</option>
                </select>
              </div>
            </div>

            <div
              className="mt-4 flex flex-wrap gap-2"
              role="group"
              aria-label={t("filterLabel")}
            >
              {courseFilters.map((value) => {
                const active = filter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(value)}
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
              {t("results", {
                visible: visibleCourses.length,
                total: courses.length,
              })}
            </p>
          </div>

          {visibleCourses.length ? (
            <ul
              className="mt-4 grid min-w-0 gap-4 md:grid-cols-2"
              aria-label={t("courseListLabel")}
            >
              {visibleCourses.map((course) => {
                const title = localizedTitle(course, locale);
                const editable = isEditable(course);
                const action = editable ? t("edit") : t("view");
                return (
                  <li key={course.id} className="min-w-0">
                    <Link
                      href={`/${locale}/teacher/courses/${course.id}`}
                      aria-label={t("courseActionLabel", { action, title })}
                      className="card focus-ring group flex h-full min-w-0 flex-col p-5"
                      data-interactive
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="break-words font-black text-foreground">
                            {title}
                          </h3>
                          <span className="mt-2 inline-flex rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                            {t(`statuses.${course.status}`)}
                          </span>
                        </div>
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                          {course.hasCover ? (
                            <ImageIcon size={20} aria-hidden="true" />
                          ) : (
                            <ImageOff size={20} aria-hidden="true" />
                          )}
                        </span>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-muted">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-solid px-2.5 py-2">
                          <Layers3 size={15} aria-hidden="true" />
                          {t("modules", { count: course.moduleCount })}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-solid px-2.5 py-2">
                          <BookOpen size={15} aria-hidden="true" />
                          {t("lessons", { count: course.lessonCount })}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
                        <span>
                          {course.isFree
                            ? t("free")
                            : `${t("paid")} · ${priceFormatter.format(course.price)}`}
                        </span>
                        <span>
                          {course.hasCover ? t("coverReady") : t("noCover")}
                        </span>
                      </div>

                      <span className="mt-5 inline-flex items-center gap-1.5 self-start font-black text-primary">
                        {action}
                        <ArrowUpRight
                          size={17}
                          className="rtl:-scale-x-100"
                          aria-hidden="true"
                        />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="card mt-4 p-6 text-center">
              <p className="font-bold text-foreground">
                {normalizedSearch
                  ? t("empty.noSearchResults")
                  : filter === "All"
                    ? t("empty.noCourses")
                    : t(`empty.${emptyFilterKey[filter]}`)}
              </p>
              {normalizedSearch && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="focus-ring mt-3 rounded-xl border border-border px-4 py-2 text-sm font-bold text-primary"
                >
                  {t("showAllCourses")}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
