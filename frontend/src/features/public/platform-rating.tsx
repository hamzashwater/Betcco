"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  MessageSquareQuote,
  ShieldCheck,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useState } from "react";

type CurrentUser = { roles: string[] };
type RatingSummary = {
  ratingsCount: number;
  averageScore: number | null;
  courseQualityScore: number | null;
  easeOfUseScore: number | null;
  supportScore: number | null;
  recommendationScore: number | null;
  reviews: {
    id: string;
    score: number;
    comment?: string;
    updatedAtUtc: string;
    authorLabel: string;
  }[];
};
type OwnRating = {
  id: string;
  courseQualityScore: number;
  easeOfUseScore: number;
  supportScore: number;
  recommendationScore: number;
  comment?: string;
  allowPublicDisplay: boolean;
  isPublished: boolean;
  moderatedAtUtc?: string;
  moderationReason?: string;
};

type RatingForm = {
  courseQualityScore: number;
  easeOfUseScore: number;
  supportScore: number;
  recommendationScore: number;
  comment: string;
  allowPublicDisplay: boolean;
};

const initialForm: RatingForm = {
  courseQualityScore: 5,
  easeOfUseScore: 5,
  supportScore: 5,
  recommendationScore: 5,
  comment: "",
  allowPublicDisplay: false,
};

export function PlatformRatingPage() {
  const locale = useLocale();
  const ar = locale === "ar";
  const client = useQueryClient();
  const [draft, setDraft] = useState<RatingForm>();
  const user = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api<CurrentUser>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
  const isStudent = user.data?.roles.includes("Student") ?? false;
  const summary = useQuery({
    queryKey: ["platform-ratings", locale],
    queryFn: () => api<RatingSummary>(`/platform-ratings?locale=${locale}`),
    staleTime: 30_000,
  });
  const mine = useQuery({
    queryKey: ["my-platform-rating"],
    queryFn: () => api<OwnRating>("/platform-ratings/mine"),
    enabled: isStudent,
    retry: false,
  });
  const savedForm: RatingForm = mine.data
    ? {
        courseQualityScore: mine.data.courseQualityScore,
        easeOfUseScore: mine.data.easeOfUseScore,
        supportScore: mine.data.supportScore,
        recommendationScore: mine.data.recommendationScore,
        comment: mine.data.comment ?? "",
        allowPublicDisplay: mine.data.allowPublicDisplay,
      }
    : initialForm;
  const form = draft ?? savedForm;
  const save = useMutation({
    mutationFn: () =>
      api<OwnRating>("/platform-ratings/mine", {
        method: "PUT",
        body: JSON.stringify(form),
      }),
    onSuccess: (rating) => {
      client.setQueryData(["my-platform-rating"], rating);
      setDraft({
        courseQualityScore: rating.courseQualityScore,
        easeOfUseScore: rating.easeOfUseScore,
        supportScore: rating.supportScore,
        recommendationScore: rating.recommendationScore,
        comment: rating.comment ?? "",
        allowPublicDisplay: rating.allowPublicDisplay,
      });
      client.invalidateQueries({ queryKey: ["platform-ratings"] });
    },
  });
  const updateScore = (
    key: keyof Pick<
      RatingForm,
      | "courseQualityScore"
      | "easeOfUseScore"
      | "supportScore"
      | "recommendationScore"
    >,
    value: number,
  ) => setDraft({ ...form, [key]: value });
  const labels = [
    [
      "courseQualityScore",
      ar ? "جودة المحتوى والدورات" : "Course and content quality",
    ],
    ["easeOfUseScore", ar ? "سهولة الاستخدام" : "Ease of use"],
    ["supportScore", ar ? "الدعم والتواصل" : "Support and communication"],
    [
      "recommendationScore",
      ar ? "مدى التوصية بالمنصة" : "Likelihood to recommend",
    ],
  ] as const;
  const reviewState = mine.data
    ? mine.data.isPublished
      ? ar
        ? "تمت مراجعة تقييمك ونشره بموافقتك."
        : "Your review was approved and published with your consent."
      : ar
        ? "حُفظ تقييمك وينتظر مراجعة الأدمن؛ لن يظهر للعامة قبل الموافقة."
        : "Your review is saved and awaiting admin review; it is not public until approved."
    : null;

  return (
    <section className="shell py-12">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,0.9fr)_minmax(23rem,1.1fr)]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
            {ar ? "تقييم BETCCO" : "BETCCO feedback"}
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            {ar ? "تقييم BETCCO" : "Rate BETCCO"}
          </h1>
          <p className="mt-4 max-w-xl leading-7 text-muted">
            {ar
              ? "نستخدم تقييمات الطلاب الحقيقية لتحسين تجربة التعلّم. لا نعرض مراجعة باسمك، ولا تُنشر إلا باختيارك وبعد مراجعة الإدارة."
              : "We use genuine learner feedback to improve the learning experience. Your name is never displayed, and a review is public only with your choice and an admin review."}
          </p>
          <div className="card mt-7 grid gap-5 p-6 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="grid size-24 place-items-center rounded-3xl bg-primary/12 text-primary">
              <span className="text-3xl font-black">
                {summary.data?.averageScore?.toFixed(1) ?? "—"}
              </span>
              <span className="text-xs font-bold">/ 5</span>
            </div>
            <div>
              <h2 className="text-xl font-black">
                {ar ? "انطباع الطلاب المنشور" : "Published learner feedback"}
              </h2>
              <p className="mt-2 text-sm text-muted">
                {summary.data?.ratingsCount
                  ? ar
                    ? `من ${summary.data.ratingsCount} مراجعة منشورة بموافقة أصحابها.`
                    : `From ${summary.data.ratingsCount} approved, opted-in review${summary.data.ratingsCount === 1 ? "" : "s"}.`
                  : ar
                    ? "لا توجد مراجعات منشورة بعد. ستظهر هنا بعد موافقة أصحابها ومراجعة الإدارة."
                    : "There are no published reviews yet. Reviews appear here only after opt-in and admin review."}
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              [
                summary.data?.courseQualityScore,
                ar ? "جودة الدورات" : "Course quality",
              ],
              [
                summary.data?.easeOfUseScore,
                ar ? "سهولة الاستخدام" : "Ease of use",
              ],
              [summary.data?.supportScore, ar ? "الدعم" : "Support"],
              [
                summary.data?.recommendationScore,
                ar ? "التوصية" : "Recommendation",
              ],
            ].map(([score, label]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-border bg-surface/70 p-4"
              >
                <p className="text-sm font-bold text-muted">{label}</p>
                <p className="mt-1 flex items-center gap-1 text-lg font-black">
                  <Star
                    size={17}
                    className="fill-primary text-primary"
                    aria-hidden="true"
                  />
                  {typeof score === "number" ? score.toFixed(1) : "—"}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-7 grid gap-3">
            {summary.data?.reviews.map((review) => (
              <article key={review.id} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-black">{review.authorLabel}</p>
                  <p className="flex items-center gap-1 text-sm font-bold text-primary">
                    <Star
                      size={15}
                      className="fill-primary"
                      aria-hidden="true"
                    />
                    {review.score.toFixed(1)} / 5
                  </p>
                </div>
                {review.comment ? (
                  <p className="mt-3 leading-7 text-muted">{review.comment}</p>
                ) : null}
              </article>
            ))}
            {summary.isError ? (
              <p role="alert" className="text-sm text-red-500">
                {ar
                  ? "تعذر تحميل التقييمات المنشورة."
                  : "Published ratings could not be loaded."}
              </p>
            ) : null}
          </div>
        </div>
        <aside className="card h-fit p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary/15 text-secondary">
              <MessageSquareQuote size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-2xl font-black">
                {ar ? "شاركنا رأيك" : "Share your feedback"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {ar
                  ? "متاح لحسابات الطلاب المسجلة فقط."
                  : "Available to signed-in student accounts only."}
              </p>
            </div>
          </div>
          {!user.isPending && !isStudent ? (
            <div className="mt-6 rounded-2xl border border-border bg-surface/70 p-5 text-sm leading-6 text-muted">
              <p>
                {ar
                  ? "سجّل دخولك كطالب لإرسال تقييمك."
                  : "Sign in as a student to submit your feedback."}
              </p>
              <Link
                href={`/${locale}/login`}
                className="focus-ring mt-4 inline-flex rounded-xl bg-primary px-4 py-2.5 font-black text-slate-950"
              >
                {ar ? "تسجيل الدخول" : "Sign in"}
              </Link>
            </div>
          ) : isStudent ? (
            <form
              className="mt-6 grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
            >
              {labels.map(([key, label]) => (
                <label key={key} className="grid gap-2 text-sm font-bold">
                  <span>{label}</span>
                  <select
                    value={form[key]}
                    onChange={(event) =>
                      updateScore(key, Number(event.target.value))
                    }
                    className="focus-ring rounded-xl border border-border bg-surface-solid px-3 py-2.5 text-foreground"
                  >
                    {[5, 4, 3, 2, 1].map((value) => (
                      <option key={value} value={value}>
                        {value} / 5
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="grid gap-2 text-sm font-bold">
                <span>{ar ? "ملاحظة اختيارية" : "Optional comment"}</span>
                <textarea
                  value={form.comment}
                  maxLength={1200}
                  onChange={(event) =>
                    setDraft({ ...form, comment: event.target.value })
                  }
                  className="focus-ring min-h-28 rounded-xl border border-border bg-surface-solid p-3 text-foreground"
                  placeholder={
                    ar
                      ? "كيف يمكن أن نُحسّن تجربتك؟"
                      : "How can we improve your experience?"
                  }
                />
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-border bg-surface/60 p-4 text-sm leading-6">
                <input
                  type="checkbox"
                  checked={form.allowPublicDisplay}
                  onChange={(event) =>
                    setDraft({
                      ...form,
                      allowPublicDisplay: event.target.checked,
                    })
                  }
                  className="mt-1 size-4"
                />
                <span>
                  {ar
                    ? "أسمح بعرض مراجعتي للعامة دون اسمي بعد مراجعة الإدارة."
                    : "I allow my review to be shown publicly without my name after an admin review."}
                </span>
              </label>
              <button
                disabled={save.isPending || mine.isPending}
                className="focus-ring rounded-xl bg-primary px-4 py-3 font-black text-slate-950 disabled:opacity-60"
              >
                {save.isPending
                  ? ar
                    ? "جارٍ الحفظ…"
                    : "Saving…"
                  : ar
                    ? "إرسال التقييم"
                    : "Submit feedback"}
              </button>
              {reviewState ? (
                <p role="status" className="flex gap-2 text-sm text-primary">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  {reviewState}
                </p>
              ) : null}
              {save.isError ? (
                <p role="alert" className="text-sm text-red-500">
                  {save.error instanceof Error
                    ? save.error.message
                    : ar
                      ? "تعذر حفظ التقييم."
                      : "Feedback could not be saved."}
                </p>
              ) : null}
            </form>
          ) : (
            <div
              className="mt-6 h-64 animate-pulse rounded-2xl bg-white/5"
              aria-busy
            />
          )}
          <p className="mt-6 flex gap-2 border-t border-border pt-5 text-xs leading-5 text-muted">
            <ShieldCheck
              size={16}
              className="shrink-0 text-secondary"
              aria-hidden="true"
            />
            {ar
              ? "لا نعرض اسم الطالب، ويمكن للأدمن إخفاء المراجعة أو رفض نشرها عند الحاجة."
              : "We do not show the learner's name. An administrator can keep a review private or decline publication when needed."}
          </p>
        </aside>
      </div>
    </section>
  );
}
