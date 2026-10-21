"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import styles from "./student-evaluation-wizard.module.css";

// A saved snapshot, not a predicted/completed stage chain. This component owns
// no queries, workflow controls, grades, eligibility or payment decisions.
export function EvaluationCurrentState({
  status,
  branch,
  fundingUnknown = false,
  children,
}: {
  status: string;
  branch: "standard" | "resit" | "retake";
  fundingUnknown?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("studentEvaluationPresentation");
  const hints = {
    Draft: "states.draft",
    PendingPayment: "states.pendingPayment",
    Paid: "states.paid",
    PendingAssignment: "states.pendingAssignment",
    Assigned: "states.assigned",
    UnderReview: "states.underReview",
    NeedsRevision: "states.needsRevision",
    Completed: "states.completed",
    Closed: "states.closed",
    PaymentFailed: "states.paymentFailed",
    Cancelled: "states.cancelled",
    Refunded: "states.refunded",
  } as const;
  return (
    <section
      className={styles.lifecycle}
      aria-label={t("lifecycle")}
      data-progress-model="evaluation"
      data-evaluation-branch={branch}
    >
      <p className={styles.branchLabel}>{t(`branches.${branch}`)}</p>
      <ol className={styles.currentStage}>
        <li aria-current="step">
          <p className={styles.meta}>{t("currentStage")}</p>
          <div className={styles.statusValue}>{children}</div>
          <p className={styles.meta}>
            {t(
              Object.hasOwn(hints, status)
                ? hints[status as keyof typeof hints]
                : "states.unknown",
            )}
          </p>
        </li>
      </ol>
      <p className={styles.meta}>{t("statusNotGrade")}</p>
      {fundingUnknown ? (
        <p className={styles.meta}>{t("fundingUnknown")}</p>
      ) : null}
      {branch === "retake" ? (
        <p className={styles.meta}>{t("historicalRetake")}</p>
      ) : null}
    </section>
  );
}
