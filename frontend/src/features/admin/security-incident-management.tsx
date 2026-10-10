"use client";

import { formatLocalizedDateTime } from "@/i18n/date-time";
import { api } from "@/lib/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type Severity = "Low" | "Medium" | "High" | "Critical";
type Status = "Open" | "Assessing" | "Contained" | "Closed";
type Audience = "AffectedIndividuals" | "RegulatoryAuthority";
type Deadline = {
  id: string;
  audience: Audience;
  dueAtUtc: string;
  recordedAtUtc?: string | null;
};
type Assessment = {
  potentialPersonalDataImpact: boolean;
  legalConfirmationRequired: boolean;
  legalNotificationRequired: boolean;
  legalConfirmedAtUtc?: string | null;
  legalConfirmedByUserId?: string | null;
  legalDecisionSummary?: string | null;
  notificationDeadlines: Deadline[];
};
type Incident = {
  id: string;
  title: string;
  summary: string;
  reasonCode: string;
  severity: Severity;
  status: Status;
  detectedAtUtc: string;
  containedAtUtc?: string | null;
  closureSummary?: string | null;
  breachAssessment?: Assessment | null;
  createdAtUtc: string;
};
type IncidentPage = {
  items: Incident[];
  page: number;
  pageSize: number;
  totalCount: number;
};

const severities: Severity[] = ["Low", "Medium", "High", "Critical"];
const statuses: Status[] = ["Open", "Assessing", "Contained", "Closed"];

export function SecurityIncidentManagement() {
  const locale = useLocale();
  const t = useTranslations("adminWorkspace");

  const [selected, setSelected] = useState<Incident | null>(null);
  const [status, setStatus] = useState<Status | "">("");
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [reasonCode, setReasonCode] = useState("SECURITY_REVIEW");
  const [severity, setSeverity] = useState<Severity>("Medium");
  const [potentialDataImpact, setPotentialDataImpact] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<Status>("Assessing");
  const [reviewReasonCode, setReviewReasonCode] = useState("SECURITY_REVIEW");
  const [legalNotificationRequired, setLegalNotificationRequired] =
    useState(false);
  const [markLegalConfirmation, setMarkLegalConfirmation] = useState(false);
  const [legalDecisionSummary, setLegalDecisionSummary] = useState("");
  const [closureSummary, setClosureSummary] = useState("");
  const [deadlineNotes, setDeadlineNotes] = useState<Record<string, string>>(
    {},
  );
  const query = useQuery({
    queryKey: ["security-incidents", status],
    queryFn: () =>
      api<IncidentPage>(
        `/security-incidents?pageSize=50${status ? `&status=${status}` : ""}`,
      ),
    retry: false,
  });
  const selectIncident = (incident: Incident) => {
    setSelected(incident);
    const assessment = incident.breachAssessment;
    setReviewStatus(incident.status === "Open" ? "Assessing" : incident.status);
    setReviewReasonCode(incident.reasonCode);
    setPotentialDataImpact(Boolean(assessment?.potentialPersonalDataImpact));
    setLegalNotificationRequired(
      Boolean(assessment?.legalNotificationRequired),
    );
    setMarkLegalConfirmation(Boolean(assessment?.legalConfirmedAtUtc));
    setLegalDecisionSummary(assessment?.legalDecisionSummary ?? "");
    setClosureSummary(incident.closureSummary ?? "");
    setDeadlineNotes({});
    review.reset();
    recordDeadline.reset();
  };
  const create = useMutation({
    mutationFn: () =>
      api<Incident>("/security-incidents", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim(),
          reasonCode: reasonCode.trim(),
          severity,
          potentialPersonalDataImpact: potentialDataImpact,
        }),
      }),
    onSuccess: (incident) => {
      setTitle("");
      setSummary("");
      setReasonCode("SECURITY_REVIEW");
      setPotentialDataImpact(false);
      setShowCreate(false);
      selectIncident(incident);
      void query.refetch();
    },
  });
  const review = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("No incident selected.");
      return api<Incident>(`/security-incidents/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: reviewStatus,
          potentialPersonalDataImpact: potentialDataImpact,
          legalNotificationRequired,
          markLegalConfirmation,
          legalDecisionSummary: legalDecisionSummary.trim() || null,
          closureSummary: closureSummary.trim() || null,
          reasonCode: reviewReasonCode.trim(),
        }),
      });
    },
    onSuccess: (incident) => {
      selectIncident(incident);
      void query.refetch();
    },
  });
  const recordDeadline = useMutation({
    mutationFn: ({
      incidentId,
      deadlineId,
      note,
    }: {
      incidentId: string;
      deadlineId: string;
      note: string;
    }) =>
      api<void>(
        `/security-incidents/${incidentId}/notification-deadlines/${deadlineId}/record`,
        { method: "POST", body: JSON.stringify({ note }) },
      ),
    onSuccess: () => {
      if (selected) {
        void api<Incident>(`/security-incidents/${selected.id}`).then(
          (incident) => {
            selectIncident(incident);
            void query.refetch();
          },
        );
      }
    },
  });
  const date = (value: string) => formatLocalizedDateTime(value, locale);
  const severityLabel = (value: Severity) =>
    ({
      Low: t("securityIncidents.low"),
      Medium: t("securityIncidents.medium"),
      High: t("securityIncidents.high"),
      Critical: t("securityIncidents.critical"),
    })[value];
  const statusLabel = (value: Status) =>
    ({
      Open: t("securityIncidents.open"),
      Assessing: t("securityIncidents.assessing"),
      Contained: t("securityIncidents.contained"),
      Closed: t("securityIncidents.closed"),
    })[value];
  const audienceLabel = (value: Audience) =>
    value === "AffectedIndividuals"
      ? t("securityIncidents.affectedIndividuals")
      : t("securityIncidents.regulatoryAuthority");
  const isClosed = selected?.status === "Closed";
  const legalDecisionRecorded = Boolean(
    selected?.breachAssessment?.legalConfirmedAtUtc,
  );

  return (
    <section className="shell py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
            {t("securityIncidents.bETCCOSecurityOperations")}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            {t("securityIncidents.securityIncidentRegister")}
          </h1>
          <p className="mt-3 leading-7 text-muted">
            {t(
              "securityIncidents.aRestrictedInternalRegisterArticle20DeadlinesAreTrackedOnlyAfterA",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((open) => !open)}
          className="focus-ring rounded-xl bg-primary px-4 py-3 font-black text-slate-950"
        >
          {showCreate
            ? t("securityIncidents.hideForm")
            : t("securityIncidents.logIncident")}
        </button>
      </div>

      {showCreate && (
        <form
          className="card mt-6 grid gap-4 p-5 sm:grid-cols-2 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <label className="grid gap-2 text-sm font-black">
            {t("securityIncidents.incidentTitle")}
            <input
              className="focus-ring rounded-xl border border-border bg-background px-3 py-2 text-foreground"
              value={title}
              maxLength={240}
              required
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm font-black">
            {t("securityIncidents.reasonCode")}
            <input
              className="focus-ring rounded-xl border border-border bg-background px-3 py-2 text-foreground"
              value={reasonCode}
              maxLength={80}
              required
              onChange={(event) => setReasonCode(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm font-black">
            {t("securityIncidents.severity")}
            <select
              className="focus-ring rounded-xl border border-border bg-background px-3 py-2 text-foreground"
              value={severity}
              onChange={(event) => setSeverity(event.target.value as Severity)}
            >
              {severities.map((item) => (
                <option key={item} value={item}>
                  {severityLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-3 self-end rounded-xl border border-border bg-surface-solid/50 px-3 py-2 text-sm leading-6 text-muted">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={potentialDataImpact}
              onChange={(event) => setPotentialDataImpact(event.target.checked)}
            />
            {t("securityIncidents.theIncidentMayAffectPersonalData")}
          </label>
          <label className="grid gap-2 text-sm font-black sm:col-span-2">
            {t("securityIncidents.conciseOperationalSummary")}
            <textarea
              className="focus-ring min-h-28 rounded-xl border border-border bg-background p-3 text-foreground"
              value={summary}
              maxLength={4000}
              required
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="focus-ring rounded-xl bg-primary px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={create.isPending}
            >
              {create.isPending
                ? t("securityIncidents.recording")
                : t("securityIncidents.recordIncident")}
            </button>
            {create.isError && (
              <p className="mt-3 text-sm text-danger" role="alert">
                {create.error.message}
              </p>
            )}
          </div>
        </form>
      )}

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(23rem,.8fr)]">
        <div className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black">
              {t("securityIncidents.incidents")}
              {query.data ? ` (${query.data.totalCount})` : ""}
            </h2>
            <select
              className="focus-ring rounded-xl border border-border bg-background px-3 py-2 text-foreground"
              value={status}
              onChange={(event) => setStatus(event.target.value as Status | "")}
            >
              <option value="">{t("securityIncidents.allStatuses")}</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {statusLabel(item)}
                </option>
              ))}
            </select>
          </div>
          {query.isPending ? (
            <div
              className="mt-5 h-56 animate-pulse rounded-2xl bg-surface-solid"
              aria-busy
            />
          ) : query.isError ? (
            <p className="mt-5 text-sm text-danger" role="alert">
              {query.error.message}
            </p>
          ) : query.data?.items.length ? (
            <ul className="mt-5 grid gap-3">
              {query.data.items.map((incident) => (
                <li key={incident.id}>
                  <button
                    type="button"
                    onClick={() => selectIncident(incident)}
                    className={`focus-ring w-full rounded-2xl border p-4 text-start transition ${selected?.id === incident.id ? "border-primary bg-primary/10" : "border-border bg-surface-solid/45 hover:bg-surface"}`}
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-black">{incident.title}</span>
                      <span className="text-sm text-primary">
                        {statusLabel(incident.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {severityLabel(incident.severity)} ·{" "}
                      {date(incident.detectedAtUtc)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted">
              {t("securityIncidents.thereAreNoIncidentsInThisStatus")}
            </p>
          )}
        </div>

        <aside className="card h-fit p-5 sm:p-6" aria-live="polite">
          {!selected ? (
            <p className="text-muted">
              {t("securityIncidents.selectAnIncidentToReviewIt")}
            </p>
          ) : (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                review.mutate();
              }}
            >
              <div>
                <p className="font-black">{selected.title}</p>
                <p className="mt-1 text-sm text-muted">
                  {severityLabel(selected.severity)} ·{" "}
                  {date(selected.detectedAtUtc)}
                </p>
              </div>
              <p className="rounded-xl border border-border bg-surface-solid/50 p-3 text-sm leading-6 text-muted">
                {selected.summary}
              </p>
              <label className="grid gap-2 text-sm font-black">
                {t("securityIncidents.status")}
                <select
                  className="focus-ring rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                  value={reviewStatus}
                  disabled={isClosed}
                  onChange={(event) =>
                    setReviewStatus(event.target.value as Status)
                  }
                >
                  {statuses.map((item) => (
                    <option key={item} value={item}>
                      {statusLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-black">
                {t("securityIncidents.reviewReasonCode")}
                <input
                  className="focus-ring rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                  value={reviewReasonCode}
                  disabled={isClosed}
                  maxLength={80}
                  required
                  onChange={(event) => setReviewReasonCode(event.target.value)}
                />
              </label>
              <label className="flex items-start gap-3 text-sm leading-6 text-muted">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={potentialDataImpact}
                  disabled={isClosed || legalDecisionRecorded}
                  onChange={(event) =>
                    setPotentialDataImpact(event.target.checked)
                  }
                />
                {t("securityIncidents.thereMayBePersonaldataImpact")}
              </label>
              <label className="flex items-start gap-3 text-sm leading-6 text-muted">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={legalNotificationRequired}
                  disabled={
                    isClosed || legalDecisionRecorded || !potentialDataImpact
                  }
                  onChange={(event) =>
                    setLegalNotificationRequired(event.target.checked)
                  }
                />
                {t(
                  "securityIncidents.theAuthorisedLegalReviewerDeterminedThatTheArticle20NotificationT",
                )}
              </label>
              <label className="grid gap-2 text-sm font-black">
                {t("securityIncidents.article20TriggerassessmentReason")}
                <textarea
                  className="focus-ring min-h-24 rounded-xl border border-border bg-background p-3 text-foreground"
                  value={legalDecisionSummary}
                  disabled={isClosed || legalDecisionRecorded}
                  maxLength={2000}
                  onChange={(event) =>
                    setLegalDecisionSummary(event.target.value)
                  }
                />
              </label>
              <label className="flex items-start gap-3 text-sm leading-6 text-muted">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={markLegalConfirmation}
                  disabled={isClosed || legalDecisionRecorded}
                  onChange={(event) =>
                    setMarkLegalConfirmation(event.target.checked)
                  }
                />
                {t(
                  "securityIncidents.iRecordTheAuthorisedLegalReviewDecisionOnTheArticle20Notification",
                )}
              </label>
              {legalDecisionRecorded && selected.breachAssessment ? (
                <p className="rounded-xl border border-border bg-surface-solid/50 p-3 text-sm leading-6 text-muted">
                  {t(
                    "securityIncidents.theArticle20DecisionWasRecordedDateByUser",
                    {
                      date: date(
                        selected.breachAssessment.legalConfirmedAtUtc!,
                      ),
                      user:
                        selected.breachAssessment.legalConfirmedByUserId ??
                        t("securityIncidents.authorizedUser"),
                    },
                  )}
                </p>
              ) : null}
              {reviewStatus === "Closed" && (
                <label className="grid gap-2 text-sm font-black">
                  {t("securityIncidents.closureSummary")}
                  <textarea
                    className="focus-ring min-h-24 rounded-xl border border-border bg-background p-3 text-foreground"
                    value={closureSummary}
                    disabled={isClosed}
                    maxLength={2000}
                    onChange={(event) => setClosureSummary(event.target.value)}
                  />
                </label>
              )}
              {selected.breachAssessment?.notificationDeadlines.length ? (
                <div className="grid gap-3 rounded-xl border border-border bg-surface-solid/50 p-3">
                  <p className="font-black">
                    {t("securityIncidents.reminderDeadlines")}
                  </p>
                  {selected.breachAssessment.notificationDeadlines.map(
                    (deadline) => (
                      <div
                        key={deadline.id}
                        className="rounded-lg border border-border p-3 text-sm"
                      >
                        <p className="font-bold">
                          {audienceLabel(deadline.audience)}
                        </p>
                        <p className="mt-1 text-muted">
                          {date(deadline.dueAtUtc)}
                        </p>
                        {deadline.recordedAtUtc ? (
                          <p className="mt-2 text-emerald-600">
                            {t("securityIncidents.actionRecorded")} ·{" "}
                            {date(deadline.recordedAtUtc)}
                          </p>
                        ) : (
                          <div className="mt-3 flex gap-2">
                            <input
                              className="focus-ring min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground"
                              value={deadlineNotes[deadline.id] ?? ""}
                              maxLength={1000}
                              placeholder={t(
                                "securityIncidents.externalActionNote",
                              )}
                              onChange={(event) =>
                                setDeadlineNotes((notes) => ({
                                  ...notes,
                                  [deadline.id]: event.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="focus-ring rounded-lg border border-primary px-3 py-1.5 font-bold text-primary disabled:opacity-50"
                              disabled={
                                recordDeadline.isPending ||
                                !deadlineNotes[deadline.id]?.trim()
                              }
                              onClick={() =>
                                recordDeadline.mutate({
                                  incidentId: selected.id,
                                  deadlineId: deadline.id,
                                  note: deadlineNotes[deadline.id].trim(),
                                })
                              }
                            >
                              {t("securityIncidents.record")}
                            </button>
                          </div>
                        )}
                      </div>
                    ),
                  )}
                </div>
              ) : null}
              {!isClosed && (
                <button
                  type="submit"
                  className="focus-ring rounded-xl bg-primary px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={review.isPending}
                >
                  {review.isPending
                    ? t("securityIncidents.saving")
                    : t("securityIncidents.saveReview")}
                </button>
              )}
              {review.isError && (
                <p className="text-sm text-danger" role="alert">
                  {review.error.message}
                </p>
              )}
              {recordDeadline.isError && (
                <p className="text-sm text-danger" role="alert">
                  {recordDeadline.error.message}
                </p>
              )}
            </form>
          )}
        </aside>
      </div>
    </section>
  );
}
