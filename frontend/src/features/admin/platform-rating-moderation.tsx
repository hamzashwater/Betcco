"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, MessageSquareQuote, Star } from "lucide-react";
import { useLocale } from "next-intl";
import { useState } from "react";

type AdminPlatformRating = {
  id: string;
  courseQualityScore: number;
  easeOfUseScore: number;
  supportScore: number;
  recommendationScore: number;
  comment?: string;
  allowPublicDisplay: boolean;
  isPublished: boolean;
  moderationReason?: string;
  updatedAtUtc: string;
};

type AdminPlatformRatingSummary = {
  totalCount: number;
  publishedCount: number;
  awaitingModerationCount: number;
  privateWithoutConsentCount: number;
  averageScore?: number;
  courseQualityScore?: number;
  easeOfUseScore?: number;
  supportScore?: number;
  recommendationScore?: number;
};

export function PlatformRatingModeration() {
  const locale = useLocale();
  const ar = locale === "ar";
  const client = useQueryClient();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const ratings = useQuery({
    queryKey: ["admin-platform-ratings"],
    queryFn: () => api<AdminPlatformRating[]>("/admin/platform-ratings"),
  });
  const summary = useQuery({
    queryKey: ["admin-platform-ratings-summary"],
    queryFn: () =>
      api<AdminPlatformRatingSummary>("/admin/platform-ratings/summary"),
  });
  const moderate = useMutation({
    mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
      api<AdminPlatformRating>(`/admin/platform-ratings/${id}/moderation`, {
        method: "POST",
        body: JSON.stringify({ publish, reason: reasons[id]?.trim() || null }),
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["admin-platform-ratings"] });
      client.invalidateQueries({
        queryKey: ["admin-platform-ratings-summary"],
      });
      client.invalidateQueries({ queryKey: ["platform-ratings"] });
    },
  });
  if (ratings.isPending)
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          …
        </div>
      </section>
    );
  if (ratings.isError || !ratings.data)
    return (
      <section className="shell py-10">
        <p className="card p-6" role="alert">
          {ar
            ? "تعذر تحميل مراجعات المنصة."
            : "Platform reviews could not be loaded."}
        </p>
      </section>
    );
  const pending = ratings.data.filter((rating) => !rating.isPublished);
  return (
    <section className="shell py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
            {ar ? "تقييم BETCCO" : "BETCCO feedback"}
          </p>
          <h1 className="mt-2 text-3xl font-black">
            {ar ? "إدارة تقييمات المنصة" : "Platform review moderation"}
          </h1>
          <p className="mt-2 max-w-3xl leading-7 text-muted">
            {ar
              ? "لا تُنشر أي مراجعة إلا إذا اختار الطالب العرض العام. راجع النص والنتيجة قبل النشر، وسجّل سبب الحجب عند الحاجة."
              : "A review can be published only when the learner opted in. Review its text and score before publishing, and record a reason when keeping it private."}
          </p>
        </div>
        <span className="rounded-full border border-border bg-surface/80 px-4 py-2 text-sm font-black text-primary">
          {ar
            ? `${pending.length} بانتظار المراجعة`
            : `${pending.length} awaiting review`}
        </span>
      </div>
      {summary.data ? (
        <section
          className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-label={ar ? "ملخص تجربة الطلاب" : "Learner experience summary"}
        >
          {[
            [
              ar ? "جميع التقييمات" : "All feedback",
              summary.data.totalCount,
              ar ? "إشارات فعلية من الطلاب" : "Real learner signals",
            ],
            [
              ar ? "متوسط التجربة" : "Experience average",
              summary.data.averageScore
                ? `${summary.data.averageScore} / 5`
                : "—",
              ar
                ? "دورات واستخدام ودعم وتوصية"
                : "Courses, usability, support, recommendation",
            ],
            [
              ar ? "بانتظار المراجعة" : "Awaiting moderation",
              summary.data.awaitingModerationCount,
              ar ? "بموافقة الطالب على العرض" : "With learner display consent",
            ],
            [
              ar ? "خاص دون موافقة" : "Private without consent",
              summary.data.privateWithoutConsentCount,
              ar ? "لا يمكن نشره" : "Cannot be published",
            ],
          ].map(([label, value, detail]) => (
            <article key={String(label)} className="card p-4">
              <p className="text-xs font-bold text-muted">{label}</p>
              <p className="mt-2 text-2xl font-black text-primary">{value}</p>
              <p className="mt-1 text-xs text-muted">{detail}</p>
            </article>
          ))}
        </section>
      ) : null}
      <div className="mt-7 grid gap-4">
        {ratings.data.map((rating) => {
          const average =
            (rating.courseQualityScore +
              rating.easeOfUseScore +
              rating.supportScore +
              rating.recommendationScore) /
            4;
          return (
            <article key={rating.id} className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
                    <MessageSquareQuote size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-black">
                      {ar ? "مراجعة طالب" : "Learner review"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {new Intl.DateTimeFormat(ar ? "ar-JO" : "en", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(rating.updatedAtUtc))}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-black text-primary">
                  <Star size={15} className="fill-primary" aria-hidden="true" />
                  {average.toFixed(1)} / 5
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                {[
                  [ar ? "الدورات" : "Courses", rating.courseQualityScore],
                  [ar ? "الاستخدام" : "Usability", rating.easeOfUseScore],
                  [ar ? "الدعم" : "Support", rating.supportScore],
                  [ar ? "التوصية" : "Recommend", rating.recommendationScore],
                ].map(([label, score]) => (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-border bg-surface/70 p-3 text-sm"
                  >
                    <span className="text-muted">{label}</span>
                    <strong className="ms-2">{score} / 5</strong>
                  </div>
                ))}
              </div>
              {rating.comment ? (
                <p className="mt-5 whitespace-pre-wrap leading-7 text-muted">
                  {rating.comment}
                </p>
              ) : (
                <p className="mt-5 text-sm text-muted">
                  {ar
                    ? "لم يضف الطالب تعليقًا نصيًا."
                    : "The learner did not add a written comment."}
                </p>
              )}
              <div className="mt-5 grid gap-3 border-t border-border pt-5 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                <label className="grid gap-1 text-sm font-bold">
                  <span>
                    {ar
                      ? "سبب الحجب أو الملاحظة الداخلية"
                      : "Reason for keeping private / internal note"}
                  </span>
                  <input
                    value={reasons[rating.id] ?? rating.moderationReason ?? ""}
                    maxLength={500}
                    onChange={(event) =>
                      setReasons((current) => ({
                        ...current,
                        [rating.id]: event.target.value,
                      }))
                    }
                    className="focus-ring rounded-xl border border-border bg-transparent px-3 py-2.5 text-foreground"
                  />
                </label>
                <button
                  type="button"
                  disabled={moderate.isPending}
                  onClick={() =>
                    moderate.mutate({ id: rating.id, publish: false })
                  }
                  className="focus-ring inline-flex items-center justify-center gap-2 self-end rounded-xl border border-border px-4 py-2.5 text-sm font-black text-muted disabled:opacity-60"
                >
                  <EyeOff size={16} aria-hidden="true" />
                  {ar ? "إبقاء خاصًا" : "Keep private"}
                </button>
                <button
                  type="button"
                  disabled={moderate.isPending || !rating.allowPublicDisplay}
                  onClick={() =>
                    moderate.mutate({ id: rating.id, publish: true })
                  }
                  className="focus-ring inline-flex items-center justify-center gap-2 self-end rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Eye size={16} aria-hidden="true" />
                  {rating.allowPublicDisplay
                    ? ar
                      ? "نشر المراجعة"
                      : "Publish review"
                    : ar
                      ? "لا توجد موافقة للعرض"
                      : "No display consent"}
                </button>
              </div>
            </article>
          );
        })}
        {!ratings.data.length ? (
          <p className="card p-6 text-muted">
            {ar
              ? "لا توجد مراجعات مرسلة حتى الآن."
              : "No reviews have been submitted yet."}
          </p>
        ) : null}
      </div>
      {moderate.isError ? (
        <p role="alert" className="mt-5 text-sm text-red-500">
          {moderate.error instanceof Error
            ? moderate.error.message
            : ar
              ? "تعذر تحديث حالة المراجعة."
              : "Review status could not be updated."}
        </p>
      ) : null}
    </section>
  );
}
