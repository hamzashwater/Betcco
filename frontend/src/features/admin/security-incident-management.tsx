"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
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
  const ar = locale === "ar";
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
  const date = (value: string) =>
    new Intl.DateTimeFormat(ar ? "ar-JO" : "en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  const severityLabel = (value: Severity) =>
    ({
      Low: ar ? "منخفض" : "Low",
      Medium: ar ? "متوسط" : "Medium",
      High: ar ? "مرتفع" : "High",
      Critical: ar ? "حرج" : "Critical",
    })[value];
  const statusLabel = (value: Status) =>
    ({
      Open: ar ? "مفتوح" : "Open",
      Assessing: ar ? "قيد التقييم" : "Assessing",
      Contained: ar ? "تم الاحتواء" : "Contained",
      Closed: ar ? "مغلق" : "Closed",
    })[value];
  const audienceLabel = (value: Audience) =>
    value === "AffectedIndividuals"
      ? ar
        ? "الأشخاص المتأثرون"
        : "Affected individuals"
      : ar
        ? "الجهة الرقابية"
        : "Regulatory authority";
  const isClosed = selected?.status === "Closed";
  const legalDecisionRecorded = Boolean(
    selected?.breachAssessment?.legalConfirmedAtUtc,
  );

  return (
    <section className="shell py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
            BETCCO · Security operations
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            {ar ? "سجل الحوادث الأمنية" : "Security incident register"}
          </h1>
          <p className="mt-3 leading-7 text-muted">
            {ar
              ? "سجل داخلي محدود الصلاحية. المهل تذكير تشغيلي فقط؛ لا يرسل النظام إشعارات قانونية ولا يتخذ قرارًا قانونيًا تلقائيًا."
              : "A restricted internal register. Article 20 deadlines are tracked only after an authorised legal trigger decision; the system never sends legal notices or makes that determination automatically."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((open) => !open)}
          className="focus-ring rounded-xl bg-primary px-4 py-3 font-black text-slate-950"
        >
          {showCreate
            ? ar
              ? "إخفاء النموذج"
              : "Hide form"
            : ar
              ? "تسجيل حادث"
              : "Log incident"}
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
            {ar ? "عنوان الحادث" : "Incident title"}
            <input
              className="focus-ring rounded-xl border border-border bg-background px-3 py-2 text-foreground"
              value={title}
              maxLength={240}
              required
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm font-black">
            {ar ? "رمز السبب" : "Reason code"}
            <input
              className="focus-ring rounded-xl border border-border bg-background px-3 py-2 text-foreground"
              value={reasonCode}
              maxLength={80}
              required
              onChange={(event) => setReasonCode(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm font-black">
            {ar ? "الخطورة" : "Severity"}
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
            {ar
              ? "قد تكون للواقعة آثار على بيانات شخصية"
              : "The incident may affect personal data"}
          </label>
          <label className="grid gap-2 text-sm font-black sm:col-span-2">
            {ar ? "ملخص تشغيلي مختصر" : "Concise operational summary"}
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
                ? ar
                  ? "جارٍ التسجيل…"
                  : "Recording…"
                : ar
                  ? "تسجيل الحادث"
                  : "Record incident"}
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
              {ar ? "الحوادث" : "Incidents"}
              {query.data ? ` (${query.data.totalCount})` : ""}
            </h2>
            <select
              className="focus-ring rounded-xl border border-border bg-background px-3 py-2 text-foreground"
              value={status}
              onChange={(event) => setStatus(event.target.value as Status | "")}
            >
              <option value="">{ar ? "كل الحالات" : "All statuses"}</option>
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
              {ar
                ? "لا توجد حوادث بهذه الحالة."
                : "There are no incidents in this status."}
            </p>
          )}
        </div>

        <aside className="card h-fit p-5 sm:p-6" aria-live="polite">
          {!selected ? (
            <p className="text-muted">
              {ar
                ? "اختر حادثًا من القائمة لمراجعته."
                : "Select an incident to review it."}
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
                {ar ? "الحالة" : "Status"}
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
                {ar ? "رمز سبب المراجعة" : "Review reason code"}
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
                {ar
                  ? "توجد احتمالية تأثير على بيانات شخصية"
                  : "There may be personal-data impact"}
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
                {ar
                  ? "قرر المراجع القانوني المخول انطباق محفز الإشعار بموجب المادة 20"
                  : "The authorised legal reviewer determined that the Article 20 notification trigger applies"}
              </label>
              <label className="grid gap-2 text-sm font-black">
                {ar
                  ? "سبب تقييم محفز المادة 20"
                  : "Article 20 trigger-assessment reason"}
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
                {ar
                  ? "أوثّق قرار المراجع القانوني المخول بشأن محفز المادة 20 وفق الإجراء المعتمد"
                  : "I record the authorised legal review decision on the Article 20 notification trigger under the approved process"}
              </label>
              {legalDecisionRecorded && selected.breachAssessment ? (
                <p className="rounded-xl border border-border bg-surface-solid/50 p-3 text-sm leading-6 text-muted">
                  {ar
                    ? `تم تسجيل قرار المادة 20 في ${date(selected.breachAssessment.legalConfirmedAtUtc!)} بواسطة ${selected.breachAssessment.legalConfirmedByUserId ?? "مستخدم مخول"}.`
                    : `The Article 20 decision was recorded ${date(selected.breachAssessment.legalConfirmedAtUtc!)} by ${selected.breachAssessment.legalConfirmedByUserId ?? "an authorised user"}.`}
                </p>
              ) : null}
              {reviewStatus === "Closed" && (
                <label className="grid gap-2 text-sm font-black">
                  {ar ? "ملخص الإغلاق" : "Closure summary"}
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
                    {ar ? "مهل التذكير" : "Reminder deadlines"}
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
                            {ar ? "تم تسجيل الإجراء" : "Action recorded"} ·{" "}
                            {date(deadline.recordedAtUtc)}
                          </p>
                        ) : (
                          <div className="mt-3 flex gap-2">
                            <input
                              className="focus-ring min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground"
                              value={deadlineNotes[deadline.id] ?? ""}
                              maxLength={1000}
                              placeholder={
                                ar
                                  ? "ملاحظة الإجراء الخارجي"
                                  : "External action note"
                              }
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
                              {ar ? "تسجيل" : "Record"}
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
                    ? ar
                      ? "جارٍ الحفظ…"
                      : "Saving…"
                    : ar
                      ? "حفظ المراجعة"
                      : "Save review"}
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
