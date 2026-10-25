"use client";

import { MutationOutcome, QueryState } from "@/components/ui/query-state";
import { Check, Plus, Save } from "lucide-react";
import styles from "./security-incident-management.module.css";
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
  const [createDataImpact, setCreateDataImpact] = useState(false);
  const [reviewNotice, setReviewNotice] = useState<string>();
  const [deadlineNotice, setDeadlineNotice] = useState<string>();
  const [selectedRefreshPending, setSelectedRefreshPending] = useState(false);
  const [selectedRefreshError, setSelectedRefreshError] = useState<string>();
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
    setReviewNotice(undefined);
    setDeadlineNotice(undefined);
    setSelectedRefreshError(undefined);
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
          potentialPersonalDataImpact: createDataImpact,
        }),
      }),
    onSuccess: (incident) => {
      setTitle("");
      setSummary("");
      setReasonCode("SECURITY_REVIEW");
      setCreateDataImpact(false);
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
      setReviewNotice(t("securityIncidents.reviewSaved"));
      void query.refetch();
    },
  });
  const refreshSelectedIncident = () => {
    if (selected) {
      setSelectedRefreshPending(true);
      setSelectedRefreshError(undefined);
      void api<Incident>(`/security-incidents/${selected.id}`)
        .then(
          (incident) => {
            selectIncident(incident);
            setDeadlineNotice(t("securityIncidents.deadlineAccepted"));
            void query.refetch();
          },
          (error: unknown) => {
            setSelectedRefreshError(
              error instanceof Error
                ? error.message
                : t("securityIncidents.selectedRefreshFailed"),
            );
          },
        )
        .finally(() => setSelectedRefreshPending(false));
    }
  };
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
      setDeadlineNotice(t("securityIncidents.deadlineAccepted"));
      refreshSelectedIncident();
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
    <section className={`shell py-8 sm:py-10 ${styles.workspace}`}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            {t("securityIncidents.bETCCOSecurityOperations")}
          </p>
          <h1 className={styles.title}>
            {t("securityIncidents.securityIncidentRegister")}
          </h1>
          <p className={styles.description}>
            {t(
              "securityIncidents.aRestrictedInternalRegisterArticle20DeadlinesAreTrackedOnlyAfterA",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((open) => !open)}
          className={styles.primary}
          aria-expanded={showCreate}
          aria-controls="incident-create-workbench"
        >
          <Plus size={18} strokeWidth={2} aria-hidden="true" />
          {showCreate
            ? t("securityIncidents.hideForm")
            : t("securityIncidents.logIncident")}
        </button>
      </header>
      {showCreate || create.isSuccess ? (
        <section
          id="incident-create-workbench"
          className={styles.createPanel}
          aria-label={t("securityIncidents.createWorkbench")}
        >
          {showCreate && (
            <form
              className={styles.createForm}
              aria-labelledby="incident-create-title"
              onSubmit={(event) => {
                event.preventDefault();
                create.mutate();
              }}
            >
              <div className={styles.fullWidth}>
                <h2 id="incident-create-title" className={styles.sectionTitle}>
                  {t("securityIncidents.createWorkbench")}
                </h2>
                <p className={styles.hint}>
                  {t("securityIncidents.createDraftHint")}
                </p>
              </div>
              <label className={styles.field}>
                {t("securityIncidents.incidentTitle")}
                <input
                  className={styles.control}
                  value={title}
                  maxLength={240}
                  required
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                {t("securityIncidents.reasonCode")}
                <input
                  className={styles.control}
                  value={reasonCode}
                  maxLength={80}
                  required
                  onChange={(event) => setReasonCode(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                {t("securityIncidents.severity")}
                <select
                  className={styles.control}
                  value={severity}
                  onChange={(event) =>
                    setSeverity(event.target.value as Severity)
                  }
                >
                  {severities.map((item) => (
                    <option key={item} value={item}>
                      {severityLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={createDataImpact}
                  onChange={(event) =>
                    setCreateDataImpact(event.target.checked)
                  }
                />
                {t("securityIncidents.theIncidentMayAffectPersonalData")}
              </label>
              <label className={`${styles.field} ${styles.fullWidth}`}>
                {t("securityIncidents.conciseOperationalSummary")}
                <textarea
                  className={styles.control}
                  value={summary}
                  maxLength={4000}
                  required
                  onChange={(event) => setSummary(event.target.value)}
                />
              </label>
              <div className={styles.fullWidth}>
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={create.isPending}
                  aria-busy={create.isPending}
                >
                  <Save size={16} strokeWidth={2} aria-hidden="true" />
                  {create.isPending
                    ? t("securityIncidents.recording")
                    : t("securityIncidents.recordIncident")}
                </button>
                {create.isError && (
                  <MutationOutcome kind="error">
                    {create.error.message}
                  </MutationOutcome>
                )}
              </div>
            </form>
          )}
          {create.isSuccess && !showCreate ? (
            <MutationOutcome kind="success">
              {t("securityIncidents.incidentCreated")}
            </MutationOutcome>
          ) : null}
        </section>
      ) : null}
      <div className={styles.columns}>
        <section
          className={styles.queue}
          aria-labelledby="incident-queue-title"
        >
          <div className={styles.queueHeader}>
            <h2 id="incident-queue-title" className={styles.sectionTitle}>
              {t("securityIncidents.incidents")}
            </h2>
            <label className={styles.field}>
              {t("securityIncidents.statusFilter")}
              <select
                className={styles.control}
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as Status | "")
                }
              >
                <option value="">{t("securityIncidents.allStatuses")}</option>
                {statuses.map((item) => (
                  <option key={item} value={item}>
                    {statusLabel(item)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.queueContext}>
            <p>{t("securityIncidents.loadedScope")}</p>
            {query.data ? (
              <p>
                {t("securityIncidents.matchingTotal", {
                  count: query.data.totalCount,
                })}
              </p>
            ) : null}
            {query.isPending && query.data === undefined ? (
              <QueryState
                kind="loading"
                title={t("securityIncidents.loadingIncidents")}
              />
            ) : null}
            {query.isError ? (
              <QueryState kind="error" title={query.error.message} />
            ) : null}
            {!query.isPending &&
            !query.isError &&
            query.data?.items.length === 0 ? (
              <QueryState
                kind="empty"
                title={t("securityIncidents.thereAreNoIncidentsInThisStatus")}
              />
            ) : null}
          </div>
          {query.data?.items.length ? (
            <ul className={styles.rows}>
              {query.data.items.map((incident) => (
                <li key={incident.id}>
                  <button
                    type="button"
                    onClick={() => selectIncident(incident)}
                    className={styles.row}
                    aria-pressed={selected?.id === incident.id}
                  >
                    <span className={styles.rowTitle}>{incident.title}</span>
                    <span className={styles.chip} data-status={incident.status}>
                      {statusLabel(incident.status)}
                    </span>
                    <span
                      className={styles.chip}
                      data-severity={incident.severity}
                    >
                      {severityLabel(incident.severity)}
                    </span>
                    <span className={styles.date}>
                      {date(incident.detectedAtUtc)}
                    </span>
                    {selected?.id === incident.id ? (
                      <span className={styles.selected}>
                        <Check size={16} strokeWidth={2} aria-hidden="true" />
                        {t("securityIncidents.selectedIncident")}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <aside
          className={styles.detail}
          aria-live="polite"
          aria-label={t("securityIncidents.incidentWorkspace")}
        >
          {!selected ? (
            <p className={styles.description}>
              {t("securityIncidents.selectAnIncidentToReviewIt")}
            </p>
          ) : (
            <>
              <section
                className={styles.facts}
                aria-labelledby="incident-facts-title"
              >
                <h2 id="incident-facts-title" className={styles.sectionTitle}>
                  {t("securityIncidents.incidentFacts")}
                </h2>
                <h3 className={styles.itemTitle}>{selected.title}</h3>
                <div className={styles.chips}>
                  <span
                    className={styles.chip}
                    data-severity={selected.severity}
                  >
                    {severityLabel(selected.severity)}
                  </span>
                  <span className={styles.chip} data-status={selected.status}>
                    {statusLabel(selected.status)}
                  </span>
                </div>
                <dl className={styles.factGrid}>
                  <div>
                    <dt>{t("securityIncidents.reasonCode")}</dt>
                    <dd>{selected.reasonCode}</dd>
                  </div>
                  <div>
                    <dt>{t("securityIncidents.detectedOn")}</dt>
                    <dd>{date(selected.detectedAtUtc)}</dd>
                  </div>
                  {selected.containedAtUtc ? (
                    <div>
                      <dt>{t("securityIncidents.containedOn")}</dt>
                      <dd>{date(selected.containedAtUtc)}</dd>
                    </div>
                  ) : null}
                </dl>
                <p className={styles.rawText}>{selected.summary}</p>
                {selected.closureSummary ? (
                  <div>
                    <p className={styles.label}>
                      {t("securityIncidents.savedClosure")}
                    </p>
                    <p className={styles.rawText}>{selected.closureSummary}</p>
                  </div>
                ) : null}
              </section>
              <form
                className={styles.reviewForm}
                aria-labelledby="incident-review-title"
                onSubmit={(event) => {
                  event.preventDefault();
                  review.mutate();
                }}
              >
                <section className={styles.reviewSection}>
                  <h2
                    id="incident-review-title"
                    className={styles.sectionTitle}
                  >
                    {t("securityIncidents.reviewDraft")}
                  </h2>
                  <p className={styles.hint}>
                    {t(
                      isClosed
                        ? "securityIncidents.closedLocked"
                        : "securityIncidents.reviewDraftHint",
                    )}
                  </p>
                  <div className={styles.fields}>
                    <label className={styles.field}>
                      {t("securityIncidents.status")}
                      <select
                        className={styles.control}
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
                    <label className={styles.field}>
                      {t("securityIncidents.reviewReasonCode")}
                      <input
                        className={styles.control}
                        value={reviewReasonCode}
                        disabled={isClosed}
                        maxLength={80}
                        required
                        onChange={(event) =>
                          setReviewReasonCode(event.target.value)
                        }
                      />
                    </label>
                  </div>
                </section>
                <section
                  className={styles.reviewSection}
                  aria-labelledby="incident-legal-title"
                >
                  <h3 id="incident-legal-title" className={styles.sectionTitle}>
                    {t("securityIncidents.legalAssessment")}
                  </h3>
                  <p className={styles.hint}>
                    {t(
                      legalDecisionRecorded
                        ? "securityIncidents.legalLocked"
                        : "securityIncidents.legalDraftHint",
                    )}
                  </p>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={potentialDataImpact}
                      disabled={isClosed || legalDecisionRecorded}
                      onChange={(event) =>
                        setPotentialDataImpact(event.target.checked)
                      }
                    />
                    {t("securityIncidents.thereMayBePersonaldataImpact")}
                  </label>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={legalNotificationRequired}
                      disabled={
                        isClosed ||
                        legalDecisionRecorded ||
                        !potentialDataImpact
                      }
                      onChange={(event) =>
                        setLegalNotificationRequired(event.target.checked)
                      }
                    />
                    {t(
                      "securityIncidents.theAuthorisedLegalReviewerDeterminedThatTheArticle20NotificationT",
                    )}
                  </label>
                  <label className={styles.field}>
                    {t("securityIncidents.article20TriggerassessmentReason")}
                    <textarea
                      className={styles.control}
                      value={legalDecisionSummary}
                      disabled={isClosed || legalDecisionRecorded}
                      maxLength={2000}
                      onChange={(event) =>
                        setLegalDecisionSummary(event.target.value)
                      }
                    />
                  </label>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
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
                </section>
                {legalDecisionRecorded && selected.breachAssessment ? (
                  <section
                    className={styles.recorded}
                    aria-labelledby="incident-recorded-legal-title"
                  >
                    <h3
                      id="incident-recorded-legal-title"
                      className={styles.sectionTitle}
                    >
                      {t("securityIncidents.recordedLegalDecision")}
                    </h3>
                    <p>
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
                    <p>
                      {t(
                        selected.breachAssessment.legalNotificationRequired
                          ? "securityIncidents.recordedTriggerApplies"
                          : "securityIncidents.recordedTriggerDoesNotApply",
                      )}
                    </p>
                    {selected.breachAssessment.legalDecisionSummary ? (
                      <p className={styles.rawText}>
                        {selected.breachAssessment.legalDecisionSummary}
                      </p>
                    ) : null}
                  </section>
                ) : null}
                {selected.breachAssessment?.notificationDeadlines.length ? (
                  <section
                    className={styles.reviewSection}
                    aria-labelledby="incident-deadlines-title"
                  >
                    <h3
                      id="incident-deadlines-title"
                      className={styles.sectionTitle}
                    >
                      {t("securityIncidents.reminderDeadlines")}
                    </h3>
                    <p className={styles.hint}>
                      {t("securityIncidents.externalRecordHint")}
                    </p>
                    <div className={styles.ledger}>
                      {selected.breachAssessment.notificationDeadlines.map(
                        (deadline) => (
                          <article
                            key={deadline.id}
                            className={styles.deadline}
                            aria-label={audienceLabel(deadline.audience)}
                            data-audience={deadline.audience}
                          >
                            <div className={styles.deadlineFacts}>
                              <h4 className={styles.itemTitle}>
                                {audienceLabel(deadline.audience)}
                              </h4>
                              <p className={styles.date}>
                                {t("securityIncidents.dueOn")}{" "}
                                {date(deadline.dueAtUtc)}
                              </p>
                            </div>
                            {deadline.recordedAtUtc ? (
                              <p className={styles.recordedAction}>
                                {t("securityIncidents.actionRecorded")} ·{" "}
                                {date(deadline.recordedAtUtc)}
                              </p>
                            ) : (
                              <>
                                <p className={styles.hint}>
                                  {t("securityIncidents.notRecorded")}
                                </p>
                                {!isClosed ? (
                                  <div className={styles.deadlineControls}>
                                    <label className={styles.field}>
                                      <span>
                                        {t(
                                          "securityIncidents.externalActionNote",
                                        )}
                                      </span>
                                      <input
                                        className={styles.control}
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
                                    </label>
                                    <button
                                      type="button"
                                      className={styles.secondary}
                                      disabled={
                                        recordDeadline.isPending ||
                                        selectedRefreshPending ||
                                        Boolean(selectedRefreshError) ||
                                        !deadlineNotes[deadline.id]?.trim()
                                      }
                                      onClick={() =>
                                        recordDeadline.mutate({
                                          incidentId: selected.id,
                                          deadlineId: deadline.id,
                                          note: deadlineNotes[
                                            deadline.id
                                          ].trim(),
                                        })
                                      }
                                    >
                                      {recordDeadline.isPending
                                        ? t("securityIncidents.recording")
                                        : t("securityIncidents.record")}
                                    </button>
                                  </div>
                                ) : null}
                              </>
                            )}
                          </article>
                        ),
                      )}
                    </div>
                    {recordDeadline.isError && (
                      <MutationOutcome kind="error">
                        {recordDeadline.error.message}
                      </MutationOutcome>
                    )}
                    {deadlineNotice &&
                    !recordDeadline.isPending &&
                    !recordDeadline.isError ? (
                      <MutationOutcome kind="success">
                        {deadlineNotice}
                      </MutationOutcome>
                    ) : null}
                    {selectedRefreshPending ? (
                      <QueryState
                        kind="loading"
                        title={t("securityIncidents.refreshingSelected")}
                      />
                    ) : null}
                    {selectedRefreshError ? (
                      <QueryState
                        kind="error"
                        title={selectedRefreshError}
                        description={t(
                          "securityIncidents.selectedRefreshFailed",
                        )}
                        action={
                          <button
                            type="button"
                            className={styles.secondary}
                            disabled={selectedRefreshPending}
                            onClick={() => refreshSelectedIncident()}
                          >
                            {t("securityIncidents.retrySelectedRefresh")}
                          </button>
                        }
                      />
                    ) : null}
                  </section>
                ) : null}
                {reviewStatus === "Closed" && (
                  <section className={styles.reviewSection}>
                    <h3 className={styles.sectionTitle}>
                      {t("securityIncidents.closureReview")}
                    </h3>
                    <p className={styles.hint}>
                      {t("securityIncidents.closureHint")}
                    </p>
                    <label className={styles.field}>
                      {t("securityIncidents.closureSummary")}
                      <textarea
                        className={styles.control}
                        value={closureSummary}
                        disabled={isClosed}
                        maxLength={2000}
                        onChange={(event) =>
                          setClosureSummary(event.target.value)
                        }
                      />
                    </label>
                  </section>
                )}
                {!isClosed && (
                  <button
                    type="submit"
                    className={styles.primary}
                    disabled={review.isPending}
                    aria-busy={review.isPending}
                  >
                    <Save size={16} strokeWidth={2} aria-hidden="true" />
                    {review.isPending
                      ? t("securityIncidents.saving")
                      : t("securityIncidents.saveReview")}
                  </button>
                )}
                {review.isError && (
                  <MutationOutcome kind="error">
                    {review.error.message}
                  </MutationOutcome>
                )}
                {reviewNotice && !review.isPending && !review.isError ? (
                  <MutationOutcome kind="success">
                    {reviewNotice}
                  </MutationOutcome>
                ) : null}
              </form>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
