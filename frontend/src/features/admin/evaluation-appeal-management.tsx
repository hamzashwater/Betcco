"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useState } from "react";

type Appeal = {
  id: string;
  evaluationRequestId: string;
  status: string;
  reason: string;
  decisionRationale: string | null;
  createdAtUtc: string;
};

type Decision = "Upheld" | "Rejected";
type PdfReportStatus = {
  isConfigured: boolean;
  unavailableReason: string | null;
};

export function EvaluationAppealManagement() {
  const locale = useLocale();
  const ar = locale === "ar";
  const client = useQueryClient();
  const [drafts, setDrafts] = useState<
    Record<string, { decision: Decision; rationale: string }>
  >({});
  const appeals = useQuery({
    queryKey: ["evaluation-appeals", "review-queue"],
    queryFn: () => api<Appeal[]>("/evaluation-appeals/review-queue"),
    retry: false,
  });
  const pdfReportStatus = useQuery({
    queryKey: ["assessment-pdf-reports", "status"],
    queryFn: () => api<PdfReportStatus>("/assessment-pdf-reports/status"),
    retry: false,
  });
  const review = useMutation({
    mutationFn: ({
      appealId,
      decision,
      rationale,
    }: {
      appealId: string;
      decision: Decision;
      rationale: string;
    }) =>
      api<void>(`/evaluation-appeals/${appealId}/review`, {
        method: "POST",
        body: JSON.stringify({
          status: decision,
          decisionRationale: rationale.trim(),
        }),
      }),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ["evaluation-appeals", "review-queue"],
      }),
  });
  const update = (
    appealId: string,
    next: Partial<{ decision: Decision; rationale: string }>,
  ) =>
    setDrafts((current) => {
      const currentDraft = current[appealId] ?? {
        decision: "Rejected" as Decision,
        rationale: "",
      };
      return { ...current, [appealId]: { ...currentDraft, ...next } };
    });
  const date = (value: string) =>
    new Intl.DateTimeFormat(ar ? "ar-JO" : "en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  return (
    <section className="shell py-8 sm:py-10">
      <div className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          BETCCO · {ar ? "النزاهة الأكاديمية" : "academic integrity"}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
          {ar ? "مراجعة الاستئنافات الأكاديمية" : "Academic appeal review"}
        </h1>
        <p className="mt-3 leading-7 text-muted">
          {ar
            ? "لا تظهر هذه القائمة إلا للمراجع المؤهل المستقل عن التقييم الأصلي. القرار يوثق النتيجة ولا يغير الدرجة تلقائيًا."
            : "Only a qualified reviewer independent from the original assessment can access this queue. A decision is recorded without changing the grade automatically."}
        </p>
      </div>

      {appeals.isPending ? <p className="mt-6 text-muted">…</p> : null}
      {appeals.isError ? (
        <p role="alert" className="card mt-6 p-4 text-red-500">
          {appeals.error instanceof Error
            ? appeals.error.message
            : ar
              ? "تعذر تحميل قائمة الاستئنافات."
              : "Unable to load the appeal queue."}
        </p>
      ) : null}
      {appeals.isSuccess && appeals.data.length === 0 ? (
        <p className="card mt-6 p-5 text-muted">
          {ar
            ? "لا توجد استئنافات معلقة للمراجعة."
            : "There are no appeals awaiting review."}
        </p>
      ) : null}
      <div className="mt-6 grid gap-4">
        {appeals.data?.map((appeal) => {
          const draft = drafts[appeal.id] ?? {
            decision: "Rejected" as Decision,
            rationale: "",
          };
          const canReview = draft.rationale.trim().length >= 10;
          return (
            <article key={appeal.id} className="card grid gap-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-black text-primary">
                  {appeal.status}
                </span>
                <time
                  className="text-sm text-muted"
                  dateTime={appeal.createdAtUtc}
                >
                  {date(appeal.createdAtUtc)}
                </time>
              </div>
              <div className="rounded-xl border border-border bg-page/40 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-muted">
                  {ar ? "سبب الطالب" : "Student reason"}
                </p>
                <p className="mt-2 whitespace-pre-wrap leading-7">
                  {appeal.reason}
                </p>
              </div>
              <a
                href={`/api/v1/assessment-audit-exports/${appeal.evaluationRequestId}`}
                className="focus-ring justify-self-start rounded-xl border border-border px-4 py-2 text-sm font-black hover:border-primary"
              >
                {ar
                  ? "تنزيل سجل التدقيق المنظم"
                  : "Download structured audit record"}
              </a>
              {pdfReportStatus.data?.isConfigured ? (
                <a
                  href={`/api/v1/assessment-pdf-reports/${appeal.evaluationRequestId}?locale=${locale}`}
                  className="focus-ring justify-self-start rounded-xl border border-border px-4 py-2 text-sm font-black hover:border-primary"
                >
                  {ar ? "تنزيل تقرير PDF" : "Download PDF report"}
                </a>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                <label className="grid gap-2 text-sm font-black">
                  {ar ? "القرار" : "Decision"}
                  <select
                    className="focus-ring rounded-xl border border-border bg-background px-3 py-3 text-foreground"
                    value={draft.decision}
                    onChange={(event) =>
                      update(appeal.id, {
                        decision: event.target.value as Decision,
                      })
                    }
                  >
                    <option value="Upheld">
                      {ar ? "قبول الاستئناف" : "Uphold appeal"}
                    </option>
                    <option value="Rejected">
                      {ar ? "رفض الاستئناف" : "Reject appeal"}
                    </option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-black">
                  {ar ? "تعليل القرار" : "Decision rationale"}
                  <textarea
                    className="focus-ring min-h-28 rounded-xl border border-border bg-background px-3 py-3 text-foreground"
                    value={draft.rationale}
                    minLength={10}
                    maxLength={4000}
                    onChange={(event) =>
                      update(appeal.id, { rationale: event.target.value })
                    }
                    aria-describedby={`appeal-rationale-${appeal.id}`}
                  />
                  <span
                    id={`appeal-rationale-${appeal.id}`}
                    className="text-xs font-normal text-muted"
                  >
                    {ar
                      ? "10 أحرف على الأقل. يجب تسجيل أي إعادة تقييم لاحقة كإجراء مستقل."
                      : "At least 10 characters. Any reassessment must be recorded as a separate action."}
                  </span>
                </label>
              </div>
              <button
                type="button"
                onClick={() => review.mutate({ appealId: appeal.id, ...draft })}
                disabled={!canReview || review.isPending}
                className="focus-ring justify-self-start rounded-xl bg-primary px-5 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {review.isPending
                  ? ar
                    ? "جارٍ التسجيل…"
                    : "Recording…"
                  : ar
                    ? "تسجيل القرار"
                    : "Record decision"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
