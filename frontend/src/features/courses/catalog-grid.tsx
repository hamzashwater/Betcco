"use client";

import { api } from "@/lib/api";
import type { CourseSummary, PagedResult } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { CourseCard } from "./course-card";

export function CatalogGrid({
  search,
  track,
  grade,
  specialization,
  subject,
  sort,
}: {
  search?: string;
  track?: string;
  grade?: string;
  specialization?: string;
  subject?: string;
  sort?: "newest" | "price-asc" | "price-desc";
}) {
  const locale = useLocale();
  const query = new URLSearchParams({ locale, pageSize: "12" });
  if (search) query.set("search", search);
  if (track) query.set("track", track);
  if (grade) query.set("grade", grade);
  if (specialization) query.set("specialization", specialization);
  if (subject) query.set("subject", subject);
  if (sort) query.set("sort", sort);
  const result = useQuery({
    queryKey: [
      "courses",
      locale,
      search,
      track,
      grade,
      specialization,
      subject,
      sort,
    ],
    queryFn: () => api<PagedResult<CourseSummary>>(`/catalog/courses?${query}`),
  });
  if (result.isPending)
    return (
      <div className="grid gap-4 md:grid-cols-3" aria-busy>
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-80 animate-pulse rounded-2xl bg-white/5"
          />
        ))}
      </div>
    );
  if (result.isError)
    return (
      <p role="alert" className="card p-5 text-sm text-muted">
        {locale === "ar"
          ? "تعذر تحميل الدورات. حاول مجددًا."
          : "Courses could not be loaded. Try again."}
      </p>
    );
  if (!result.data.items.length)
    return (
      <p className="card p-5 text-muted">
        {locale === "ar"
          ? "لا توجد دورات مطابقة حاليًا."
          : "No courses match your filters yet."}
      </p>
    );
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {result.data.items.map((course) => (
        <CourseCard key={course.id} course={course} />
      ))}
    </div>
  );
}
