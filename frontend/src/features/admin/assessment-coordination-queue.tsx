"use client";

import { api } from "@/lib/api";
import { academicText } from "@/lib/academic-localization";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useState } from "react";

type CoordinationStatus =
  "PendingAssignment" | "Assigned" | "UnderReview" | "NeedsRevision";

type CoordinationItem = {
  id: string;
  status: CoordinationStatus;
  createdAtUtc: string;
  updatedAtUtc: string;
  isRetake: boolean;
  qualificationCode: string | null;
  qualificationVersionCode: string | null;
  unitCode: string | null;
  unitArabicTitle: string | null;
  unitEnglishTitle: string | null;
  evaluatorDisplayName: string | null;
  assignedAtUtc: string | null;
  hasEligibleEvaluator: boolean | null;
  blockerCode:
    "AcademicMappingRequired" | "NoEligibleEvaluator" | "StateChanged" | null;
  expectedCompletionAtUtc: string | null;
  expectedCompletionState: "NotSet" | "OnTrack" | "Overdue";
};

type CoordinationPage = {
  items: CoordinationItem[];
  page: number;
  pageSize: number;
  totalCount: number;
};

const pageSize = 10;
const statuses: { value: CoordinationStatus; en: string; ar: string }[] = [
  {
    value: "PendingAssignment",
    en: "Awaiting assignment",
    ar: "بانتظار الإسناد",
  },
  { value: "Assigned", en: "Assigned", ar: "مسند" },
  { value: "UnderReview", en: "Under review", ar: "قيد المراجعة" },
  { value: "NeedsRevision", en: "Needs revision", ar: "بحاجة لتعديل" },
];

export function AssessmentCoordinationQueue() {
  const locale = useLocale();
  const ar = locale === "ar";
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<CoordinationStatus | "">("");
  const [expectedState, setExpectedState] = useState<
    "" | CoordinationItem["expectedCompletionState"]
  >("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [targetLocal, setTargetLocal] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const queue = useQuery({
    queryKey: ["assessment-coordination", status, expectedState, page],
    queryFn: () =>
      api<CoordinationPage>(
        `/assessment-coordination/queue?page=${page}&pageSize=${pageSize}${status ? `&status=${status}` : ""}${expectedState ? `&expectedCompletionState=${expectedState}` : ""}`,
      ),
    refetchInterval: 60_000,
    retry: false,
  });

  async function saveExpectedCompletion(id: string) {
    const parsed = new Date(targetLocal);
    if (
      !Number.isFinite(parsed.getTime()) ||
      !reason.trim() ||
      reason.trim().length > 500
    ) {
      setSaveError(true);
      return;
    }
    setSaving(true);
    setSaveError(false);
    setSavedId(null);
    try {
      await api<void>(`/assessment-coordination/${id}/expected-completion`, {
        method: "PUT",
        body: JSON.stringify({
          expectedCompletionAtUtc: parsed.toISOString(),
          reason: reason.trim(),
        }),
      });
      await queryClient.invalidateQueries({
        queryKey: ["assessment-coordination"],
      });
      setEditingId(null);
      setTargetLocal("");
      setReason("");
      setSavedId(id);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="mt-6 min-w-0 rounded-[1.25rem] border border-border p-4 sm:p-5"
      aria-label={ar ? "متابعة التقييمات" : "Assessment coordination"}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">
            {ar ? "متابعة التقييمات" : "Assessment coordination"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {ar
              ? "حالات الطلبات النشطة وسياقها الأكاديمي والإسناد الحالي."
              : "Active request states, recorded academic context, and current assignments."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-sm font-bold">
            <span>{ar ? "تصفية حسب الحالة" : "Filter by status"}</span>
            <select
              className="focus-ring min-w-0 rounded-xl border border-border bg-surface-solid px-3 py-2 text-foreground"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as CoordinationStatus | "");
                setPage(1);
              }}
            >
              <option value="">
                {ar ? "كل الحالات النشطة" : "All active states"}
              </option>
              {statuses.map((option) => (
                <option key={option.value} value={option.value}>
                  {ar ? option.ar : option.en}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            <span>
              {ar ? "تصفية حسب موعد الإنجاز" : "Filter by completion target"}
            </span>
            <select
              className="focus-ring min-w-0 rounded-xl border border-border bg-surface-solid px-3 py-2 text-foreground"
              value={expectedState}
              onChange={(event) => {
                setExpectedState(event.target.value as typeof expectedState);
                setPage(1);
              }}
            >
              <option value="">
                {ar ? "كل مواعيد الإنجاز" : "All completion targets"}
              </option>
              <option value="NotSet">{ar ? "غير محدد" : "Not set"}</option>
              <option value="OnTrack">{ar ? "ضمن الموعد" : "On track"}</option>
              <option value="Overdue">{ar ? "متأخر" : "Overdue"}</option>
            </select>
          </label>
        </div>
      </div>

      {queue.isPending ? (
        <p className="mt-5 text-sm text-muted" aria-busy="true">
          {ar ? "جارٍ تحميل قائمة التقييمات…" : "Loading assessment queue…"}
        </p>
      ) : queue.isError ? (
        <p className="mt-5 text-sm text-red-600" role="alert">
          {ar
            ? "تعذر تحميل قائمة التقييمات."
            : "Unable to load the assessment queue."}
        </p>
      ) : queue.data.items.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          {ar
            ? "لا توجد طلبات في هذه الحالة."
            : "No requests match this status."}
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-3">
            {queue.data.items.map((item) => {
              const label = statuses.find(
                (option) => option.value === item.status,
              );
              const unitTitle = academicText(
                locale,
                item.unitArabicTitle,
                item.unitEnglishTitle,
              );
              const blocker =
                item.blockerCode === "AcademicMappingRequired"
                  ? ar
                    ? "يلزم ربط أكاديمي معتمد قبل الإسناد."
                    : "Canonical academic mapping is required before assignment."
                  : item.blockerCode === "NoEligibleEvaluator"
                    ? ar
                      ? "لا يوجد مقيّم مؤهل لهذه الوحدة حاليًا."
                      : "No evaluator is currently eligible for this Unit."
                    : item.blockerCode === "StateChanged"
                      ? ar
                        ? "تغيرت حالة الطلب؛ حدّث القائمة."
                        : "Request state changed; refresh the queue."
                      : null;
              return (
                <article
                  key={item.id}
                  className="min-w-0 rounded-xl border border-border bg-surface-solid/60 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-black">
                        {ar ? "طلب" : "Request"} {item.id.slice(0, 8)}
                      </h3>
                      <p className="mt-1 text-sm text-muted">
                        {item.qualificationCode && item.unitCode
                          ? `${item.qualificationCode} ${item.qualificationVersionCode ?? ""} · ${item.unitCode} ${unitTitle ?? ""}`
                          : ar
                            ? "السياق الأكاديمي المعتمد غير متاح"
                            : "Canonical academic context unavailable"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-bold">
                      <span className="rounded-full border border-border px-3 py-1">
                        {ar ? label?.ar : label?.en}
                      </span>
                      {item.isRetake && (
                        <span className="rounded-full border border-border px-3 py-1">
                          {ar ? "إعادة تقييم" : "Retake"}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    {item.evaluatorDisplayName
                      ? ar
                        ? `المقيّم: ${item.evaluatorDisplayName}`
                        : `Evaluator: ${item.evaluatorDisplayName}`
                      : ar
                        ? "لم يُسند مقيّم بعد."
                        : "No evaluator assigned yet."}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {ar ? "آخر تحديث:" : "Updated:"}{" "}
                    {new Date(item.updatedAtUtc).toLocaleString(
                      ar ? "ar-JO" : "en-GB",
                    )}
                  </p>
                  <p
                    className={`mt-3 text-sm font-semibold ${item.expectedCompletionState === "Overdue" ? "text-red-700" : "text-muted"}`}
                    role={
                      item.expectedCompletionState === "Overdue"
                        ? "status"
                        : undefined
                    }
                  >
                    {item.expectedCompletionState === "Overdue"
                      ? ar
                        ? "متأخر"
                        : "Overdue"
                      : item.expectedCompletionState === "OnTrack"
                        ? ar
                          ? "ضمن الموعد"
                          : "On track"
                        : ar
                          ? "موعد الإنجاز غير محدد"
                          : "Completion target not set"}
                    {item.expectedCompletionAtUtc
                      ? ` · ${new Date(item.expectedCompletionAtUtc).toLocaleString(ar ? "ar-JO" : "en-GB")}`
                      : ""}
                  </p>
                  <button
                    type="button"
                    className="focus-ring mt-3 rounded-xl border border-border px-3 py-2 text-sm font-bold"
                    onClick={() => {
                      setEditingId(editingId === item.id ? null : item.id);
                      setTargetLocal("");
                      setReason("");
                      setSaveError(false);
                    }}
                  >
                    {item.expectedCompletionAtUtc
                      ? ar
                        ? "تعديل موعد الإنجاز"
                        : "Revise completion target"
                      : ar
                        ? "تحديد موعد الإنجاز"
                        : "Set completion target"}
                  </button>
                  {savedId === item.id && (
                    <p className="mt-2 text-sm text-green-700" role="status">
                      {ar ? "تم حفظ موعد الإنجاز." : "Completion target saved."}
                    </p>
                  )}
                  {editingId === item.id && (
                    <form
                      className="mt-3 grid max-w-lg gap-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveExpectedCompletion(item.id);
                      }}
                    >
                      <label className="grid gap-1 text-sm font-bold">
                        <span>
                          {ar ? "موعد الإنجاز المتوقع" : "Expected completion"}
                        </span>
                        <input
                          className="focus-ring min-w-0 rounded-xl border border-border bg-surface-solid px-3 py-2"
                          type="datetime-local"
                          required
                          value={targetLocal}
                          onChange={(event) =>
                            setTargetLocal(event.target.value)
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-bold">
                        <span>{ar ? "سبب داخلي" : "Internal reason"}</span>
                        <textarea
                          className="focus-ring min-w-0 rounded-xl border border-border bg-surface-solid px-3 py-2"
                          required
                          maxLength={500}
                          rows={3}
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                        />
                      </label>
                      {saveError && (
                        <p className="text-sm text-red-700" role="alert">
                          {ar
                            ? "تعذر حفظ الموعد. تحقق من الوقت والسبب ثم حاول مجددًا."
                            : "Could not save the target. Check the time and reason, then try again."}
                        </p>
                      )}
                      <button
                        type="submit"
                        disabled={saving}
                        className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {saving
                          ? ar
                            ? "جارٍ الحفظ…"
                            : "Saving…"
                          : ar
                            ? "حفظ الموعد"
                            : "Save target"}
                      </button>
                    </form>
                  )}
                  {item.hasEligibleEvaluator &&
                    item.status === "PendingAssignment" && (
                      <p className="mt-3 text-sm text-green-700" role="status">
                        {ar
                          ? "يوجد مقيّم مؤهل متاح للإسناد."
                          : "An eligible evaluator is available for assignment."}
                      </p>
                    )}
                  {blocker && (
                    <p className="mt-3 text-sm text-amber-600" role="status">
                      {blocker}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted" aria-live="polite">
              {ar
                ? `الصفحة ${queue.data.page} · ${queue.data.totalCount} طلب`
                : `Page ${queue.data.page} · ${queue.data.totalCount} requests`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="focus-ring rounded-xl border border-border px-3 py-2 disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                {ar ? "السابق" : "Previous"}
              </button>
              <button
                type="button"
                className="focus-ring rounded-xl border border-border px-3 py-2 disabled:opacity-50"
                disabled={page * queue.data.pageSize >= queue.data.totalCount}
                onClick={() => setPage((value) => value + 1)}
              >
                {ar ? "التالي" : "Next"}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
