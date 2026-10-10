"use client";

import { Action } from "@/components/ui/action";
import { QueryState } from "@/components/ui/query-state";
import { useDialogFocus } from "./use-dialog-focus";
import { api } from "@/lib/api";
import type { CourseSummary, PagedResult } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Compass, Home, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

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
  const t = useTranslations();
  const palette = useTranslations("navigation.commandPalette");
  const dialog = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useDialogFocus(open, dialog, onClose, input);
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
        label: t("navigation.home"),
        href: `/${locale}`,
        icon: Home,
      },
      {
        id: "courses",
        label: palette("browseCourses"),
        href: `/${locale}/courses`,
        icon: BookOpen,
      },
      {
        id: "tracks",
        label: palette("tracks"),
        href: `/${locale}/tracks`,
        icon: Compass,
      },
    ],
    [locale, t, palette],
  );
  const courseItems = (result.data?.items ?? []).map<PaletteItem>((course) => ({
    id: course.id,
    label: course.title,
    hint: course.track,
    href: `/${locale}/courses/${course.slug}`,
    icon: BookOpen,
  }));
  const items = term.trim().length >= 2 ? courseItems : navigation;

  const searchRequested = term.trim().length >= 2;
  const searching = searchRequested && result.isPending;
  const failed = searchRequested && result.isError;

  if (!open) return null;

  const select = (item: PaletteItem) => {
    router.push(item.href);
    onClose();
  };
  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-start bg-slate-950/65 px-4 pt-[12vh]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={palette("label")}
        className="w-full max-w-2xl overflow-hidden rounded-region border border-border-default! bg-surface-overlay text-text-primary shadow-overlay"
        onKeyDown={(event) => {
          if (event.target !== input.current) return;
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
            aria-label={t("navigation.accessibility.searchCourses")}
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setActiveIndex(0);
            }}
            placeholder={palette("placeholder")}
            className="focus-ring min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted"
          />
          <Action
            variant="quiet"
            onClick={onClose}
            className="px-3!"
            aria-label={palette("close")}
          >
            <X size={18} aria-hidden="true" />
          </Action>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {searching && (
            <QueryState kind="loading" title={palette("searching")} />
          )}
          {failed && (
            <QueryState
              kind="error"
              title={t("navigation.accessibility.searchCourses")}
              action={
                <Action
                  variant="secondary"
                  onClick={() => void result.refetch()}
                  pending={result.isFetching}
                  pendingLabel={palette("searching")}
                >
                  {t("auth.accountProfile.retry")}
                </Action>
              }
            />
          )}
          {!searching &&
            !failed &&
            items.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  key={item.id}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => select(item)}
                  className={`focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-sm ${index === activeIndex ? "bg-surface-interactive text-text-primary" : "text-text-secondary hover:bg-surface-muted"}`}
                >
                  <Icon
                    size={18}
                    className="shrink-0 text-text-link"
                    aria-hidden="true"
                  />
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
                    className="shrink-0 text-text-muted ltr:rotate-180"
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          {!searching &&
            !failed &&
            searchRequested &&
            result.isSuccess &&
            !items.length && (
              <p className="px-3 py-5 text-sm text-muted">{palette("empty")}</p>
            )}
        </div>
        <p className="border-t border-border px-4 py-2 text-xs text-muted">
          {palette("keyboardHelp")}
        </p>
        <p className="sr-only" role="status">
          {!searching && !failed ? items[activeIndex]?.label : null}
        </p>
      </section>
    </div>
  );
}
