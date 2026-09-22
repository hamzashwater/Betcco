"use client";

import { api } from "@/lib/api";
import { DashboardHeader } from "@/components/dashboard/dashboard-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useLocale } from "next-intl";
import { useState } from "react";

type RetakeScope = {
  assessmentScopeId: string;
  assessmentCode: string;
  assessmentArabicTitle: string;
  assessmentEnglishTitle: string;
  criterionCodes: string[];
};

type EligibleRetake = {
  originalEvaluationRequestId: string;
  studentUserId: string;
  unmetPassCriteria: string[];
  availableScopes: RetakeScope[];
  academic: {
    unitCode: string;
    unitArabicTitle: string;
    unitEnglishTitle: string;
    assessmentCode: string;
    assessmentArabicTitle: string;
    assessmentEnglishTitle: string;
  };
};

type CreatedRetake = { retakeEvaluationRequestId: string };

export function RetakeManagement() {
  const locale = useLocale();
  const client = useQueryClient();
  const [scopeByRequest, setScopeByRequest] = useState<Record<string, string>>(
    {},
  );
  const [reasonByRequest, setReasonByRequest] = useState<
    Record<string, string>
  >({});
  const [created, setCreated] = useState<CreatedRetake | null>(null);
  const eligible = useQuery({
    queryKey: ["eligible-retakes"],
    queryFn: () => api<EligibleRetake[]>("/retakes/eligible"),
  });
  const authorize = useMutation({
    mutationFn: ({ originalId }: { originalId: string }) =>
      api<CreatedRetake>(`/retakes/${originalId}/authorize`, {
        method: "POST",
        body: JSON.stringify({
          retakeAssessmentScopeId: scopeByRequest[originalId],
          reason: reasonByRequest[originalId],
        }),
      }),
    onSuccess: (result) => {
      setCreated(result);
      client.invalidateQueries({ queryKey: ["eligible-retakes"] });
    },
  });

  if (eligible.isPending)
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          …
        </div>
      </section>
    );
  if (eligible.isError)
    return (
      <section className="shell py-10">
        <p className="card p-6" role="alert">
          {locale === "ar"
            ? "تعذر تحميل طلبات الإعادة المؤهلة."
            : "Unable to load eligible Retake requests."}
        </p>
      </section>
    );

  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow="BETCCO ASSESS"
        title={locale === "ar" ? "اعتماد إعادة التقييم" : "Authorize Retakes"}
        description={
          locale === "ar"
            ? "اعتمد محاولة Retake واحدة بعد إعادة تسليم مكتملة ونتيجة نهائية لم تحقق معايير Pass المطلوبة."
            : "Authorize one Retake after a completed resubmission still fails required Pass criteria."
        }
      />
      {created ? (
        <p
          className="mt-5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm"
          role="status"
        >
          {locale === "ar" ? "تم إنشاء طلب Retake: " : "Retake created: "}
          <strong className="break-all">
            {created.retakeEvaluationRequestId}
          </strong>
        </p>
      ) : null}
      <div className="mt-6 grid gap-4">
        {eligible.data?.map((item) => {
          const scopeId =
            scopeByRequest[item.originalEvaluationRequestId] ?? "";
          const reason =
            reasonByRequest[item.originalEvaluationRequestId] ?? "";
          return (
            <article
              className="card min-w-0 p-5"
              key={item.originalEvaluationRequestId}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-black text-primary">
                    <RotateCcw size={18} aria-hidden="true" />
                    {locale === "ar" ? "مؤهل لـ Retake" : "Eligible for Retake"}
                  </p>
                  <h2 className="mt-2 break-words text-xl font-black">
                    {locale === "ar"
                      ? item.academic.assessmentArabicTitle
                      : item.academic.assessmentEnglishTitle}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {item.academic.unitCode} · {item.academic.assessmentCode}
                  </p>
                </div>
                <span className="max-w-full break-all rounded-full border border-border px-3 py-1 text-xs text-muted">
                  {item.originalEvaluationRequestId}
                </span>
              </div>
              <p className="mt-4 text-sm">
                <strong>
                  {locale === "ar"
                    ? "معايير Pass غير المحققة:"
                    : "Unmet Pass criteria:"}
                </strong>{" "}
                {item.unmetPassCriteria.join(", ")}
              </p>
              <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
                <label className="grid min-w-0 gap-1 text-sm font-semibold">
                  {locale === "ar" ? "مهمة Retake" : "Retake assignment"}
                  <select
                    className="focus-ring min-w-0 max-w-full rounded-xl border border-border bg-transparent p-3"
                    value={scopeId}
                    onChange={(event) =>
                      setScopeByRequest((current) => ({
                        ...current,
                        [item.originalEvaluationRequestId]: event.target.value,
                      }))
                    }
                  >
                    <option value="">—</option>
                    {item.availableScopes.map((scope) => (
                      <option
                        key={scope.assessmentScopeId}
                        value={scope.assessmentScopeId}
                      >
                        {scope.assessmentCode} —{" "}
                        {locale === "ar"
                          ? scope.assessmentArabicTitle
                          : scope.assessmentEnglishTitle}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid min-w-0 gap-1 text-sm font-semibold">
                  {locale === "ar"
                    ? "مبرر داخلي مطلوب"
                    : "Required staff rationale"}
                  <textarea
                    className="focus-ring min-h-24 min-w-0 max-w-full rounded-xl border border-border bg-transparent p-3"
                    maxLength={2000}
                    value={reason}
                    onChange={(event) =>
                      setReasonByRequest((current) => ({
                        ...current,
                        [item.originalEvaluationRequestId]: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="focus-ring mt-4 rounded-xl bg-primary px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!scopeId || !reason.trim() || authorize.isPending}
                onClick={() =>
                  authorize.mutate({
                    originalId: item.originalEvaluationRequestId,
                  })
                }
              >
                {authorize.isPending
                  ? "…"
                  : locale === "ar"
                    ? "اعتماد وإنشاء Retake"
                    : "Authorize and create Retake"}
              </button>
            </article>
          );
        })}
        {!eligible.data?.length ? (
          <p className="card p-6 text-sm text-muted">
            {locale === "ar"
              ? "لا توجد تقييمات مؤهلة لـ Retake حاليًا."
              : "No evaluations are currently eligible for a Retake."}
          </p>
        ) : null}
      </div>
      {authorize.isError ? (
        <p className="mt-4 text-sm text-red-500" role="alert">
          {authorize.error instanceof Error
            ? authorize.error.message
            : "Request failed."}
        </p>
      ) : null}
    </section>
  );
}
