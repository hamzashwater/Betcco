"use client";

import { Reveal, StaggerReveal } from "@/components/animation/reveal";
import { HomeHeroCarousel } from "@/components/home-hero-carousel";
import { HomeImageSections } from "@/components/home-image-sections";
import { CatalogGrid } from "@/features/courses/catalog-grid";
import { TrackCards } from "@/features/courses/track-cards";
import { api } from "@/lib/api";
import { useGSAP } from "@gsap/react";
import { useQuery } from "@tanstack/react-query";
import gsap from "gsap";
import {
  ArrowLeft,
  BookOpenCheck,
  ClipboardCheck,
  GraduationCap,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRef } from "react";

export default function HomePage() {
  const locale = useLocale();
  const t = useTranslations();
  const root = useRef<HTMLDivElement>(null);
  const summary = useQuery({
    queryKey: ["platform-summary"],
    queryFn: () =>
      api<{
        publishedCourses: number;
        publishedLessons: number;
        activeTeachers: number;
        enrolledStudents: number;
      }>("/platform/summary"),
    staleTime: 60_000,
  });
  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-hero]", {
        y: 18,
        duration: 0.55,
        stagger: 0.1,
        ease: "power2.out",
      });
    },
    { scope: root },
  );
  return (
    <div ref={root}>
      <section className="overflow-hidden py-16 md:py-24">
        <div className="shell grid items-center gap-10 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <p
              data-hero
              className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-black tracking-wide text-primary"
            >
              <GraduationCap size={15} aria-hidden="true" /> BETCCO · BTEC-first
            </p>
            <h1
              data-hero
              className="mt-5 max-w-3xl text-4xl font-black leading-[1.14] tracking-tight md:text-6xl"
            >
              {t("tagline")}
            </h1>
            <p
              data-hero
              className="mt-6 max-w-2xl text-lg leading-8 text-muted"
            >
              {t("hero")}
            </p>
            <div data-hero className="mt-8 flex flex-wrap gap-3">
              <Link
                className="premium-button focus-ring inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-slate-950"
                href={`/${locale}/courses`}
              >
                {t("browseCourses")}{" "}
                <ArrowLeft size={18} className="rtl:rotate-180" />
              </Link>
              <Link
                className="premium-button focus-ring rounded-xl border border-border bg-white/5 px-5 py-3 font-bold text-foreground"
                href={`/${locale}/student/evaluations/new`}
              >
                {t("evaluate")}
              </Link>
            </div>
          </div>
          <aside data-hero>
            <HomeHeroCarousel />
          </aside>
        </div>
        <StaggerReveal
          className="shell mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          aria-busy={summary.isPending}
          aria-live="polite"
        >
          {summary.isPending ? (
            Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-2xl bg-white/10"
              />
            ))
          ) : summary.isError ? (
            <div className="card col-span-full flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted">
              <span>
                {locale === "ar"
                  ? "تعذر تحميل إحصاءات المنصة الآن."
                  : "Platform statistics could not be loaded right now."}
              </span>
              <button
                type="button"
                className="focus-ring rounded-lg border border-primary/40 px-3 py-2 font-bold text-primary"
                onClick={() => void summary.refetch()}
              >
                {locale === "ar" ? "إعادة المحاولة" : "Try again"}
              </button>
            </div>
          ) : (
            <>
              <Stat
                icon={BookOpenCheck}
                value={summary.data?.publishedCourses}
                label={locale === "ar" ? "دورات منشورة" : "Published courses"}
              />
              <Stat
                icon={ClipboardCheck}
                value={summary.data?.publishedLessons}
                label={locale === "ar" ? "دروس متاحة" : "Available lessons"}
              />
              <Stat
                icon={GraduationCap}
                value={summary.data?.activeTeachers}
                label={locale === "ar" ? "معلمون نشطون" : "Active teachers"}
              />
              <Stat
                icon={UsersRound}
                value={summary.data?.enrolledStudents}
                label={locale === "ar" ? "طلاب مسجلون" : "Enrolled students"}
              />
            </>
          )}
        </StaggerReveal>
      </section>
      <Reveal className="shell py-14">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-sm font-bold text-primary">{t("tracks")}</p>
            <h2 className="mt-2 text-3xl font-black">
              {locale === "ar"
                ? "تعلّم في المسار المناسب لك"
                : "Learn in the track that fits you"}
            </h2>
          </div>
          <Link
            className="focus-ring text-sm font-semibold text-primary"
            href={`/${locale}/tracks`}
          >
            {locale === "ar" ? "كل المسارات" : "All tracks"}
          </Link>
        </div>
        <div className="mt-6">
          <TrackCards />
        </div>
      </Reveal>
      <Reveal className="shell pb-16">
        <p className="text-sm font-bold text-primary">{t("courses")}</p>
        <h2 className="mt-2 text-3xl font-black">
          {locale === "ar"
            ? "أحدث الدورات المنشورة"
            : "Latest published courses"}
        </h2>
        <div className="mt-6">
          <CatalogGrid />
        </div>
      </Reveal>
      <HomeImageSections />
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof BookOpenCheck;
  value?: number;
  label: string;
}) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <Icon size={19} className="text-primary" aria-hidden="true" />
      <p className="mt-3 text-2xl font-black">{value ?? "—"}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}
