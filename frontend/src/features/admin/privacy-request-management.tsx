"use client";

import { MutationOutcome, QueryState } from "@/components/ui/query-state";
import { Check, Save } from "lucide-react";
import styles from "./privacy-request-management.module.css";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import { api } from "@/lib/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type PrivacyRequestType =
  | "Access"
  | "Rectification"
  | "Restriction"
  | "ErasureOrConcealment"
  | "ObjectionToProfiling"
  | "Portability"
  | "WithdrawMarketingConsent";
type PrivacyRequestStatus =
  | "Submitted"
  | "IdentityVerificationRequired"
  | "InReview"
  | "Completed"
  | "Rejected"
  | "Cancelled";
type PrivacyRequest = {
  id: string;
  requestType: PrivacyRequestType;
  status: PrivacyRequestStatus;
  description?: string | null;
  resolutionSummary?: string | null;
  identityVerifiedAtUtc?: string | null;
  createdAtUtc: string;
  resolvedAtUtc?: string | null;
};
type PrivacyRequestPage = {
  items: PrivacyRequest[];
  page: number;
  pageSize: number;
  totalCount: number;
};

const statuses: PrivacyRequestStatus[] = [
  "Submitted",
  "IdentityVerificationRequired",
  "InReview",
  "Completed",
  "Rejected",
  "Cancelled",
];
const reviewStatuses: PrivacyRequestStatus[] = [
  "IdentityVerificationRequired",
  "InReview",
  "Completed",
  "Rejected",
];

export function PrivacyRequestManagement() {
  const locale = useLocale();
  const t = useTranslations("adminWorkspace");

  const [status, setStatus] = useState<PrivacyRequestStatus | "">("");
  const [selected, setSelected] = useState<PrivacyRequest | null>(null);
  const [nextStatus, setNextStatus] =
    useState<PrivacyRequestStatus>("InReview");
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [identityVerified, setIdentityVerified] = useState(false);
  const query = useQuery({
    queryKey: ["admin-privacy-requests", status],
    queryFn: () =>
      api<PrivacyRequestPage>(
        `/privacy/admin/requests?pageSize=50${status ? `&status=${status}` : ""}`,
      ),
    retry: false,
  });
  const review = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("No privacy request selected.");
      return api<PrivacyRequest>(`/privacy/admin/requests/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: nextStatus,
          resolutionSummary: resolutionSummary.trim() || null,
          markIdentityVerified: identityVerified,
        }),
      });
    },
    onSuccess: (updated) => {
      setSelected(updated);
      setResolutionSummary(updated.resolutionSummary ?? "");
      setIdentityVerified(Boolean(updated.identityVerifiedAtUtc));
      void query.refetch();
    },
  });
  const date = (value: string) => formatLocalizedDateTime(value, locale);
  const typeLabel = (type: PrivacyRequestType) =>
    ({
      Access: t("privacyRequests.dataAccess"),
      Rectification: t("privacyRequests.dataCorrection"),
      Restriction: t("privacyRequests.restrictProcessing"),
      ErasureOrConcealment: t("privacyRequests.eraseOrConceal"),
      ObjectionToProfiling: t("privacyRequests.objectToProfiling"),
      Portability: t("privacyRequests.portableCopy"),
      WithdrawMarketingConsent: t("privacyRequests.withdrawMarketingConsent"),
    })[type];
  const statusLabel = (value: PrivacyRequestStatus) =>
    ({
      Submitted: t("privacyRequests.submitted"),
      IdentityVerificationRequired: t("privacyRequests.identityCheckRequired"),
      InReview: t("privacyRequests.inReview"),
      Completed: t("privacyRequests.completed"),
      Rejected: t("privacyRequests.rejected"),
      Cancelled: t("privacyRequests.cancelled"),
    })[value];
  const selectRequest = (item: PrivacyRequest) => {
    setSelected(item);
    setNextStatus(item.status === "Submitted" ? "InReview" : item.status);
    setResolutionSummary(item.resolutionSummary ?? "");
    setIdentityVerified(Boolean(item.identityVerifiedAtUtc));
    review.reset();
  };
  const isFinal = selected?.status
    ? ["Completed", "Rejected", "Cancelled"].includes(selected.status)
    : false;

  return (
    <section className={`shell py-8 sm:py-10 ${styles.workspace}`}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          {t("privacyRequests.bETCCOPrivacyOperations")}
        </p>
        <h1 className={styles.title}>{t("privacyRequests.privacyRequests")}</h1>
        <p className={styles.description}>
          {t(
            "privacyRequests.aHumanreviewQueueDoNotEraseOrExportDataFromThisScreenBeforeIdenti",
          )}
        </p>
      </header>
      <div className={styles.columns}>
        <section className={styles.queue} aria-labelledby="privacy-queue-title">
          <div className={styles.queueHeader}>
            <h2 id="privacy-queue-title" className={styles.sectionTitle}>
              {t("privacyRequests.reviewQueue")}
            </h2>
            <label className={styles.field}>
              <span>{t("privacyRequests.status")}</span>
              <select
                className={styles.control}
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as PrivacyRequestStatus | "")
                }
              >
                <option value="">{t("privacyRequests.allStatuses")}</option>
                {statuses.map((item) => (
                  <option key={item} value={item}>
                    {statusLabel(item)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.queueContext}>
            <p>{t("privacyRequests.loadedScope")}</p>
            {query.data ? (
              <p>
                {t("privacyRequests.matchingTotal", {
                  count: query.data.totalCount,
                })}
              </p>
            ) : null}
            {query.isPending && query.data === undefined ? (
              <QueryState
                kind="loading"
                title={t("privacyRequests.loadingRequests")}
              />
            ) : null}
            {query.isError ? (
              <QueryState kind="error" title={query.error.message} />
            ) : null}
            {!query.isPending &&
            !query.isError &&
            query.data?.items.length === 0 ? (
              <QueryState
                kind="empty"
                title={t("privacyRequests.thereAreNoRequestsWithThisStatus")}
              />
            ) : null}
          </div>
          {query.data?.items.length ? (
            <ul className={styles.rows}>
              {query.data.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => selectRequest(item)}
                    className={styles.row}
                    aria-pressed={selected?.id === item.id}
                  >
                    <span className={styles.rowTitle}>
                      {typeLabel(item.requestType)}
                    </span>
                    <span className={styles.status} data-status={item.status}>
                      {statusLabel(item.status)}
                    </span>
                    <span className={styles.date}>
                      {date(item.createdAtUtc)}
                    </span>
                    {selected?.id === item.id ? (
                      <span className={styles.selected}>
                        <Check size={16} strokeWidth={2} aria-hidden="true" />
                        {t("privacyRequests.selectedRequest")}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <aside
          className={styles.detail}
          aria-live="polite"
          aria-label={t("privacyRequests.requestFacts")}
        >
          {!selected ? (
            <p className={styles.description}>
              {t("privacyRequests.selectARequestFromTheQueueToReviewIt")}
            </p>
          ) : (
            <form
              className={styles.reviewForm}
              onSubmit={(event) => {
                event.preventDefault();
                review.mutate();
              }}
            >
              <div className={styles.facts}>
                <h2 className={styles.sectionTitle}>
                  {t("privacyRequests.requestFacts")}
                </h2>
                <p className={styles.itemTitle}>
                  {typeLabel(selected.requestType)}
                </p>
                <p className={styles.status} data-status={selected.status}>
                  {statusLabel(selected.status)}
                </p>
                <p className={styles.date}>
                  {t("privacyRequests.createdOn")} {date(selected.createdAtUtc)}
                </p>
                {selected.description && (
                  <div className={styles.rawText}>{selected.description}</div>
                )}
              </div>
              <div className={styles.draft}>
                <h3 className={styles.sectionTitle}>
                  {t("privacyRequests.reviewDraft")}
                </h3>
                <p className={styles.hint}>
                  {t(
                    isFinal
                      ? "privacyRequests.finalLocked"
                      : "privacyRequests.draftHint",
                  )}
                </p>
                <label className={styles.field}>
                  {t("privacyRequests.reviewStatus")}
                  <select
                    className={styles.control}
                    value={nextStatus}
                    disabled={isFinal}
                    hidden={isFinal}
                    onChange={(event) =>
                      setNextStatus(event.target.value as PrivacyRequestStatus)
                    }
                  >
                    {reviewStatuses.map((item) => (
                      <option key={item} value={item}>
                        {statusLabel(item)}
                      </option>
                    ))}
                  </select>
                </label>
                {isFinal ? (
                  <p
                    className={styles.finalStatus}
                    data-final-status={selected.status}
                  >
                    {statusLabel(selected.status)}
                  </p>
                ) : null}
                <label className={styles.field}>
                  {t("privacyRequests.userfacingReviewNote")}
                  <textarea
                    className={styles.control}
                    value={resolutionSummary}
                    maxLength={2000}
                    disabled={isFinal}
                    onChange={(event) =>
                      setResolutionSummary(event.target.value)
                    }
                    placeholder={t(
                      "privacyRequests.requiredForCompletionOrRejectionDoNotPutSensitiveInternalNotesHer",
                    )}
                  />
                </label>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={identityVerified}
                    disabled={
                      isFinal || Boolean(selected.identityVerifiedAtUtc)
                    }
                    onChange={(event) =>
                      setIdentityVerified(event.target.checked)
                    }
                  />
                  <span>
                    {t(
                      "privacyRequests.theRequestersIdentityWasVerifiedUnderTheApprovedOperationalProced",
                    )}
                  </span>
                </label>
              </div>
              <div className={styles.recorded}>
                <h3 className={styles.sectionTitle}>
                  {t("privacyRequests.recordedFacts")}
                </h3>
                {selected.identityVerifiedAtUtc ? (
                  <p>
                    {t("privacyRequests.verificationRecorded")}{" "}
                    {date(selected.identityVerifiedAtUtc)}
                  </p>
                ) : (
                  <p>{t("privacyRequests.verificationNotRecorded")}</p>
                )}
                {selected.resolvedAtUtc ? (
                  <p>
                    {t("privacyRequests.resolvedOn")}{" "}
                    {date(selected.resolvedAtUtc)}
                  </p>
                ) : null}
              </div>
              {!isFinal && (
                <button
                  type="submit"
                  className={styles.save}
                  disabled={review.isPending}
                  aria-busy={review.isPending}
                >
                  <Save size={16} strokeWidth={2} aria-hidden="true" />
                  {review.isPending
                    ? t("privacyRequests.saving")
                    : t("privacyRequests.saveReviewDecision")}
                </button>
              )}
              {review.isError && (
                <MutationOutcome kind="error">
                  {review.error.message}
                </MutationOutcome>
              )}
              {review.isSuccess && (
                <MutationOutcome kind="success">
                  {t("privacyRequests.reviewDecisionSaved")}
                </MutationOutcome>
              )}
            </form>
          )}
        </aside>
      </div>
    </section>
  );
}
