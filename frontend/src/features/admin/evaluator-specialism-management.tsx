"use client";

import { formatLocalizedDateTime } from "@/i18n/date-time";
import { api } from "@/lib/api";
import { academicText } from "@/lib/academic-localization";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type Staff = { id: string; displayName: string };
type Unit = {
  id: string;
  code: string;
  englishTitle: string;
  arabicTitle: string;
  qualificationVersionId: string;
  qualificationCode: string;
  qualificationVersionCode: string;
};
type Grant = {
  id: string;
  evaluatorUserId: string;
  evaluatorName: string;
  unitDefinitionId: string;
  unitCode: string;
  unitEnglishTitle: string;
  unitArabicTitle: string;
  qualificationVersionId: string;
  grantedAtUtc: string;
  revokedAtUtc: string | null;
};
type GrantPage = {
  items: Grant[];
  page: number;
  pageSize: number;
  totalCount: number;
};

export function EvaluatorSpecialismManagement() {
  const locale = useLocale();
  const ar = locale === "ar";
  const t = useTranslations("adminWorkspace");
  const client = useQueryClient();
  const [evaluatorUserId, setEvaluatorUserId] = useState("");
  const [unitDefinitionId, setUnitDefinitionId] = useState("");
  const [page, setPage] = useState(1);
  const [success, setSuccess] = useState<"grant" | "revoke" | null>(null);
  const staff = useQuery({
    queryKey: ["evaluator-specialism-staff"],
    queryFn: () => api<Staff[]>("/admin/evaluator-specialisms/staff"),
  });
  const units = useQuery({
    queryKey: ["evaluator-specialism-units"],
    queryFn: () => api<Unit[]>("/admin/evaluator-specialisms/units"),
  });
  const history = useQuery({
    queryKey: ["evaluator-specialism-history", page],
    queryFn: () =>
      api<GrantPage>(`/admin/evaluator-specialisms?page=${page}&pageSize=25`),
  });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ["evaluator-specialism-history"] });
    client.invalidateQueries({ queryKey: ["eligible-evaluators"] });
  };
  const grant = useMutation({
    mutationFn: () =>
      api("/admin/evaluator-specialisms", {
        method: "POST",
        body: JSON.stringify({ evaluatorUserId, unitDefinitionId }),
      }),
    onSuccess: () => {
      setSuccess("grant");
      refresh();
    },
    onError: () => setSuccess(null),
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/evaluator-specialisms/${id}/revoke`, {
        method: "POST",
        body: JSON.stringify({ reason: null }),
      }),
    onSuccess: () => {
      setSuccess("revoke");
      refresh();
    },
    onError: () => setSuccess(null),
  });

  return (
    <section className="shell py-10">
      <h1 className="text-3xl font-black">{t("evaluatorSpecialisms.title")}</h1>
      <p className="mt-2 text-sm text-muted">
        {t("evaluatorSpecialisms.description")}
      </p>
      <div className="card mt-6 grid gap-4 p-5 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold">
          {t("evaluatorSpecialisms.evaluator")}
          <select
            className="focus-ring min-w-0 rounded-xl border border-border bg-transparent p-3"
            value={evaluatorUserId}
            onChange={(event) => setEvaluatorUserId(event.target.value)}
            disabled={staff.isPending || staff.isError}
          >
            <option value="">
              {t("evaluatorSpecialisms.selectEvaluator")}
            </option>
            {staff.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          {t("evaluatorSpecialisms.academicUnit")}
          <select
            className="focus-ring min-w-0 rounded-xl border border-border bg-transparent p-3"
            value={unitDefinitionId}
            onChange={(event) => setUnitDefinitionId(event.target.value)}
            disabled={units.isPending || units.isError}
          >
            <option value="">{t("evaluatorSpecialisms.selectUnit")}</option>
            {units.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.qualificationCode} {item.qualificationVersionCode} ·{" "}
                {item.code} — {ar ? item.arabicTitle : item.englishTitle}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="focus-ring rounded-xl bg-primary px-4 py-3 font-black text-slate-950 disabled:opacity-50 md:col-span-2"
          disabled={!evaluatorUserId || !unitDefinitionId || grant.isPending}
          onClick={() => grant.mutate()}
        >
          {grant.isPending
            ? t("evaluatorSpecialisms.granting")
            : t("evaluatorSpecialisms.grant")}
        </button>
      </div>
      {(staff.isPending || units.isPending || history.isPending) && (
        <p className="mt-4 text-sm text-muted" aria-busy>
          {t("evaluatorSpecialisms.loading")}
        </p>
      )}
      {(staff.isError ||
        units.isError ||
        history.isError ||
        grant.isError ||
        revoke.isError) && (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {t("evaluatorSpecialisms.operationError")}
        </p>
      )}
      {success && (
        <p className="mt-4 text-sm text-green-700" role="status">
          {success === "grant"
            ? t("evaluatorSpecialisms.grantSuccess")
            : t("evaluatorSpecialisms.revokeSuccess")}
        </p>
      )}
      <h2 className="mt-10 text-2xl font-black">
        {t("evaluatorSpecialisms.history")}
      </h2>
      {!history.isPending && history.data?.items.length === 0 && (
        <p className="card mt-4 p-5 text-sm text-muted">
          {t("evaluatorSpecialisms.emptyHistory")}
        </p>
      )}
      <div className="mt-4 grid gap-3">
        {history.data?.items.map((item) => (
          <article key={item.id} className="card min-w-0 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold">{item.evaluatorName}</p>
                <p className="break-words text-sm text-muted">
                  {item.unitCode} —{" "}
                  {academicText(
                    locale,
                    item.unitArabicTitle,
                    item.unitEnglishTitle,
                  )}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {t("evaluatorSpecialisms.grantedAt")}{" "}
                  {formatLocalizedDateTime(item.grantedAtUtc, locale)}
                </p>
                {item.revokedAtUtc && (
                  <p className="text-xs text-muted">
                    {t("evaluatorSpecialisms.revokedAt")}{" "}
                    {formatLocalizedDateTime(item.revokedAtUtc, locale)}
                  </p>
                )}
              </div>
              {item.revokedAtUtc ? (
                <span className="text-sm text-muted">
                  {t("evaluatorSpecialisms.revokedStatus")}
                </span>
              ) : (
                <button
                  type="button"
                  className="focus-ring rounded-xl border border-border px-4 py-2 text-sm font-bold disabled:opacity-50"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(item.id)}
                >
                  {revoke.isPending && revoke.variables === item.id
                    ? t("evaluatorSpecialisms.revoking")
                    : t("evaluatorSpecialisms.revoke")}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {(history.data?.totalCount ?? 0) > 25 && (
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="focus-ring rounded-xl border border-border px-4 py-2 disabled:opacity-50"
          >
            {t("shared.previous")}
          </button>
          <button
            type="button"
            disabled={page * 25 >= (history.data?.totalCount ?? 0)}
            onClick={() => setPage(page + 1)}
            className="focus-ring rounded-xl border border-border px-4 py-2 disabled:opacity-50"
          >
            {t("shared.next")}
          </button>
        </div>
      )}
    </section>
  );
}
