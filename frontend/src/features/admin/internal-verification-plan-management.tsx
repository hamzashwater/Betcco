"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useMemo, useState } from "react";

type Outcome = "Pass" | "Merit" | "Distinction";
type Plan = {
  id: string;
  assessorUserId?: string | null;
  gradeId?: string | null;
  specializationId?: string | null;
  taskTypeId?: string | null;
  targetOutcome?: Outcome | null;
  selectionRationale: string;
  activeFromUtc: string;
  activeUntilUtc?: string | null;
  isActive: boolean;
  samplesCount: number;
};
type Candidate = {
  evaluationRequestId: string;
  submissionAttemptNumber: number;
  assessorUserId: string;
  gradeId: string;
  specializationId: string;
  taskTypeId: string;
  calculatedOutcome?: Outcome | null;
  submittedForVerificationAtUtc: string;
};
type Staff = {
  id: string;
  displayName: string;
  email?: string | null;
  roles: string[];
};
type Taxonomy = {
  grades: { id: string; name: string }[];
  specializations: { id: string; name: string }[];
  taskTypes: { id: string; name: string }[];
};

const outcomes: Outcome[] = ["Pass", "Merit", "Distinction"];

export function InternalVerificationPlanManagement() {
  const locale = useLocale();
  const ar = locale === "ar";
  const labels = ar
    ? {
        eyebrow: "BETCCO · النزاهة الأكاديمية",
        title: "خطط عينات التحقق الداخلي",
        description:
          "اختر عيّنات التدقيق بحسب نطاق ومبرر موثقين. لا تستخدم BETCCO نسبة ثابتة أو قرارًا تلقائيًا بدل سياسة المؤهل المعتمدة.",
        create: "إنشاء خطة عيّنة",
        hide: "إخفاء النموذج",
        planScope: "نطاق الخطة",
        assessor: "المقيّم المستهدف",
        grade: "الصف",
        specialization: "التخصص",
        taskType: "نوع التقييم",
        outcome: "النتيجة المستهدفة",
        all: "الكل ضمن النطاق",
        rationale: "مبرر اختيار العيّنة",
        activeUntil: "تنتهي الخطة في (اختياري)",
        save: "حفظ خطة العينة",
        saving: "جارٍ الحفظ…",
        plans: "الخطط الحالية",
        selectPlan: "اختر خطة لعرض المرشحين.",
        noPlans: "لا توجد خطط عيّنة بعد.",
        candidates: "تقييمات مرشحة للتحقق",
        noCandidates:
          "لا توجد تقييمات تحت المراجعة تطابق نطاق الخطة أو أنها اختيرت سابقًا.",
        assignVerifier: "عيّن مراجعًا مستقلاً",
        select: "اختيار العينة",
        selecting: "جارٍ الاختيار…",
        sampleReason: "سبب اختيار هذا التقييم",
        sampleHint:
          "لا يمكن للمقيّم المعيّن مراجعة قراره، والخادم يمنع تكرار العينة للمحاولة نفسها.",
        attempt: "المحاولة",
        submitted: "أُحيل للمراجعة",
        samples: "عيّنات",
        scopeRequired: "اختر نطاقًا واحدًا على الأقل قبل حفظ الخطة.",
        outcomeLabels: { Pass: "نجاح", Merit: "تفوق", Distinction: "امتياز" },
      }
    : {
        eyebrow: "BETCCO · academic integrity",
        title: "Internal verification sampling plans",
        description:
          "Select review samples through a documented scope and rationale. BETCCO does not apply a fixed percentage or replace the approved qualification policy with an automatic decision.",
        create: "Create sampling plan",
        hide: "Hide form",
        planScope: "Plan scope",
        assessor: "Target assessor",
        grade: "Grade",
        specialization: "Specialization",
        taskType: "Assessment type",
        outcome: "Target outcome",
        all: "All in scope",
        rationale: "Sampling rationale",
        activeUntil: "Plan ends at (optional)",
        save: "Save sampling plan",
        saving: "Saving…",
        plans: "Current plans",
        selectPlan: "Select a plan to view candidates.",
        noPlans: "No sampling plans yet.",
        candidates: "Assessments eligible for sampling",
        noCandidates:
          "No under-review assessments match this scope, or they have already been sampled.",
        assignVerifier: "Assign an independent verifier",
        select: "Select sample",
        selecting: "Selecting…",
        sampleReason: "Reason for selecting this assessment",
        sampleHint:
          "The assigned assessor cannot review their own decision, and the server prevents duplicate sampling of an attempt.",
        attempt: "Attempt",
        submitted: "Submitted for review",
        samples: "Samples",
        scopeRequired: "Choose at least one scope before saving the plan.",
        outcomeLabels: {
          Pass: "Pass",
          Merit: "Merit",
          Distinction: "Distinction",
        },
      };
  const client = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>();
  const [assignedVerifiers, setAssignedVerifiers] = useState<
    Record<string, string>
  >({});
  const [sampleReasons, setSampleReasons] = useState<Record<string, string>>(
    {},
  );
  const [form, setForm] = useState({
    assessorUserId: "",
    gradeId: "",
    specializationId: "",
    taskTypeId: "",
    targetOutcome: "",
    selectionRationale: "",
    activeUntilUtc: "",
  });
  const plans = useQuery({
    queryKey: ["internal-verification-plans"],
    queryFn: () => api<Plan[]>("/internal-verification/plans"),
    retry: false,
  });
  const taxonomy = useQuery({
    queryKey: ["taxonomy", locale],
    queryFn: () => api<Taxonomy>(`/taxonomy?locale=${locale}`),
    retry: false,
  });
  const staff = useQuery({
    queryKey: ["internal-verification-eligible-staff"],
    queryFn: () => api<Staff[]>("/internal-verification/plans/eligible-staff"),
    retry: false,
  });
  const selectedPlan = plans.data?.find((plan) => plan.id === selectedPlanId);
  const candidates = useQuery({
    queryKey: ["internal-verification-candidates", selectedPlanId],
    queryFn: () =>
      api<Candidate[]>(
        `/internal-verification/plans/${selectedPlanId}/candidates?take=100`,
      ),
    enabled: Boolean(selectedPlanId),
    retry: false,
  });
  const verifierStaff = useMemo(
    () =>
      (staff.data ?? []).filter((member) =>
        member.roles.some((role) =>
          ["InternalVerifier", "LeadInternalVerifier", "Admin"].includes(role),
        ),
      ),
    [staff.data],
  );
  const assessorStaff = useMemo(
    () =>
      (staff.data ?? []).filter((member) =>
        member.roles.some((role) => ["Teacher", "Assessor"].includes(role)),
      ),
    [staff.data],
  );
  const hasScope = Boolean(
    form.assessorUserId ||
    form.gradeId ||
    form.specializationId ||
    form.taskTypeId,
  );
  const create = useMutation({
    mutationFn: () =>
      api<Plan>("/internal-verification/plans", {
        method: "POST",
        body: JSON.stringify({
          assessorUserId: form.assessorUserId || null,
          gradeId: form.gradeId || null,
          specializationId: form.specializationId || null,
          taskTypeId: form.taskTypeId || null,
          targetOutcome: form.targetOutcome || null,
          selectionRationale: form.selectionRationale.trim(),
          activeUntilUtc: form.activeUntilUtc
            ? new Date(form.activeUntilUtc).toISOString()
            : null,
        }),
      }),
    onSuccess: (plan) => {
      setShowForm(false);
      setSelectedPlanId(plan.id);
      setForm({
        assessorUserId: "",
        gradeId: "",
        specializationId: "",
        taskTypeId: "",
        targetOutcome: "",
        selectionRationale: "",
        activeUntilUtc: "",
      });
      void client.invalidateQueries({
        queryKey: ["internal-verification-plans"],
      });
    },
  });
  const selectSample = useMutation({
    mutationFn: ({
      candidate,
      verifierId,
      rationale,
    }: {
      candidate: Candidate;
      verifierId: string;
      rationale: string;
    }) =>
      api<void>(`/internal-verification/plans/${selectedPlanId}/samples`, {
        method: "POST",
        body: JSON.stringify({
          evaluationRequestId: candidate.evaluationRequestId,
          assignedVerifierUserId: verifierId,
          selectionRationale: rationale.trim(),
        }),
      }),
    onSuccess: () => {
      setAssignedVerifiers({});
      setSampleReasons({});
      void client.invalidateQueries({
        queryKey: ["internal-verification-plans"],
      });
      void client.invalidateQueries({
        queryKey: ["internal-verification-candidates", selectedPlanId],
      });
    },
  });
  const date = (value: string) =>
    new Intl.DateTimeFormat(ar ? "ar-JO" : "en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  return (
    <section className="shell py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
            {labels.eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            {labels.title}
          </h1>
          <p className="mt-3 leading-7 text-muted">{labels.description}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((open) => !open)}
          className="focus-ring rounded-xl bg-primary px-4 py-3 font-black text-slate-950"
        >
          {showForm ? labels.hide : labels.create}
        </button>
      </div>

      {showForm ? (
        <form
          className="card mt-6 grid gap-4 p-5 sm:grid-cols-2 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (hasScope) create.mutate();
          }}
        >
          <h2 className="text-lg font-black sm:col-span-2">
            {labels.planScope}
          </h2>
          <ScopeSelect
            label={labels.assessor}
            value={form.assessorUserId}
            onChange={(value) =>
              setForm((current) => ({ ...current, assessorUserId: value }))
            }
            options={assessorStaff.map((member) => ({
              id: member.id,
              name: `${member.displayName}${member.email ? ` — ${member.email}` : ""}`,
            }))}
            allLabel={labels.all}
          />
          <ScopeSelect
            label={labels.grade}
            value={form.gradeId}
            onChange={(value) =>
              setForm((current) => ({ ...current, gradeId: value }))
            }
            options={taxonomy.data?.grades ?? []}
            allLabel={labels.all}
          />
          <ScopeSelect
            label={labels.specialization}
            value={form.specializationId}
            onChange={(value) =>
              setForm((current) => ({ ...current, specializationId: value }))
            }
            options={taxonomy.data?.specializations ?? []}
            allLabel={labels.all}
          />
          <ScopeSelect
            label={labels.taskType}
            value={form.taskTypeId}
            onChange={(value) =>
              setForm((current) => ({ ...current, taskTypeId: value }))
            }
            options={taxonomy.data?.taskTypes ?? []}
            allLabel={labels.all}
          />
          <label className="grid gap-2 text-sm font-black">
            {labels.outcome}
            <select
              className="focus-ring rounded-xl border border-border bg-background px-3 py-2 text-foreground"
              value={form.targetOutcome}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  targetOutcome: event.target.value,
                }))
              }
            >
              <option value="">{labels.all}</option>
              {outcomes.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {labels.outcomeLabels[outcome]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-black sm:col-span-2">
            {labels.rationale}
            <textarea
              className="focus-ring min-h-28 rounded-xl border border-border bg-background p-3 text-foreground"
              value={form.selectionRationale}
              minLength={10}
              maxLength={2000}
              required
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  selectionRationale: event.target.value,
                }))
              }
            />
          </label>
          <label className="grid gap-2 text-sm font-black">
            {labels.activeUntil}
            <input
              type="datetime-local"
              className="focus-ring rounded-xl border border-border bg-background px-3 py-2 text-foreground"
              value={form.activeUntilUtc}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  activeUntilUtc: event.target.value,
                }))
              }
            />
          </label>
          <div className="self-end">
            <button
              type="submit"
              disabled={create.isPending || !hasScope}
              className="focus-ring rounded-xl bg-primary px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {create.isPending ? labels.saving : labels.save}
            </button>
          </div>
          {!hasScope ? (
            <p role="alert" className="text-sm text-danger sm:col-span-2">
              {labels.scopeRequired}
            </p>
          ) : null}
          {create.isError ? (
            <p role="alert" className="text-sm text-danger sm:col-span-2">
              {create.error.message}
            </p>
          ) : null}
        </form>
      ) : null}

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,.78fr)_minmax(0,1.22fr)]">
        <section className="card p-5 sm:p-6">
          <h2 className="text-lg font-black">{labels.plans}</h2>
          {plans.isPending ? (
            <div
              className="mt-5 h-44 animate-pulse rounded-2xl bg-surface-solid"
              aria-busy
            />
          ) : null}
          {plans.isError ? (
            <p className="mt-5 text-sm text-danger" role="alert">
              {plans.error.message}
            </p>
          ) : null}
          {plans.data?.length ? (
            <ul className="mt-5 grid gap-3">
              {plans.data.map((plan) => (
                <li key={plan.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`focus-ring w-full rounded-2xl border p-4 text-start ${selectedPlanId === plan.id ? "border-primary bg-primary/10" : "border-border bg-surface-solid/45 hover:bg-surface"}`}
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-black">
                        {plan.targetOutcome
                          ? labels.outcomeLabels[plan.targetOutcome]
                          : labels.all}
                      </span>
                      <span className="text-xs font-bold text-primary">
                        {labels.samples}: {plan.samplesCount}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm text-muted">
                      {plan.selectionRationale}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {date(plan.activeFromUtc)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : !plans.isPending && !plans.isError ? (
            <p className="mt-5 text-sm text-muted">{labels.noPlans}</p>
          ) : null}
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="text-lg font-black">{labels.candidates}</h2>
          {!selectedPlan ? (
            <p className="mt-5 text-sm text-muted">{labels.selectPlan}</p>
          ) : null}
          {selectedPlan && candidates.isPending ? (
            <div
              className="mt-5 h-44 animate-pulse rounded-2xl bg-surface-solid"
              aria-busy
            />
          ) : null}
          {selectedPlan && candidates.isError ? (
            <p className="mt-5 text-sm text-danger" role="alert">
              {candidates.error.message}
            </p>
          ) : null}
          {selectedPlan && candidates.data?.length ? (
            <ul className="mt-5 grid gap-4">
              {candidates.data.map((candidate) => {
                const verifierId =
                  assignedVerifiers[candidate.evaluationRequestId] ?? "";
                const reason =
                  sampleReasons[candidate.evaluationRequestId] ??
                  selectedPlan.selectionRationale;
                const canSelect =
                  verifierId &&
                  verifierId !== candidate.assessorUserId &&
                  reason.trim().length >= 10;
                return (
                  <li
                    key={candidate.evaluationRequestId}
                    className="rounded-2xl border border-border bg-surface-solid/45 p-4"
                  >
                    <div className="flex flex-wrap justify-between gap-3 text-sm">
                      <span className="font-black">
                        {labels.attempt} {candidate.submissionAttemptNumber}
                      </span>
                      <span className="text-primary">
                        {candidate.calculatedOutcome
                          ? labels.outcomeLabels[candidate.calculatedOutcome]
                          : "—"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {labels.submitted}:{" "}
                      {date(candidate.submittedForVerificationAtUtc)}
                    </p>
                    <label className="mt-4 grid gap-2 text-sm font-black">
                      {labels.assignVerifier}
                      <select
                        className="focus-ring rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                        value={verifierId}
                        onChange={(event) =>
                          setAssignedVerifiers((current) => ({
                            ...current,
                            [candidate.evaluationRequestId]: event.target.value,
                          }))
                        }
                      >
                        <option value="">{labels.assignVerifier}</option>
                        {verifierStaff
                          .filter(
                            (member) => member.id !== candidate.assessorUserId,
                          )
                          .map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.displayName}
                              {member.email ? ` — ${member.email}` : ""}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="mt-3 grid gap-2 text-sm font-black">
                      {labels.sampleReason}
                      <textarea
                        className="focus-ring min-h-20 rounded-xl border border-border bg-background p-3 text-foreground"
                        value={reason}
                        minLength={10}
                        maxLength={2000}
                        onChange={(event) =>
                          setSampleReasons((current) => ({
                            ...current,
                            [candidate.evaluationRequestId]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!canSelect || selectSample.isPending}
                      onClick={() =>
                        selectSample.mutate({
                          candidate,
                          verifierId,
                          rationale: reason,
                        })
                      }
                      className="focus-ring mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {selectSample.isPending
                        ? labels.selecting
                        : labels.select}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : selectedPlan && !candidates.isPending && !candidates.isError ? (
            <p className="mt-5 text-sm text-muted">{labels.noCandidates}</p>
          ) : null}
          {selectSample.isError ? (
            <p className="mt-4 text-sm text-danger" role="alert">
              {selectSample.error.message}
            </p>
          ) : null}
          {selectedPlan ? (
            <p className="mt-5 rounded-xl border border-primary/25 bg-primary/10 p-3 text-sm leading-6 text-muted">
              {labels.sampleHint}
            </p>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function ScopeSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; name: string }[];
  allLabel: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-black">
      {label}
      <select
        className="focus-ring rounded-xl border border-border bg-background px-3 py-2 text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
