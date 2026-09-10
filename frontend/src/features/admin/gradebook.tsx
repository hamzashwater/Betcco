"use client";

import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useLocale } from "next-intl";
import { useMemo, useState } from "react";

type GradebookFilters = {
  courses: { id: string; title: string }[];
  units: { id: string; courseId: string; title: string }[];
  teachers: { id: string; displayName: string }[];
  students: { id: string; displayName: string }[];
};

type GradebookPage = {
  total: number;
  page: number;
  pageSize: number;
  rows: {
    submissionId: string;
    courseId: string;
    courseTitle: string;
    unitId?: string;
    unitTitle?: string;
    teacherUserId: string;
    teacherName: string;
    studentUserId: string;
    studentName: string;
    assignmentTitle: string;
    status: string;
    grade?: string;
    submittedAtUtc?: string;
    gradedAtUtc?: string;
  }[];
};

type FilterState = {
  courseId: string;
  unitId: string;
  teacherUserId: string;
  studentUserId: string;
  status: string;
  grade: string;
  fromUtc: string;
  toUtc: string;
  search: string;
};

const emptyFilters: FilterState = {
  courseId: "",
  unitId: "",
  teacherUserId: "",
  studentUserId: "",
  status: "",
  grade: "",
  fromUtc: "",
  toUtc: "",
  search: "",
};

export function AdminGradebook() {
  const locale = useLocale();
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [applied, setApplied] = useState<FilterState>(emptyFilters);
  const [page, setPage] = useState(1);
  const options = useQuery({
    queryKey: ["admin-gradebook-filters", locale],
    queryFn: () =>
      api<GradebookFilters>(`/admin/gradebook/filters?locale=${locale}`),
  });
  const params = useMemo(() => {
    const value = new URLSearchParams({
      locale,
      page: String(page),
      pageSize: "25",
    });
    Object.entries(applied).forEach(([key, filter]) => {
      if (!filter) return;
      if (key === "fromUtc" || key === "toUtc") {
        value.set(key, new Date(filter).toISOString());
      } else value.set(key, filter);
    });
    return value.toString();
  }, [applied, locale, page]);
  const result = useQuery({
    queryKey: ["admin-gradebook", params],
    queryFn: () => api<GradebookPage>(`/admin/gradebook?${params}`),
    placeholderData: (previous) => previous,
  });
  const filteredUnits = (options.data?.units ?? []).filter(
    (unit) => !filters.courseId || unit.courseId === filters.courseId,
  );
  const pageCount = result.data
    ? Math.max(1, Math.ceil(result.data.total / result.data.pageSize))
    : 1;
  const update = (key: keyof FilterState, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "courseId" ? { unitId: "" } : {}),
    }));
  };
  const formatDate = (value?: string) =>
    value
      ? new Date(value).toLocaleString(locale === "ar" ? "ar-JO" : "en-US")
      : "—";
  return (
    <section className="shell py-10">
      <header className="card p-6 sm:p-8">
        <span className="grid size-11 place-items-center rounded-2xl bg-secondary/15 text-secondary">
          <BookOpenCheck size={21} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          {locale === "ar" ? "دفتر الدرجات المركزي" : "Central gradebook"}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
          {locale === "ar"
            ? "نتائج الواجبات محسوبة على الخادم من المعايير؛ استخدم الفلاتر للمراجعة فقط ولا يمكن تعديل الدرجة من هذه الصفحة."
            : "Coursework results are calculated on the server from criteria. Use filters for review only; grades cannot be edited here."}
        </p>
      </header>
      <form
        className="card mt-6 grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setApplied(filters);
        }}
      >
        <FilterSelect
          label={locale === "ar" ? "الدورة" : "Course"}
          value={filters.courseId}
          onChange={(value) => update("courseId", value)}
          options={options.data?.courses ?? []}
        />
        <FilterSelect
          label={locale === "ar" ? "الوحدة" : "Unit"}
          value={filters.unitId}
          onChange={(value) => update("unitId", value)}
          options={filteredUnits}
          disabled={options.isPending}
        />
        <FilterSelect
          label={locale === "ar" ? "المعلم" : "Teacher"}
          value={filters.teacherUserId}
          onChange={(value) => update("teacherUserId", value)}
          options={(options.data?.teachers ?? []).map((item) => ({
            id: item.id,
            title: item.displayName,
          }))}
        />
        <FilterSelect
          label={locale === "ar" ? "الطالب" : "Student"}
          value={filters.studentUserId}
          onChange={(value) => update("studentUserId", value)}
          options={(options.data?.students ?? []).map((item) => ({
            id: item.id,
            title: item.displayName,
          }))}
        />
        <FilterSelect
          label={locale === "ar" ? "حالة التسليم" : "Submission status"}
          value={filters.status}
          onChange={(value) => update("status", value)}
          options={[
            "Draft",
            "Submitted",
            "NeedsRevision",
            "Graded",
            "Finalized",
          ].map((id) => ({ id, title: id }))}
        />
        <FilterSelect
          label={locale === "ar" ? "النتيجة" : "Grade"}
          value={filters.grade}
          onChange={(value) => update("grade", value)}
          options={["NotYetAchieved", "Pass", "Merit", "Distinction"].map(
            (id) => ({ id, title: id }),
          )}
        />
        <label className="grid gap-1 text-xs font-bold text-muted">
          {locale === "ar" ? "من تاريخ" : "From date"}
          <input
            type="datetime-local"
            value={filters.fromUtc}
            onChange={(event) => update("fromUtc", event.target.value)}
            className="rounded-xl border border-border bg-transparent p-2.5 text-sm text-foreground"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          {locale === "ar" ? "إلى تاريخ" : "To date"}
          <input
            type="datetime-local"
            value={filters.toUtc}
            onChange={(event) => update("toUtc", event.target.value)}
            className="rounded-xl border border-border bg-transparent p-2.5 text-sm text-foreground"
          />
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-border px-3 md:col-span-2 xl:col-span-3">
          <Search size={17} className="text-muted" aria-hidden="true" />
          <input
            value={filters.search}
            onChange={(event) => update("search", event.target.value)}
            placeholder={
              locale === "ar"
                ? "ابحث باسم الطالب أو المعلم أو الواجب"
                : "Search student, teacher, or coursework"
            }
            className="min-w-0 flex-1 border-0 bg-transparent py-3 text-sm text-foreground outline-none"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="focus-ring rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950"
          >
            {locale === "ar" ? "تطبيق الفلاتر" : "Apply filters"}
          </button>
          <button
            type="button"
            onClick={() => {
              setFilters(emptyFilters);
              setApplied(emptyFilters);
              setPage(1);
            }}
            className="focus-ring rounded-xl border border-border px-3 py-2.5 text-sm font-bold text-muted"
          >
            {locale === "ar" ? "مسح" : "Clear"}
          </button>
        </div>
      </form>
      {result.isPending ? (
        <div className="card mt-6 p-6" aria-busy>
          …
        </div>
      ) : result.isError ? (
        <p className="card mt-6 p-6 text-sm text-red-400" role="alert">
          {locale === "ar"
            ? "تعذر تحميل دفتر الدرجات."
            : "Unable to load the gradebook."}
        </p>
      ) : !result.data?.rows.length ? (
        <p className="card mt-6 p-6 text-sm text-muted">
          {locale === "ar"
            ? "لا توجد نتائج مطابقة للفلاتر."
            : "No results match these filters."}
        </p>
      ) : (
        <>
          <div className="card mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-page/55 text-start text-xs text-muted">
                <tr>
                  {[
                    locale === "ar" ? "الطالب" : "Student",
                    locale === "ar" ? "المعلم" : "Teacher",
                    locale === "ar" ? "الدورة / الوحدة" : "Course / unit",
                    locale === "ar" ? "المهمة" : "Coursework",
                    locale === "ar" ? "الحالة" : "Status",
                    locale === "ar" ? "النتيجة" : "Grade",
                    locale === "ar" ? "التاريخ" : "Date",
                  ].map((label) => (
                    <th
                      key={label}
                      className="whitespace-nowrap px-3 py-3 font-black"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.data.rows.map((row) => (
                  <tr
                    key={row.submissionId}
                    className="border-t border-border/65"
                  >
                    <td className="px-3 py-3 font-bold">{row.studentName}</td>
                    <td className="px-3 py-3 text-muted">{row.teacherName}</td>
                    <td className="px-3 py-3">
                      <strong>{row.courseTitle}</strong>
                      {row.unitTitle ? (
                        <p className="mt-1 text-xs text-muted">
                          {row.unitTitle}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {row.assignmentTitle}
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-page px-2.5 py-1 text-xs font-bold">
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-black text-secondary">
                      {row.grade ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted">
                      {formatDate(row.gradedAtUtc ?? row.submittedAtUtc)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav
            className="mt-5 flex items-center justify-between gap-3"
            aria-label={locale === "ar" ? "ترقيم الصفحات" : "Pagination"}
          >
            <p className="text-sm text-muted">
              {result.data.total} {locale === "ar" ? "نتيجة" : "results"}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || result.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="focus-ring inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm font-bold disabled:opacity-50"
              >
                <ChevronLeft size={16} aria-hidden="true" />
                {locale === "ar" ? "السابق" : "Previous"}
              </button>
              <span className="text-sm font-bold text-muted">
                {page} / {pageCount}
              </span>
              <button
                type="button"
                disabled={page >= pageCount || result.isFetching}
                onClick={() =>
                  setPage((current) => Math.min(pageCount, current + 1))
                }
                className="focus-ring inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm font-bold disabled:opacity-50"
              >
                {locale === "ar" ? "التالي" : "Next"}
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; title: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs font-bold text-muted">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="rounded-xl border border-border bg-transparent p-2.5 text-sm text-foreground disabled:opacity-50"
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.title}
          </option>
        ))}
      </select>
    </label>
  );
}
