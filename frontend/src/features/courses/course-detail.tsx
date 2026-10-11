"use client";

import { api } from "@/lib/api";
import { formatLocalizedCurrency } from "@/i18n/number-format";
import type { CourseDetail } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  GraduationCap,
  ListVideo,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getCourseVisual } from "@/lib/course-visuals";

export function CourseDetailView({ slug }: { slug: string }) {
  const locale = useLocale();
  const copy = useTranslations("publicDiscovery.detail");
  const navigation = useTranslations("navigation");
  const rootCopy = useTranslations();
  const router = useRouter();
  const client = useQueryClient();
  const [notice, setNotice] = useState<string>();
  const [previewLessonId, setPreviewLessonId] = useState<string>();
  const user = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api<{ roles: string[] }>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
  const isStudent = user.data?.roles.includes("Student") ?? false;
  const result = useQuery({
    queryKey: ["course", slug, locale],
    queryFn: () =>
      api<CourseDetail>(`/catalog/courses/${slug}?locale=${locale}`),
  });
  const preview = useQuery({
    queryKey: ["course-preview", slug, previewLessonId, locale],
    queryFn: () =>
      api<{
        id: string;
        title: string;
        body: string;
        type: string;
        durationSeconds: number;
        resources: {
          id: string;
          displayName: string;
          contentType: string;
          externalUrl?: string;
        }[];
      }>(
        `/catalog/courses/${slug}/preview/${previewLessonId}?locale=${locale}`,
      ),
    enabled: Boolean(previewLessonId),
  });
  const add = useMutation({
    mutationFn: (id: string) =>
      api<{ items: unknown[] }>(`/cart/courses/${id}?locale=${locale}`, {
        method: "POST",
      }),
    onSuccess: (cart) => {
      setNotice(copy("courseAddedToCart"));
      client.setQueryData(["cart", locale], cart);
      client.invalidateQueries({ queryKey: ["cart", locale] });
    },
    onError: (error) =>
      setNotice(
        error instanceof Error ? error.message : copy("unableToAddCourse"),
      ),
  });
  function addToCart(courseId: string) {
    if (user.isPending) return;
    if (!isStudent) {
      if (!user.data) {
        router.push(`/${locale}/login`);
        return;
      }
      setNotice(copy("purchasingIsAvailableToStudentAccountsOnly"));
      return;
    }
    add.mutate(courseId);
  }
  if (result.isPending)
    return (
      <section className="shell py-12">
        <div className="h-80 animate-pulse rounded-3xl bg-slate-200" />
      </section>
    );
  if (result.isError || !result.data)
    return (
      <section className="shell py-12">
        <p role="alert" className="card p-6">
          {copy("thisCourseIsUnavailable")}
        </p>
      </section>
    );
  const { course, outcomes, skills, modules } = result.data;
  const visual = getCourseVisual(course);
  return (
    <section className="shell py-10 md:py-14">
      <nav aria-label={copy("breadcrumb")} className="mb-6 text-sm text-muted">
        <Link className="focus-ring hover:text-primary" href={`/${locale}`}>
          {navigation("home")}
        </Link>
        <span className="px-2" aria-hidden="true">
          /
        </span>
        <Link
          className="focus-ring hover:text-primary"
          href={`/${locale}/courses`}
        >
          {rootCopy("courses")}
        </Link>
        <span className="px-2" aria-hidden="true">
          /
        </span>
        <span className="text-foreground">{course.title}</span>
      </nav>
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
            <Sparkles size={15} />
            {course.track}
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black leading-tight md:text-5xl">
            {course.title}
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-muted">
            {course.description}
          </p>
          <div className="relative mt-7 h-56 overflow-hidden rounded-2xl border border-border sm:h-72">
            <Image
              src={visual.src}
              alt=""
              fill
              sizes="(max-width: 1024px) calc(100vw - 2rem), 720px"
              className="object-cover"
              style={{ objectPosition: visual.objectPosition }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,10,25,.46),transparent_62%)]" />
          </div>
          <div className="glass-panel mt-7 flex flex-wrap gap-x-6 gap-y-3 rounded-2xl p-4 text-sm text-muted">
            <span className="inline-flex items-center gap-2">
              <ListVideo size={17} />
              {course.lessonCount} {copy("lessons")}
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock3 size={17} />
              {course.durationMinutes || "—"} {copy("min")}
            </span>
            {course.teacherName ? (
              <span className="inline-flex items-center gap-2">
                <GraduationCap size={17} />
                {copy("teacher")} {course.teacherName}
              </span>
            ) : null}
          </div>
          <nav
            aria-label={copy("courseSections")}
            className="sticky top-[4.5rem] z-20 mt-10 flex gap-2 overflow-x-auto border-y border-border bg-[color:var(--background)]/85 py-3 backdrop-blur"
          >
            <a
              className="focus-ring whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold text-primary hover:bg-primary/10"
              href="#overview"
            >
              {copy("overview")}
            </a>
            <a
              className="focus-ring whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold text-muted hover:text-foreground"
              href="#curriculum"
            >
              {copy("curriculum")}
            </a>
            <a
              className="focus-ring whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold text-muted hover:text-foreground"
              href="#skills"
            >
              {copy("skills")}
            </a>
          </nav>
          <div
            id="overview"
            className="mt-10 grid scroll-mt-28 gap-7 md:grid-cols-2"
          >
            <div className="glass-panel rounded-2xl p-5">
              <h2 className="text-xl font-black">{copy("whatYouWillLearn")}</h2>
              <ul className="mt-3 space-y-3">
                {outcomes.map((item) => (
                  <li key={item.english} className="flex gap-2 text-sm">
                    <CheckCircle2 size={17} className="shrink-0 text-primary" />
                    {locale === "ar" ? item.arabic : item.english}
                  </li>
                ))}
              </ul>
            </div>
            <div
              id="skills"
              className="glass-panel scroll-mt-28 rounded-2xl p-5"
            >
              <h2 className="text-xl font-black">{copy("skills")}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {skills.map((item) => (
                  <span
                    key={item.english}
                    className="rounded-full bg-blue-100 px-3 py-1 text-sm text-primary"
                  >
                    {locale === "ar" ? item.arabic : item.english}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div id="curriculum" className="mt-10 scroll-mt-28">
            <h2 className="text-xl font-black">{copy("curriculum")}</h2>
            <div className="mt-3 space-y-3">
              {modules.map((module) => (
                <div key={module.id} className="card p-5">
                  <h3 className="font-bold">{module.title}</h3>
                  <ul className="mt-3 divide-y text-sm text-muted">
                    {module.lessons.map((lesson) => (
                      <li
                        key={lesson.id}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <span>
                          {lesson.title}
                          {lesson.isPreview ? copy("preview") : ""}
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <span>
                            {Math.round(lesson.durationSeconds / 60)}{" "}
                            {copy("min")}
                          </span>
                          {lesson.isPreview ? (
                            <button
                              type="button"
                              onClick={() => setPreviewLessonId(lesson.id)}
                              className="focus-ring rounded-lg border border-primary/35 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/10"
                            >
                              {copy("open")}
                            </button>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {previewLessonId ? (
              <section
                className="glass-panel mt-5 rounded-2xl p-5"
                aria-live="polite"
              >
                {preview.isPending ? (
                  <p className="text-sm text-muted">{copy("loadingPreview")}</p>
                ) : preview.isError || !preview.data ? (
                  <p className="text-sm text-red-500">
                    {copy("thisPreviewCouldNotBeOpenedNow")}
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
                          {copy("previewLesson")}
                        </p>
                        <h3 className="mt-1 text-xl font-black">
                          {preview.data.title}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewLessonId(undefined)}
                        className="focus-ring rounded-lg px-3 py-2 text-sm font-bold text-muted hover:bg-white/5"
                      >
                        {copy("close")}
                      </button>
                    </div>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-muted">
                      {preview.data.body ||
                        copy("noTextIsAvailableForThisPreview")}
                    </p>
                    {preview.data.resources.length ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {preview.data.resources.map((resource) => (
                          <a
                            key={resource.id}
                            href={
                              resource.externalUrl ||
                              `/api/v1/catalog/courses/${slug}/preview/${preview.data.id}/resources/${resource.id}`
                            }
                            target={resource.externalUrl ? "_blank" : undefined}
                            rel={
                              resource.externalUrl ? "noreferrer" : undefined
                            }
                            className="focus-ring rounded-xl border border-primary/35 px-3 py-2 text-sm font-bold text-primary hover:bg-primary/10"
                          >
                            {resource.displayName}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </section>
            ) : null}
          </div>
        </div>
        <aside className="glass-panel h-fit rounded-2xl p-5 lg:sticky lg:top-24">
          <p className="text-2xl font-black">
            {course.isFree
              ? copy("free")
              : formatLocalizedCurrency(course.price, course.currency, locale)}
          </p>
          <p className="mt-2 text-sm text-muted">
            {copy("theServerVerifiesThePriceAtCheckout")}
          </p>
          <button
            type="button"
            disabled={add.isPending || user.isPending}
            onClick={() => addToCart(course.id)}
            className="premium-button focus-ring mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-slate-950 disabled:opacity-60"
          >
            <ShoppingCart size={18} />
            {user.isPending
              ? "…"
              : isStudent
                ? copy("addToCart")
                : user.data
                  ? copy("studentAccountOnly")
                  : copy("signInToPurchase")}
          </button>
          {notice && (
            <div className="mt-3 flex items-center justify-between gap-2 text-xs">
              <p role="status" className="text-muted">
                {notice}
              </p>
              {add.isSuccess && (
                <Link
                  className="focus-ring shrink-0 font-bold text-primary underline"
                  href={`/${locale}/cart`}
                >
                  {copy("viewCart")}
                </Link>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
