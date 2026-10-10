"use client";

import { DashboardHeader } from "@/components/dashboard/dashboard-ui";
import { useTranslations } from "next-intl";

export function RetakeManagement() {
  const t = useTranslations("adminWorkspace");

  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow="BETCCO REVIEW"
        title={t("legacyRetakes.legacyRetakes")}
        description={t(
          "legacyRetakes.bETCCONoLongerCreatesNewRetakeRequestsAssignmentReviewNowIncludes",
        )}
      />
      <div className="card mt-6 p-5">
        <p className="text-sm leading-6 text-muted">
          {t(
            "legacyRetakes.historicalRetakeRecordsRemainAvailableForReadingAndAuditButNoNewR",
          )}
        </p>
      </div>
    </section>
  );
}
