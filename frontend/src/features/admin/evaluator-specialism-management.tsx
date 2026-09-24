"use client";

import { api } from "@/lib/api";
import { academicText } from "@/lib/academic-localization";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
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
      <h1 className="text-3xl font-black">
        {ar ? "اختصاصات المقيمين حسب الوحدة" : "Evaluator Unit specialisms"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {ar
          ? "امنح أهلية التقييم لوحدة أكاديمية محددة، واحتفظ بسجل المنح والإلغاءات."
          : "Grant evaluation eligibility for a canonical academic Unit and keep its history."}
      </p>
      <div className="card mt-6 grid gap-4 p-5 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold">
          {ar ? "المقيم" : "Evaluator"}
          <select
            className="focus-ring min-w-0 rounded-xl border border-border bg-transparent p-3"
            value={evaluatorUserId}
            onChange={(event) => setEvaluatorUserId(event.target.value)}
            disabled={staff.isPending || staff.isError}
          >
            <option value="">
              {ar ? "اختر مقيّمًا" : "Select an evaluator"}
            </option>
            {staff.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          {ar ? "الوحدة الأكاديمية" : "Academic Unit"}
          <select
            className="focus-ring min-w-0 rounded-xl border border-border bg-transparent p-3"
            value={unitDefinitionId}
            onChange={(event) => setUnitDefinitionId(event.target.value)}
            disabled={units.isPending || units.isError}
          >
            <option value="">{ar ? "اختر وحدة" : "Select a Unit"}</option>
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
            ? ar
              ? "جارٍ منح الاختصاص…"
              : "Granting…"
            : ar
              ? "منح الاختصاص"
              : "Grant specialism"}
        </button>
      </div>
      {(staff.isPending || units.isPending || history.isPending) && (
        <p className="mt-4 text-sm text-muted" aria-busy>
          {ar ? "جارٍ التحميل…" : "Loading…"}
        </p>
      )}
      {(staff.isError ||
        units.isError ||
        history.isError ||
        grant.isError ||
        revoke.isError) && (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {ar
            ? "تعذر إكمال العملية. حدّث الصفحة وحاول مجددًا."
            : "Unable to complete the operation. Refresh and try again."}
        </p>
      )}
      {success && (
        <p className="mt-4 text-sm text-green-700" role="status">
          {success === "grant"
            ? ar
              ? "تم منح الاختصاص."
              : "Specialism granted."
            : ar
              ? "تم إلغاء الاختصاص مع حفظ السجل."
              : "Specialism revoked; history preserved."}
        </p>
      )}
      <h2 className="mt-10 text-2xl font-black">
        {ar ? "سجل الاختصاصات" : "Specialism history"}
      </h2>
      {!history.isPending && history.data?.items.length === 0 && (
        <p className="card mt-4 p-5 text-sm text-muted">
          {ar ? "لا توجد منح بعد." : "No grants yet."}
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
                  {ar ? "مُنح في" : "Granted"}{" "}
                  {new Date(item.grantedAtUtc).toLocaleString(
                    ar ? "ar-JO" : "en-GB",
                  )}
                </p>
                {item.revokedAtUtc && (
                  <p className="text-xs text-muted">
                    {ar ? "أُلغي في" : "Revoked"}{" "}
                    {new Date(item.revokedAtUtc).toLocaleString(
                      ar ? "ar-JO" : "en-GB",
                    )}
                  </p>
                )}
              </div>
              {item.revokedAtUtc ? (
                <span className="text-sm text-muted">
                  {ar ? "ملغى" : "Revoked"}
                </span>
              ) : (
                <button
                  type="button"
                  className="focus-ring rounded-xl border border-border px-4 py-2 text-sm font-bold disabled:opacity-50"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(item.id)}
                >
                  {revoke.isPending && revoke.variables === item.id
                    ? ar
                      ? "جارٍ الإلغاء…"
                      : "Revoking…"
                    : ar
                      ? "إلغاء الاختصاص"
                      : "Revoke"}
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
            {ar ? "السابق" : "Previous"}
          </button>
          <button
            type="button"
            disabled={page * 25 >= (history.data?.totalCount ?? 0)}
            onClick={() => setPage(page + 1)}
            className="focus-ring rounded-xl border border-border px-4 py-2 disabled:opacity-50"
          >
            {ar ? "التالي" : "Next"}
          </button>
        </div>
      )}
    </section>
  );
}
