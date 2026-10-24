"use client";

import { formatLocalizedDateTime } from "@/i18n/date-time";
import { formatLocalizedNumber } from "@/i18n/number-format";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { QueryState, MutationOutcome } from "@/components/ui/query-state";
import styles from "./platform-rating-moderation.module.css";

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
  return (
    <section className={`shell py-8 ${styles.workspace}`}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          {t("platformRatingModeration.bETCCOFeedback")}
        </p>
        <h1 className={styles.title}>
          {t("platformRatingModeration.platformReviewModeration")}
        </h1>
        <p className={styles.description}>
          {t(
            "platformRatingModeration.aReviewCanBePublishedOnlyWhenTheLearnerOptedInReviewItsTextAndSco",
          )}
        </p>
      </header>
      <div className={styles.context}>
        {summary.isPending ? (
          <QueryState
            kind="loading"
            title={t("platformRatingModeration.loadingSummary")}
          />
        ) : null}
        {summary.isError ? (
          <QueryState
            kind="error"
            title={t("platformRatingModeration.summaryUnavailable")}
          />
        ) : null}
        {summary.data ? (
          <section
            aria-label={t("platformRatingModeration.learnerExperienceSummary")}
          >
            <dl className={styles.summary}>
              {[
                [
                  t("platformRatingModeration.allFeedback"),
                  summary.data.totalCount,
                ],
                [
                  t("platformRatingModeration.published"),
                  summary.data.publishedCount,
                ],
                [
                  t("platformRatingModeration.awaitingModeration"),
                  summary.data.awaitingModerationCount,
                ],
                [
                  t("platformRatingModeration.privateWithoutConsent"),
                  summary.data.privateWithoutConsentCount,
                ],
                [
                  t("platformRatingModeration.experienceAverage"),
                  summary.data.averageScore
                    ? `${summary.data.averageScore} / 5`
                    : "—",
                ],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>
      <p className={styles.scope}>
        {t("platformRatingModeration.loadedScope")}
      </p>
      {moderate.isPending ? (
        <QueryState
          kind="loading"
          title={t("platformRatingModeration.moderating")}
        />
      ) : null}
      {moderate.isError ? (
        <MutationOutcome kind="error">
          {moderate.error instanceof Error
            ? moderate.error.message
            : t("platformRatingModeration.reviewStatusCouldNotBeUpdated")}
        </MutationOutcome>
      ) : null}
      <div className={styles.ledger}>
        {ratings.isPending ? (
          <QueryState
            kind="loading"
            title={t("platformRatingModeration.loadingReviews")}
          />
        ) : null}
        {ratings.isError ? (
          <QueryState
            kind="error"
            title={t(
              "platformRatingModeration.platformReviewsCouldNotBeLoaded",
            )}
          />
        ) : null}
        {ratings.data?.map((rating) => {
          const average =
            (rating.courseQualityScore +
              rating.easeOfUseScore +
              rating.supportScore +
              rating.recommendationScore) /
            4;
          return (
            <article key={rating.id} className={styles.row}>
              <div className={styles.rowHeading}>
                <div>
                  <h2 className={styles.rowTitle}>
                    {t("platformRatingModeration.learnerReview")}
                  </h2>
                  <p className={styles.date}>
                    {formatLocalizedDateTime(rating.updatedAtUtc, locale)}
                  </p>
                </div>
                <div className={styles.facts}>
                  <span
                    className={styles.publication}
                    data-published={rating.isPublished}
                  >
                    {rating.isPublished
                      ? t("platformRatingModeration.published")
                      : t("platformRatingModeration.notPublished")}
                  </span>
                  <span
                    className={styles.consent}
                    data-consent={rating.allowPublicDisplay}
                  >
                    {rating.allowPublicDisplay
                      ? t("platformRatingModeration.consentGranted")
                      : t("platformRatingModeration.noDisplayConsent")}
                  </span>
                </div>
                <div className={styles.average}>
                  {formatLocalizedNumber(average, locale, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{" "}
                  / 5
                </div>
              </div>
              <div className={styles.scores}>
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
                  <div key={String(label)}>
                    <span>{label}</span>
                    <strong>{score} / 5</strong>
                  </div>
                ))}
              </div>
              {rating.comment ? (
                <p className={styles.comment}>{rating.comment}</p>
              ) : (
                <p className={styles.noComment}>
                  {t(
                    "platformRatingModeration.theLearnerDidNotAddAWrittenComment",
                  )}
                </p>
              )}
              <div className={styles.controls}>
                <label className={styles.field}>
                  <span>
                    {t(
                      "platformRatingModeration.reasonForKeepingPrivateInternalNote",
                    )}
                  </span>
                  <textarea
                    value={reasons[rating.id] ?? rating.moderationReason ?? ""}
                    maxLength={500}
                    onChange={(event) =>
                      setReasons((current) => ({
                        ...current,
                        [rating.id]: event.target.value,
                      }))
                    }
                    rows={2}
                  />
                </label>
                <button
                  type="button"
                  disabled={moderate.isPending}
                  onClick={() =>
                    moderate.mutate({ id: rating.id, publish: false })
                  }
                  aria-busy={moderate.isPending}
                >
                  <EyeOff size={16} strokeWidth={2} aria-hidden="true" />
                  {t("platformRatingModeration.keepPrivate")}
                </button>
                <button
                  type="button"
                  disabled={moderate.isPending || !rating.allowPublicDisplay}
                  onClick={() =>
                    moderate.mutate({ id: rating.id, publish: true })
                  }
                  className={styles.publish}
                  aria-busy={moderate.isPending}
                >
                  <Eye size={16} strokeWidth={2} aria-hidden="true" />
                  {rating.allowPublicDisplay
                    ? t("platformRatingModeration.publishReview")
                    : t("platformRatingModeration.noDisplayConsent")}
                </button>
              </div>
            </article>
          );
        })}
        {ratings.isSuccess && ratings.data.length === 0 ? (
          <QueryState
            kind="empty"
            title={t("platformRatingModeration.emptyLoaded")}
          />
        ) : null}
      </div>
    </section>
  );
}
