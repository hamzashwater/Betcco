"use client";

import { ApiError, api } from "@/lib/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardCheck, UserRoundCheck } from "lucide-react";
import { useLocale } from "next-intl";
import { useState } from "react";

type PendingEvaluation = {
  id: string;
  status: string;
  studentComment?: string;
  filesCount: number;
  criteria: string[];
};
type Candidate = { id: string; displayName: string };

export function EligibleEvaluatorAssignment({
  evaluation,
  onAssigned,
}: {
  evaluation: PendingEvaluation;
  onAssigned: () => void;
}) {
  const ar = useLocale() === "ar";
  const [selected, setSelected] = useState("");
  const candidates = useQuery({
    queryKey: ["eligible-evaluators", evaluation.id],
    queryFn: () =>
      api<Candidate[]>(`/evaluations/${evaluation.id}/eligible-evaluators`),
    retry: false,
  });
  const assign = useMutation({
    mutationFn: () =>
      api(`/evaluations/${evaluation.id}/assign`, {
        method: "POST",
        body: JSON.stringify({ teacherUserId: selected }),
      }),
    onSuccess: onAssigned,
  });
  const blocked =
    candidates.error instanceof ApiError &&
    candidates.error.code === "ACADEMIC_MAPPING_REQUIRED";
  const stale =
    assign.error instanceof ApiError &&
    [
      "UNIT_SPECIALISM_REQUIRED",
      "EVALUATOR_NOT_ELIGIBLE",
      "ASSIGNMENT_CONFLICT",
    ].includes(assign.error.code ?? "");

  return (
    <article className="card min-w-0 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-black text-primary">
            <ClipboardCheck size={18} aria-hidden="true" />
            {ar ? "طلب بانتظار الإسناد" : "Request awaiting assignment"}
          </p>
          <p className="mt-3 max-w-2xl break-words text-sm leading-6 text-muted">
            {evaluation.studentComment ||
              (ar
                ? "لا توجد ملاحظة من الطالب."
                : "No student note was provided.")}
          </p>
          <p className="mt-3 text-xs text-muted">
            {evaluation.filesCount} {ar ? "ملفات" : "files"} ·{" "}
            {evaluation.criteria.length} {ar ? "معايير" : "criteria"}
          </p>
        </div>
        <span className="rounded-full border border-border bg-white/5 px-3 py-1 text-xs font-bold text-muted">
          {evaluation.status}
        </span>
      </div>
      {candidates.isPending ? (
        <p className="mt-5 text-sm text-muted" aria-busy>
          {ar
            ? "جارٍ تحميل المقيمين المؤهلين…"
            : "Loading eligible evaluators…"}
        </p>
      ) : blocked ? (
        <p className="mt-5 text-sm text-amber-600" role="alert">
          {ar
            ? "لا يمكن إسناد هذا الطلب التاريخي حتى تُحدد وحدته الأكاديمية صراحةً."
            : "This historical request needs explicit academic Unit mapping before assignment."}
        </p>
      ) : candidates.isError ? (
        <p className="mt-5 text-sm text-red-600" role="alert">
          {ar
            ? "تعذر تحميل المقيمين المؤهلين."
            : "Unable to load eligible evaluators."}
        </p>
      ) : candidates.data?.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          {ar
            ? "لا يوجد مقيمون مؤهلون لهذه الوحدة."
            : "No eligible evaluators for this Unit."}
        </p>
      ) : (
        <div className="mt-5 flex flex-wrap gap-2">
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className="focus-ring min-w-0 flex-1 rounded-xl border border-border bg-transparent px-3 py-2.5 text-sm text-foreground"
            aria-label={
              ar ? "اختر مقيّمًا مؤهلاً" : "Select eligible evaluator"
            }
          >
            <option value="">
              {ar ? "اختر مقيّمًا مؤهلاً" : "Select eligible evaluator"}
            </option>
            {candidates.data?.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.displayName}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selected || assign.isPending}
            onClick={() => assign.mutate()}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UserRoundCheck size={17} aria-hidden="true" />
            {assign.isPending
              ? ar
                ? "جارٍ الإسناد…"
                : "Assigning…"
              : ar
                ? "إسناد"
                : "Assign"}
          </button>
        </div>
      )}
      {assign.isError && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {stale
            ? ar
              ? "تغيرت أهلية هذا المقيم. حدّث القائمة واختر مقيّمًا مؤهلاً."
              : "This evaluator is no longer eligible. Refresh the list and choose an eligible evaluator."
            : ar
              ? "تعذر إسناد الطلب. حدّث القائمة وحاول مجددًا."
              : "Unable to assign this request. Refresh the list and try again."}
        </p>
      )}
    </article>
  );
}
