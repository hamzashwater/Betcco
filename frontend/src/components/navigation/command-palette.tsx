"use client";

import { api } from "@/lib/api";
import type { CourseSummary, PagedResult } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Compass, Home, Search, X } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type PaletteItem = {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon: typeof Home;
};

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const locale = useLocale();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const result = useQuery({
    queryKey: ["command-course-search", locale, term],
    queryFn: () =>
      api<PagedResult<CourseSummary>>(
        `/catalog/courses?${new URLSearchParams({ locale, search: term, pageSize: "5" })}`,
      ),
    enabled: open && term.trim().length >= 2,
    staleTime: 15_000,
  });

  const navigation = useMemo<PaletteItem[]>(
    () => [
      {
        id: "home",
        label: locale === "ar" ? "الرئيسية" : "Home",
        href: `/${locale}`,
        icon: Home,
      },
      {
        id: "courses",
        label: locale === "ar" ? "استكشف الدورات" : "Browse courses",
        href: `/${locale}/courses`,
        icon: BookOpen,
      },
      {
        id: "tracks",
        label:
          locale === "ar" ? "المسارات والتخصصات" : "Tracks and specializations",
        href: `/${locale}/tracks`,
        icon: Compass,
      },
    ],
    [locale],
  );
  const courseItems = (result.data?.items ?? []).map<PaletteItem>((course) => ({
    id: course.id,
    label: course.title,
    hint: course.track,
    href: `/${locale}/courses/${course.slug}`,
    icon: BookOpen,
  }));
  const items = term.trim().length >= 2 ? courseItems : navigation;

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => input.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const select = (item: PaletteItem) => {
    router.push(item.href);
    onClose();
  };
  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-start bg-slate-950/65 px-4 pt-[12vh] backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={locale === "ar" ? "البحث السريع" : "Quick search"}
        className="glass-panel w-full max-w-2xl overflow-hidden rounded-2xl"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) =>
              Math.min(index + 1, Math.max(0, items.length - 1)),
            );
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          }
          if (event.key === "Enter" && items[activeIndex]) {
            event.preventDefault();
            select(items[activeIndex]);
          }
        }}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="text-primary" size={20} aria-hidden="true" />
          <input
            ref={input}
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setActiveIndex(0);
            }}
            placeholder={
              locale === "ar"
                ? "ابحث عن دورة أو انتقل إلى صفحة…"
                : "Search courses or jump to a page…"
            }
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg p-2 text-muted hover:text-foreground"
            aria-label={locale === "ar" ? "إغلاق البحث" : "Close search"}
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {result.isPending && (
            <p className="px-3 py-5 text-sm text-muted">
              {locale === "ar" ? "جارٍ البحث…" : "Searching…"}
            </p>
          )}
          {!result.isPending &&
            items.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  key={item.id}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => select(item)}
                  className={`focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-sm ${index === activeIndex ? "bg-primary/15 text-foreground" : "text-muted hover:bg-white/5"}`}
                >
                  <Icon size={18} className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {item.label}
                  </span>
                  {item.hint && (
                    <span className="truncate text-xs text-muted">
                      {item.hint}
                    </span>
                  )}
                  <ArrowLeft
                    size={16}
                    className="shrink-0 text-muted rtl:rotate-180"
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          {!result.isPending && term.trim().length >= 2 && !items.length && (
            <p className="px-3 py-5 text-sm text-muted">
              {locale === "ar"
                ? "لم نجد دورات مطابقة."
                : "No matching courses found."}
            </p>
          )}
        </div>
        <p className="border-t border-border px-4 py-2 text-xs text-muted">
          {locale === "ar"
            ? "↑↓ للتنقل · Enter للفتح · Esc للإغلاق"
            : "↑↓ to navigate · Enter to open · Esc to close"}
        </p>
      </section>
    </div>
  );
}
