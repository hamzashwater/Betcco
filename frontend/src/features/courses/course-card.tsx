"use client";

import { api } from "@/lib/api";
import type { CourseSummary } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Clock3,
  GraduationCap,
  ListVideo,
  ShoppingCart,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getCourseVisual } from "@/lib/course-visuals";

export function CourseCard({ course }: { course: CourseSummary }) {
  const locale = useLocale();
  const router = useRouter();
  const client = useQueryClient();
  const [notice, setNotice] = useState<string>();
  const user = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api<{ roles: string[] }>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
  const isStudent = user.data?.roles.includes("Student") ?? false;
  const visual = getCourseVisual(course);
  const add = useMutation({
    mutationFn: () =>
      api<{ items: unknown[] }>(`/cart/courses/${course.id}?locale=${locale}`, {
        method: "POST",
      }),
    onSuccess: (cart) => {
      setNotice(
        locale === "ar" ? "أضيفت الدورة إلى السلة." : "Course added to cart.",
      );
      client.setQueryData(["cart", locale], cart);
      client.invalidateQueries({ queryKey: ["cart", locale] });
    },
    onError: (error) =>
      setNotice(
        error instanceof Error ? error.message : "Unable to add course.",
      ),
  });
  function addToCart() {
    if (user.isPending) return;
    if (!isStudent) {
      if (!user.data) {
        router.push(`/${locale}/login`);
        return;
      }
      setNotice(
        locale === "ar"
          ? "الشراء متاح من حساب الطالب فقط."
          : "Purchasing is available to student accounts only.",
      );
      return;
    }
    add.mutate();
  }
  return (
    <article
      data-interactive="true"
      className="card group flex min-h-80 flex-col overflow-hidden p-0 transition-transform duration-200"
    >
      <div className="relative min-h-36 overflow-hidden border-b border-border p-5">
        <Image
          src={visual.src}
          alt=""
          fill
          sizes="(max-width: 768px) calc(100vw - 2rem), (max-width: 1024px) calc(50vw - 2rem), 380px"
          className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
          style={{ objectPosition: visual.objectPosition }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(5,10,25,.94),rgba(5,10,25,.2))]" />
        <span className="relative grid size-10 place-items-center rounded-xl border border-white/15 bg-white/10 text-primary">
          <BookOpen size={20} aria-hidden="true" />
        </span>
        <p className="relative mt-4 text-xs font-black text-primary">
          {course.track}
        </p>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h2 className="text-xl font-bold">
          <Link
            className="focus-ring hover:text-primary"
            href={`/${locale}/courses/${course.slug}`}
          >
            {course.title}
          </Link>
        </h2>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">
          {course.description}
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <ListVideo size={14} />
            {course.lessonCount} {locale === "ar" ? "دروس" : "lessons"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 size={14} />
            {course.durationMinutes > 0
              ? `${course.durationMinutes} ${locale === "ar" ? "دقيقة" : "min"}`
              : "—"}
          </span>
          {course.teacherName ? (
            <span className="inline-flex items-center gap-1">
              <GraduationCap size={14} />
              {course.teacherName}
            </span>
          ) : null}
        </div>
        {course.grade || course.specialization || course.subject ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[course.grade, course.specialization, course.subject]
              .filter(Boolean)
              .map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary"
                >
                  {item}
                </span>
              ))}
          </div>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <strong>
            {course.isFree
              ? locale === "ar"
                ? "مجاني"
                : "Free"
              : `${course.price.toFixed(3)} ${course.currency}`}
          </strong>
          <button
            type="button"
            disabled={add.isPending || user.isPending}
            onClick={addToCart}
            className="premium-button focus-ring inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
          >
            <ShoppingCart size={16} />
            {user.isPending
              ? "…"
              : isStudent
                ? locale === "ar"
                  ? "أضف للسلة"
                  : "Add"
                : user.data
                  ? locale === "ar"
                    ? "حساب طالب فقط"
                    : "Student account only"
                  : locale === "ar"
                    ? "سجّل الدخول للشراء"
                    : "Sign in to purchase"}
          </button>
        </div>
        <Link
          href={`/${locale}/courses/${course.slug}`}
          className="focus-ring mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary"
        >
          {locale === "ar" ? "عرض الدورة" : "View course"}
          <ArrowLeft
            size={16}
            className="rtl:rotate-180 transition-transform group-hover:-translate-x-1"
          />
        </Link>
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
                {locale === "ar" ? "عرض السلة" : "View cart"}
              </Link>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
