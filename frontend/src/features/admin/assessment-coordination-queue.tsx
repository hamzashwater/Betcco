"use client";

import { formatLocalizedDateTime } from "@/i18n/date-time";
import { api } from "@/lib/api";
import { academicText } from "@/lib/academic-localization";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type CoordinationStatus =
  "PendingAssignment" | "Assigned" | "UnderReview" | "NeedsRevision";

type CoordinationItem = {
  id: string;
  status: CoordinationStatus;
  createdAtUtc: string;
  updatedAtUtc: string;
  isRetake: boolean;
  isResit: boolean;
  resitOfEvaluationRequestId: string | null;
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
  revisionDueAtUtc: string | null;
  effectiveRevisionDueAtUtc: string | null;
  activeDeadlineAdjustmentId: string | null;
};

type DeadlineAdjustment = {
  id: string;
  evaluationRequestId: string;
  baseDueAtUtcSnapshot: string;
  extendedDueAtUtc: string;
  grantedAtUtc: string;
  reason: string;
  revokedAtUtc: string | null;
  revocationReason: string | null;
};

type DeadlineAdjustmentSummary = {
  evaluationRequestId: string;
  baseDueAtUtc: string | null;
  effectiveDueAtUtc: string | null;
  activeAdjustmentId: string | null;
  history: DeadlineAdjustment[];
};

type CoordinationPage = {
  items: CoordinationItem[];
  page: number;
  pageSize: number;
  totalCount: number;
};

const pageSize = 10;
const statuses: {
  value: CoordinationStatus;
  label: `assessmentCoordination.statuses.${CoordinationStatus}`;
}[] = [
  {
    value: "PendingAssignment",
    label: "assessmentCoordination.statuses.PendingAssignment",
  },
  { value: "Assigned", label: "assessmentCoordination.statuses.Assigned" },
  {
    value: "UnderReview",
    label: "assessmentCoordination.statuses.UnderReview",
  },
  {
    value: "NeedsRevision",
    label: "assessmentCoordination.statuses.NeedsRevision",
  },
];

export function AssessmentCoordinationQueue() {
  const locale = useLocale();
  const t = useTranslations("adminWorkspace");
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
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustedDueLocal, setAdjustedDueLocal] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState(false);
  const [adjustmentLoading, setAdjustmentLoading] = useState(false);
  const [adjustmentSummary, setAdjustmentSummary] =
    useState<DeadlineAdjustmentSummary | null>(null);
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

  async function loadReasonableAdjustment(id: string) {
    setAdjustmentLoading(true);
    setAdjustmentError(false);
    try {
      const summary = await api<DeadlineAdjustmentSummary>(
        `/assessment-coordination/${id}/reasonable-adjustments/revision-deadline`,
      );
      setAdjustmentSummary(summary);
    } catch {
      setAdjustmentSummary(null);
      setAdjustmentError(true);
    } finally {
      setAdjustmentLoading(false);
    }
  }

  async function toggleReasonableAdjustment(id: string) {
    if (adjustingId === id) {
      setAdjustingId(null);
      setAdjustmentSummary(null);
      setAdjustedDueLocal("");
      setAdjustmentReason("");
      setAdjustmentError(false);
      return;
    }
    setAdjustingId(id);
    setAdjustedDueLocal("");
    setAdjustmentReason("");
    setAdjustmentSummary(null);
    await loadReasonableAdjustment(id);
  }

  async function grantReasonableAdjustment(id: string) {
    const parsed = new Date(adjustedDueLocal);
    if (
      !Number.isFinite(parsed.getTime()) ||
      !adjustmentReason.trim() ||
      adjustmentReason.trim().length > 500
    ) {
      setAdjustmentError(true);
      return;
    }
    setAdjustmentSaving(true);
    setAdjustmentError(false);
    try {
      await api<void>(
        `/assessment-coordination/${id}/reasonable-adjustments/revision-deadline`,
        {
          method: "POST",
          body: JSON.stringify({
            extendedDueAtUtc: parsed.toISOString(),
            reason: adjustmentReason.trim(),
          }),
        },
      );
      setAdjustedDueLocal("");
      setAdjustmentReason("");
      await queryClient.invalidateQueries({
        queryKey: ["assessment-coordination"],
      });
      await loadReasonableAdjustment(id);
    } catch {
      setAdjustmentError(true);
    } finally {
      setAdjustmentSaving(false);
    }
  }

  async function revokeReasonableAdjustment(id: string, adjustmentId: string) {
    if (adjustmentReason.trim().length > 500) {
      setAdjustmentError(true);
      return;
    }
    setAdjustmentSaving(true);
    setAdjustmentError(false);
    try {
      await api<void>(
        `/assessment-coordination/${id}/reasonable-adjustments/revision-deadline/${adjustmentId}/revoke`,
        {
          method: "POST",
          body: JSON.stringify({
            reason: adjustmentReason.trim() || null,
          }),
        },
      );
      setAdjustmentReason("");
      await queryClient.invalidateQueries({
        queryKey: ["assessment-coordination"],
      });
      await loadReasonableAdjustment(id);
    } catch {
      setAdjustmentError(true);
    } finally {
      setAdjustmentSaving(false);
    }
  }

  return (
    <section
      className="mt-6 min-w-0 rounded-[1.25rem] border border-border p-4 sm:p-5"
      aria-label={t("assessmentCoordination.title")}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">
            {t("assessmentCoordination.title")}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {t("assessmentCoordination.description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-sm font-bold">
            <span>{t("assessmentCoordination.statusFilter")}</span>
            <select
              className="focus-ring min-w-0 rounded-xl border border-border bg-surface-solid px-3 py-2 text-foreground"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as CoordinationStatus | "");
                setPage(1);
              }}
            >
              <option value="">{t("assessmentCoordination.allStates")}</option>
              {statuses.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            <span>{t("assessmentCoordination.completionFilter")}</span>
            <select
              className="focus-ring min-w-0 rounded-xl border border-border bg-surface-solid px-3 py-2 text-foreground"
              value={expectedState}
              onChange={(event) => {
                setExpectedState(event.target.value as typeof expectedState);
                setPage(1);
              }}
            >
              <option value="">{t("assessmentCoordination.allTargets")}</option>
              <option value="NotSet">
                {t("assessmentCoordination.notSet")}
              </option>
              <option value="OnTrack">
                {t("assessmentCoordination.onTrack")}
              </option>
              <option value="Overdue">
                {t("assessmentCoordination.overdue")}
              </option>
            </select>
          </label>
        </div>
      </div>

      {queue.isPending ? (
        <p className="mt-5 text-sm text-muted" aria-busy="true">
          {t("assessmentCoordination.loading")}
        </p>
      ) : queue.isError ? (
        <p className="mt-5 text-sm text-red-600" role="alert">
          {t("assessmentCoordination.loadError")}
        </p>
      ) : queue.data.items.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          {t("assessmentCoordination.empty")}
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
                  ? t("assessmentCoordination.mappingBlocker")
                  : item.blockerCode === "NoEligibleEvaluator"
                    ? t("assessmentCoordination.noEvaluatorBlocker")
                    : item.blockerCode === "StateChanged"
                      ? t("assessmentCoordination.stateChangedBlocker")
                      : null;
              return (
                <article
                  key={item.id}
                  className="min-w-0 rounded-xl border border-border bg-surface-solid/60 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-black">
                        {t("assessmentCoordination.request")}{" "}
                        {item.id.slice(0, 8)}
                      </h3>
                      <p className="mt-1 text-sm text-muted">
                        {item.qualificationCode && item.unitCode
                          ? `${item.qualificationCode} ${item.qualificationVersionCode ?? ""} · ${item.unitCode} ${unitTitle ?? ""}`
                          : t("assessmentCoordination.academicUnavailable")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-bold">
                      <span className="rounded-full border border-border px-3 py-1">
                        {label ? t(label.label) : undefined}
                      </span>
                      {item.isRetake && (
                        <span className="rounded-full border border-border px-3 py-1">
                          {t("assessmentCoordination.retake")}
                        </span>
                      )}
                      {item.isResit && (
                        <span className="rounded-full border border-border px-3 py-1">
                          {t("shared.resit")}
                        </span>
                      )}
                    </div>
                  </div>
                  {item.isResit && item.resitOfEvaluationRequestId && (
                    <p className="mt-2 text-xs text-muted">
                      {t("shared.originalRequest")}{" "}
                      {item.resitOfEvaluationRequestId.slice(0, 8)}
                    </p>
                  )}
                  <p className="mt-3 text-sm text-muted">
                    {item.evaluatorDisplayName
                      ? t("assessmentCoordination.evaluator", {
                          name: item.evaluatorDisplayName,
                        })
                      : t("assessmentCoordination.noEvaluator")}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {t("assessmentCoordination.updated")}{" "}
                    {formatLocalizedDateTime(item.updatedAtUtc, locale)}
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
                      ? t("assessmentCoordination.overdue")
                      : item.expectedCompletionState === "OnTrack"
                        ? t("assessmentCoordination.onTrack")
                        : t("assessmentCoordination.targetNotSet")}
                    {item.expectedCompletionAtUtc
                      ? ` · ${formatLocalizedDateTime(item.expectedCompletionAtUtc, locale)}`
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
                      ? t("assessmentCoordination.reviseTarget")
                      : t("assessmentCoordination.setTarget")}
                  </button>
                  {savedId === item.id && (
                    <p className="mt-2 text-sm text-green-700" role="status">
                      {t("assessmentCoordination.savedTarget")}
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
                          {t("assessmentCoordination.expectedCompletion")}
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
                        <span>
                          {t("assessmentCoordination.internalReason")}
                        </span>
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
                          {t("assessmentCoordination.saveError")}
                        </p>
                      )}
                      <button
                        type="submit"
                        disabled={saving}
                        className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {saving
                          ? t("assessmentCoordination.saving")
                          : t("assessmentCoordination.saveTarget")}
                      </button>
                    </form>
                  )}
                  {item.revisionDueAtUtc && (
                    <div className="mt-4 rounded-xl border border-border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-black">
                            {t("assessmentCoordination.revisionDeadline")}
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            {formatLocalizedDateTime(
                              item.effectiveRevisionDueAtUtc ??
                                item.revisionDueAtUtc,
                              locale,
                            )}
                          </p>
                          {item.activeDeadlineAdjustmentId && (
                            <p
                              className="mt-1 text-xs font-bold text-green-700"
                              role="status"
                            >
                              {t("assessmentCoordination.activeAdjustment")}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          className="focus-ring rounded-xl border border-border px-3 py-2 text-sm font-bold"
                          onClick={() =>
                            void toggleReasonableAdjustment(item.id)
                          }
                        >
                          {t("assessmentCoordination.manageAdjustment")}
                        </button>
                      </div>
                      {adjustingId === item.id && (
                        <div className="mt-3 grid gap-3">
                          {adjustmentLoading ? (
                            <p className="text-sm text-muted" aria-busy="true">
                              {t("assessmentCoordination.loadingHistory")}
                            </p>
                          ) : adjustmentSummary ? (
                            <>
                              {adjustmentSummary.activeAdjustmentId ? (
                                <form
                                  className="grid max-w-lg gap-3"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    void revokeReasonableAdjustment(
                                      item.id,
                                      adjustmentSummary.activeAdjustmentId!,
                                    );
                                  }}
                                >
                                  <label className="grid gap-1 text-sm font-bold">
                                    <span>
                                      {t(
                                        "assessmentCoordination.revocationReason",
                                      )}
                                    </span>
                                    <textarea
                                      className="focus-ring min-w-0 rounded-xl border border-border bg-surface-solid px-3 py-2"
                                      maxLength={500}
                                      rows={2}
                                      value={adjustmentReason}
                                      onChange={(event) =>
                                        setAdjustmentReason(event.target.value)
                                      }
                                    />
                                  </label>
                                  <button
                                    type="submit"
                                    disabled={adjustmentSaving}
                                    className="focus-ring w-fit rounded-xl border border-border px-4 py-2 text-sm font-bold disabled:opacity-50"
                                  >
                                    {adjustmentSaving
                                      ? t("assessmentCoordination.revoking")
                                      : t(
                                          "assessmentCoordination.revokeAdjustment",
                                        )}
                                  </button>
                                </form>
                              ) : (
                                <form
                                  className="grid max-w-lg gap-3"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    void grantReasonableAdjustment(item.id);
                                  }}
                                >
                                  <label className="grid gap-1 text-sm font-bold">
                                    <span>
                                      {t(
                                        "assessmentCoordination.adjustedDeadline",
                                      )}
                                    </span>
                                    <input
                                      className="focus-ring min-w-0 rounded-xl border border-border bg-surface-solid px-3 py-2"
                                      type="datetime-local"
                                      required
                                      value={adjustedDueLocal}
                                      onChange={(event) =>
                                        setAdjustedDueLocal(event.target.value)
                                      }
                                    />
                                  </label>
                                  <label className="grid gap-1 text-sm font-bold">
                                    <span>
                                      {t(
                                        "assessmentCoordination.privateReason",
                                      )}
                                    </span>
                                    <textarea
                                      className="focus-ring min-w-0 rounded-xl border border-border bg-surface-solid px-3 py-2"
                                      required
                                      maxLength={500}
                                      rows={3}
                                      value={adjustmentReason}
                                      onChange={(event) =>
                                        setAdjustmentReason(event.target.value)
                                      }
                                    />
                                  </label>
                                  <button
                                    type="submit"
                                    disabled={adjustmentSaving}
                                    className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                                  >
                                    {adjustmentSaving
                                      ? t("assessmentCoordination.saving")
                                      : t(
                                          "assessmentCoordination.grantExtension",
                                        )}
                                  </button>
                                </form>
                              )}
                              {adjustmentError && (
                                <p
                                  className="text-sm text-red-700"
                                  role="alert"
                                >
                                  {t(
                                    "assessmentCoordination.adjustmentSaveError",
                                  )}
                                </p>
                              )}
                              <div>
                                <p className="text-sm font-black">
                                  {t("assessmentCoordination.history")}
                                </p>
                                {adjustmentSummary.history.length === 0 ? (
                                  <p className="mt-1 text-sm text-muted">
                                    {t("assessmentCoordination.emptyHistory")}
                                  </p>
                                ) : (
                                  <ul className="mt-2 grid gap-2 text-sm">
                                    {adjustmentSummary.history.map(
                                      (adjustment) => (
                                        <li
                                          key={adjustment.id}
                                          className="rounded-lg border border-border p-2"
                                        >
                                          <p className="font-bold">
                                            {formatLocalizedDateTime(
                                              adjustment.extendedDueAtUtc,
                                              locale,
                                            )}
                                          </p>
                                          <p className="mt-1 text-muted">
                                            {adjustment.reason}
                                          </p>
                                          {adjustment.revokedAtUtc && (
                                            <p className="mt-1 text-xs text-muted">
                                              {t(
                                                "assessmentCoordination.revoked",
                                              )}
                                              {adjustment.revocationReason
                                                ? ` · ${adjustment.revocationReason}`
                                                : ""}
                                            </p>
                                          )}
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                )}
                              </div>
                            </>
                          ) : adjustmentError ? (
                            <p className="text-sm text-red-700" role="alert">
                              {t("assessmentCoordination.historyError")}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}
                  {item.hasEligibleEvaluator &&
                    item.status === "PendingAssignment" && (
                      <p className="mt-3 text-sm text-green-700" role="status">
                        {t("assessmentCoordination.evaluatorAvailable")}
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
              {t("assessmentCoordination.pageSummary", {
                page: queue.data.page,
                count: queue.data.totalCount,
              })}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="focus-ring rounded-xl border border-border px-3 py-2 disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                {t("shared.previous")}
              </button>
              <button
                type="button"
                className="focus-ring rounded-xl border border-border px-3 py-2 disabled:opacity-50"
                disabled={page * queue.data.pageSize >= queue.data.totalCount}
                onClick={() => setPage((value) => value + 1)}
              >
                {t("shared.next")}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
