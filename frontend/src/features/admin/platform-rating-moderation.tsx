"use client";

import { formatLocalizedDateTime } from "@/i18n/date-time";
import { formatLocalizedNumber } from "@/i18n/number-format";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, MessageSquareQuote, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
  const t = useTranslations("adminWorkspace");

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
          {t("platformRatingModeration.platformReviewsCouldNotBeLoaded")}
        </p>
      </section>
    );
  const pending = ratings.data.filter((rating) => !rating.isPublished);
  return (
    <section className="shell py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
            {t("platformRatingModeration.bETCCOFeedback")}
          </p>
          <h1 className="mt-2 text-3xl font-black">
            {t("platformRatingModeration.platformReviewModeration")}
          </h1>
          <p className="mt-2 max-w-3xl leading-7 text-muted">
            {t(
              "platformRatingModeration.aReviewCanBePublishedOnlyWhenTheLearnerOptedInReviewItsTextAndSco",
            )}
          </p>
        </div>
        <span className="rounded-full border border-border bg-surface/80 px-4 py-2 text-sm font-black text-primary">
          {t("platformRatingModeration.countAwaitingReview", {
            count: pending.length,
          })}
        </span>
      </div>
      {summary.data ? (
        <section
          className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-label={t("platformRatingModeration.learnerExperienceSummary")}
        >
          {[
            [
              t("platformRatingModeration.allFeedback"),
              summary.data.totalCount,
              t("platformRatingModeration.realLearnerSignals"),
            ],
            [
              t("platformRatingModeration.experienceAverage"),
              summary.data.averageScore
                ? `${summary.data.averageScore} / 5`
                : "—",
              t(
                "platformRatingModeration.coursesUsabilitySupportRecommendation",
              ),
            ],
            [
              t("platformRatingModeration.awaitingModeration"),
              summary.data.awaitingModerationCount,
              t("platformRatingModeration.withLearnerDisplayConsent"),
            ],
            [
              t("platformRatingModeration.privateWithoutConsent"),
              summary.data.privateWithoutConsentCount,
              t("platformRatingModeration.cannotBePublished"),
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
                      {t("platformRatingModeration.learnerReview")}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {formatLocalizedDateTime(rating.updatedAtUtc, locale)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-black text-primary">
                  <Star size={15} className="fill-primary" aria-hidden="true" />
                  {formatLocalizedNumber(average, locale, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{" "}
                  / 5
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                {[
                  [
                    t("platformRatingModeration.courses"),
                    rating.courseQualityScore,
                  ],
                  [
                    t("platformRatingModeration.usability"),
                    rating.easeOfUseScore,
                  ],
                  [t("platformRatingModeration.support"), rating.supportScore],
                  [
                    t("platformRatingModeration.recommend"),
                    rating.recommendationScore,
                  ],
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
                  {t(
                    "platformRatingModeration.theLearnerDidNotAddAWrittenComment",
                  )}
                </p>
              )}
              <div className="mt-5 grid gap-3 border-t border-border pt-5 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                <label className="grid gap-1 text-sm font-bold">
                  <span>
                    {t(
                      "platformRatingModeration.reasonForKeepingPrivateInternalNote",
                    )}
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
                  {t("platformRatingModeration.keepPrivate")}
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
                    ? t("platformRatingModeration.publishReview")
                    : t("platformRatingModeration.noDisplayConsent")}
                </button>
              </div>
            </article>
          );
        })}
        {!ratings.data.length ? (
          <p className="card p-6 text-muted">
            {t("platformRatingModeration.noReviewsHaveBeenSubmittedYet")}
          </p>
        ) : null}
      </div>
      {moderate.isError ? (
        <p role="alert" className="mt-5 text-sm text-red-500">
          {moderate.error instanceof Error
            ? moderate.error.message
            : t("platformRatingModeration.reviewStatusCouldNotBeUpdated")}
        </p>
      ) : null}
    </section>
  );
}
