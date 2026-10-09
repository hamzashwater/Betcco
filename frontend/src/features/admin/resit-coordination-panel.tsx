"use client";

import { formatLocalizedDateTime } from "@/i18n/date-time";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type Authorization = {
  authorizationId: string;
  originalEvaluationRequestId: string;
  resitEvaluationRequestId: string | null;
  authorizedAtUtc: string;
  reason: string;
  activatedAtUtc: string | null;
  revokedAtUtc: string | null;
  revocationReason: string | null;
};

type AuthorizationPage = {
  items: Authorization[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
};

export function ResitCoordinationPanel() {
  const locale = useLocale();
  const t = useTranslations("adminWorkspace");
  const [page, setPage] = useState(1);
  const authorizations = useQuery({
    queryKey: ["resit-authorizations", page],
    queryFn: () =>
      api<AuthorizationPage>(`/resits/authorizations?page=${page}&pageSize=10`),
  });
  const date = (value: string) => formatLocalizedDateTime(value, locale);

  return (
    <section
      className="card mt-6 p-5"
      aria-label={t("resitCoordination.region")}
    >
      <h2 className="text-lg font-black">{t("resitCoordination.title")}</h2>
      <p className="mt-1 text-sm text-muted">
        {t("resitCoordination.description")}
      </p>
      {authorizations.isPending && (
        <p className="mt-4 text-sm text-muted" aria-busy>
          {t("resitCoordination.loading")}
        </p>
      )}
      {authorizations.isError && (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {t("resitCoordination.loadError")}
        </p>
      )}
      {authorizations.data?.items.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          {t("resitCoordination.empty")}
        </p>
      )}
      <div className="mt-4 grid gap-3">
        {authorizations.data?.items.map((item) => {
          const state = item.revokedAtUtc
            ? t("resitCoordination.revoked")
            : item.activatedAtUtc && item.resitEvaluationRequestId
              ? t("resitCoordination.activated")
              : t("resitCoordination.authorized");
          return (
            <article
              key={item.authorizationId}
              className="min-w-0 rounded-xl border border-border p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{state}</strong>
                <span className="text-xs text-muted">
                  {date(item.authorizedAtUtc)}
                </span>
              </div>
              <p className="mt-2 break-all text-muted">
                {t("shared.originalRequest")}{" "}
                {item.originalEvaluationRequestId.slice(0, 8)}
              </p>
              {item.resitEvaluationRequestId && (
                <p className="mt-1 break-all text-muted">
                  {t("resitCoordination.resitRequest")}{" "}
                  {item.resitEvaluationRequestId.slice(0, 8)}
                </p>
              )}
              {item.activatedAtUtc && (
                <p className="mt-1 text-muted">
                  {t("resitCoordination.activatedAt")}{" "}
                  {date(item.activatedAtUtc)}
                </p>
              )}
              {item.revokedAtUtc && (
                <p className="mt-1 text-muted">
                  {t("resitCoordination.revokedAt")} {date(item.revokedAtUtc)}
                </p>
              )}
              <p className="mt-2 break-words">
                <strong>{t("resitCoordination.privateReason")}</strong>{" "}
                {item.reason}
              </p>
              {item.revokedAtUtc && item.revocationReason && (
                <p className="mt-1 break-words">
                  <strong>
                    {t("resitCoordination.privateRevocationReason")}
                  </strong>{" "}
                  {item.revocationReason}
                </p>
              )}
            </article>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={page === 1 || authorizations.isFetching}
          onClick={() => setPage((current) => current - 1)}
          className="focus-ring rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-50"
        >
          {t("shared.previous")}
        </button>
        <span className="text-sm text-muted">
          {t("resitCoordination.page")} {page}
        </span>
        <button
          type="button"
          disabled={
            !authorizations.data?.hasNextPage || authorizations.isFetching
          }
          onClick={() => setPage((current) => current + 1)}
          className="focus-ring rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-50"
        >
          {t("shared.next")}
        </button>
      </div>
    </section>
  );
}
