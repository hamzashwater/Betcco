"use client";

import { CatalogGrid } from "@/features/courses/catalog-grid";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal, X } from "lucide-react";
import Image from "next/image";
import { useLocale } from "next-intl";
import { useDeferredValue, useState } from "react";

type Taxonomy = {
  tracks: { id: string; slug: string; name: string }[];
  grades: { id: string; learningTrackId: string; slug: string; name: string }[];
  specializations: {
    id: string;
    learningTrackId: string;
    slug: string;
    name: string;
  }[];
  subjects: {
    id: string;
    specializationId?: string;
    slug: string;
    name: string;
  }[];
};

export default function CoursesPage() {
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    track: "",
    grade: "",
    specialization: "",
    subject: "",
    sort: "newest" as "newest" | "price-asc" | "price-desc",
  });
  const deferredSearch = useDeferredValue(search);
  const taxonomy = useQuery({
    queryKey: ["catalog-taxonomy", locale],
    queryFn: () => api<Taxonomy>(`/taxonomy?locale=${locale}`),
    staleTime: 60_000,
  });
  const activeTrack = taxonomy.data?.tracks.find(
    (track) => track.slug === filters.track,
  );
  const update = (changes: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, ...changes }));
  const hasFilters = Object.entries(filters).some(
    ([key, value]) => key !== "sort" && Boolean(value),
  );
  return (
    <section className="shell py-12">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_85%_15%,color-mix(in_srgb,var(--secondary)_30%,transparent),transparent_35%),linear-gradient(135deg,color-mix(in_srgb,var(--surface)_94%,transparent),color-mix(in_srgb,var(--surface-solid)_75%,transparent))] p-6 shadow-[var(--shadow)] sm:p-9">
        <Image
          src="/images/betcco/course-business.png"
          alt=""
          fill
          sizes="(max-width: 1180px) calc(100vw - 2rem), 1180px"
          className="object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(5,10,25,.92),rgba(5,10,25,.36))]" />
        <span className="absolute -end-14 -top-14 size-64 rounded-full border border-primary/20" />
        <div className="relative max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
            BETCCO Catalog
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            {locale === "ar" ? "اكتشف الدورات" : "Discover courses"}
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-muted">
            {locale === "ar"
              ? "ابحث في الدورات المنشورة، واختر المسار والتخصص المناسبين."
              : "Search published courses and select the track and specialization that fit you."}
          </p>
        </div>
      </div>
      <div className="card mt-6 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-w-[min(100%,22rem)] flex-1 items-center gap-3 rounded-xl border border-border bg-black/10 px-3 py-3">
            <Search
              size={18}
              className="shrink-0 text-primary"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={locale === "ar" ? "ابحث عن دورة" : "Search courses"}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </label>
          <div className="flex items-center gap-2 text-xs font-bold text-muted">
            <SlidersHorizontal
              size={16}
              className="text-primary"
              aria-hidden="true"
            />
            {locale === "ar"
              ? "فلترة من بيانات المنصة"
              : "Filter from platform data"}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            label={locale === "ar" ? "المسار" : "Track"}
            value={filters.track}
            onChange={(track) =>
              update({ track, grade: "", specialization: "", subject: "" })
            }
            options={uniqueOptions(
              (taxonomy.data?.tracks ?? []).map((item) => ({
                value: item.slug,
                label: item.name,
              })),
            )}
          />
          <FilterSelect
            label={locale === "ar" ? "الصف" : "Grade"}
            value={filters.grade}
            onChange={(grade) => update({ grade })}
            options={uniqueOptions(
              (taxonomy.data?.grades ?? [])
                .filter(
                  (item) =>
                    !activeTrack || item.learningTrackId === activeTrack.id,
                )
                .map((item) => ({ value: item.slug, label: item.name })),
            )}
          />
          <FilterSelect
            label={locale === "ar" ? "التخصص" : "Specialization"}
            value={filters.specialization}
            onChange={(specialization) =>
              update({ specialization, subject: "" })
            }
            options={uniqueOptions(
              (taxonomy.data?.specializations ?? [])
                .filter(
                  (item) =>
                    !activeTrack || item.learningTrackId === activeTrack.id,
                )
                .map((item) => ({ value: item.slug, label: item.name })),
            )}
          />
          <FilterSelect
            label={locale === "ar" ? "المادة" : "Subject"}
            value={filters.subject}
            onChange={(subject) => update({ subject })}
            options={uniqueOptions(
              (taxonomy.data?.subjects ?? [])
                .filter(
                  (item) =>
                    !filters.specialization ||
                    taxonomy.data?.specializations.find(
                      (specialization) =>
                        specialization.slug === filters.specialization,
                    )?.id === item.specializationId,
                )
                .map((item) => ({ value: item.slug, label: item.name })),
            )}
          />
          <FilterSelect
            label={locale === "ar" ? "الترتيب" : "Sort"}
            value={filters.sort}
            onChange={(sort) => update({ sort: sort as typeof filters.sort })}
            options={[
              { value: "newest", label: locale === "ar" ? "الأحدث" : "Newest" },
              {
                value: "price-asc",
                label:
                  locale === "ar" ? "السعر: الأقل أولًا" : "Price: low first",
              },
              {
                value: "price-desc",
                label:
                  locale === "ar" ? "السعر: الأعلى أولًا" : "Price: high first",
              },
            ]}
          />
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() =>
              update({ track: "", grade: "", specialization: "", subject: "" })
            }
            className="focus-ring mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary"
          >
            <X size={16} aria-hidden="true" />
            {locale === "ar" ? "مسح الفلاتر" : "Clear filters"}
          </button>
        )}
      </div>
      <div className="mt-7">
        <CatalogGrid
          search={deferredSearch}
          track={filters.track}
          grade={filters.grade}
          specialization={filters.specialization}
          subject={filters.subject}
          sort={filters.sort}
        />
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="grid gap-1.5 text-xs font-bold text-muted">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring min-h-11 rounded-xl border border-border bg-transparent px-3 text-sm text-foreground"
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function uniqueOptions(options: { value: string; label: string }[]) {
  return Array.from(
    new Map(options.map((option) => [option.value, option])).values(),
  );
}
