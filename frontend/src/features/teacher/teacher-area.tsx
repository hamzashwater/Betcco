"use client";

import { formatLocalizedDateTime } from "@/i18n/date-time";
import {
  formatLocalizedCurrency,
  formatLocalizedPercentage,
} from "@/i18n/number-format";
import { api } from "@/lib/api";
import { AccountSecurity } from "@/features/auth/account-security";
import { AccountProfile } from "@/features/auth/account-profile";
import { CourseEditor } from "@/features/teacher/course-editor";
import {
  TeacherCoursesManagement,
  type TeacherCourse,
} from "@/features/teacher/teacher-courses-management";
import {
  TeacherFollowUpPreview,
  TeacherStudentFollowUp,
  type TeacherAnalytics,
} from "@/features/teacher/teacher-student-follow-up";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BookOpenCheck,
  ClipboardCheck,
  FilePenLine,
  Files,
  GraduationCap,
  Plus,
  WalletCards,
} from "lucide-react";
import {
  ActionCard,
  DashboardHeader,
  MetricCard,
} from "@/components/dashboard/dashboard-ui";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";

export function TeacherArea({ segment }: { segment: string[] }) {
  const current = segment.join("/") || "dashboard";
  if (current === "courses/new") return <CourseEditor />;
  if (current.startsWith("courses/") && segment[1])
    return <CourseEditor courseId={segment[1]} />;
  if (current === "courses") return <TeacherCoursesManagement />;
  if (current === "students") return <TeacherStudentFollowUp />;
  if (current === "wallet") return <TeacherWallet />;
  if (current === "profile") return <AccountProfile role="teacher" />;
  if (current === "security") return <AccountSecurity role="teacher" />;
  if (current === "evaluations") return <TeacherEvaluations />;
  if (current.startsWith("evaluations/") && segment[1])
    return <TeacherEvaluationReview evaluationId={segment[1]} />;
  return <TeacherDashboard />;
}

function TeacherDashboard() {
  const locale = useLocale();
  const t = useTranslations("teacherWorkspace");
  const courses = useQuery({
    queryKey: ["teacher-courses"],
    queryFn: () => api<TeacherCourse[]>("/teacher/courses"),
  });
  const analytics = useQuery({
    queryKey: ["teacher-analytics"],
    queryFn: () => api<TeacherAnalytics>("/teacher/analytics"),
  });
  const values = courses.data ?? [];
  const drafts = values.filter((course) => course.status === "Draft").length;
  const waiting = values.filter(
    (course) => course.status === "SubmittedForReview",
  ).length;
  const published = values.filter(
    (course) => course.status === "Published",
  ).length;
  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow={t("dashboard.eyebrow")}
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={
          <Link
            href={`/${locale}/teacher/courses/new`}
            className="focus-ring inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-slate-950"
          >
            <Plus size={18} aria-hidden="true" />
            {t("dashboard.createCourse")}
          </Link>
        }
      />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label={t("dashboard.drafts")}
          value={courses.isPending ? "—" : drafts}
          detail={t("dashboard.draftsDetail")}
          icon={FilePenLine}
        />
        <MetricCard
          label={t("dashboard.awaitingReview")}
          value={courses.isPending ? "—" : waiting}
          detail={t("dashboard.awaitingReviewDetail")}
          icon={BadgeCheck}
          tone="warm"
        />
        <MetricCard
          label={t("dashboard.publishedCourses")}
          value={courses.isPending ? "—" : published}
          detail={t("dashboard.publishedCoursesDetail")}
          icon={GraduationCap}
          tone="secondary"
        />
        <MetricCard
          label={t("dashboard.enrolledStudents")}
          value={analytics.isPending ? "—" : (analytics.data?.students ?? 0)}
          detail={t("dashboard.enrolledStudentsDetail")}
          icon={GraduationCap}
          tone="secondary"
        />
        <MetricCard
          label={t("dashboard.pendingReviews")}
          value={
            analytics.isPending ? "—" : (analytics.data?.pendingReviews ?? 0)
          }
          detail={t("dashboard.pendingReviewsDetail")}
          icon={ClipboardCheck}
          tone="warm"
        />
        <MetricCard
          label={t("dashboard.averageProgress")}
          value={
            analytics.isPending
              ? "—"
              : formatLocalizedPercentage(
                  analytics.data?.averageLessonProgress ?? 0,
                  locale,
                )
          }
          detail={t("dashboard.publishedLessons")}
          icon={BookOpenCheck}
        />
        <MetricCard
          label={t("dashboard.studentsNeedingAttention")}
          value={
            analytics.isPending
              ? "—"
              : (analytics.data?.studentsAtRiskCount ?? 0)
          }
          detail={t("dashboard.studentsNeedingAttentionDetail")}
          icon={AlertTriangle}
          tone="warm"
        />
      </div>
      <TeacherFollowUpPreview
        pending={analytics.isPending}
        students={analytics.data?.studentsAtRisk ?? []}
        totalCount={analytics.data?.studentsAtRiskCount ?? 0}
      />
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <AreaLink
          href="courses"
          title={t("dashboard.myCourses")}
          text={t("dashboard.myCoursesDescription")}
          icon={BookOpenCheck}
        />
        <AreaLink
          href="courses/new"
          title={t("dashboard.newCourse")}
          text={t("dashboard.newCourseDescription")}
          icon={FilePenLine}
        />
        <AreaLink
          href="evaluations"
          title={t("shared.evaluationWork")}
          text={t("dashboard.evaluationWorkDescription")}
          icon={ClipboardCheck}
        />
        <AreaLink
          href="wallet"
          title={t("shared.myWallet")}
          text={t("dashboard.walletDescription")}
          icon={WalletCards}
        />
      </div>
      <div className="mt-8">
        <TeacherCoursesManagement variant="compact" />
      </div>
    </section>
  );
}

type WalletTransaction = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  description: string;
  createdAtUtc: string;
  paymentId?: string;
  payoutRequestId?: string;
};
type TeacherPayout = {
  id: string;
  amount: number;
  currency: string;
  method: string;
  destinationMasked: string;
  status: string;
  reviewNote?: string;
  createdAtUtc: string;
  paidAtUtc?: string;
};
type TeacherWalletView = {
  availableBalance: number;
  totalEarned: number;
  totalWithdrawn: number;
  currency: string;
  transactions: WalletTransaction[];
  payouts: TeacherPayout[];
};

function TeacherWallet() {
  const locale = useLocale();
  const t = useTranslations("teacherWorkspace");
  const client = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("BankTransfer");
  const [destination, setDestination] = useState("");
  const withdrawalIdempotencyKey = useRef<string | null>(null);
  const wallet = useQuery({
    queryKey: ["teacher-wallet"],
    queryFn: () => api<TeacherWalletView>("/teacher/wallet"),
  });
  const requestWithdrawal = useMutation({
    mutationFn: () =>
      api<TeacherPayout>("/teacher/wallet/withdrawals", {
        method: "POST",
        body: JSON.stringify({
          amount: Number(amount),
          method,
          destination,
          idempotencyKey:
            withdrawalIdempotencyKey.current ??
            (withdrawalIdempotencyKey.current = crypto.randomUUID()),
        }),
      }),
    onSuccess: () => {
      setAmount("");
      setDestination("");
      withdrawalIdempotencyKey.current = null;
      client.invalidateQueries({ queryKey: ["teacher-wallet"] });
    },
  });
  const values = wallet.data;
  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow={t("wallet.eyebrow")}
        title={t("shared.myWallet")}
        description={t("wallet.description")}
      />
      {wallet.isPending ? (
        <div className="card mt-6 p-6" aria-busy>
          {t("shared.loading")}
        </div>
      ) : wallet.isError || !values ? (
        <p className="card mt-6 p-6" role="alert">
          {t("wallet.loadError")}
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <MetricCard
              label={t("wallet.availableBalance")}
              value={formatLocalizedCurrency(
                values.availableBalance,
                values.currency,
                locale,
              )}
              detail={t("wallet.availableBalanceDetail")}
              icon={WalletCards}
              tone="secondary"
            />
            <MetricCard
              label={t("wallet.totalEarnings")}
              value={formatLocalizedCurrency(
                values.totalEarned,
                values.currency,
                locale,
              )}
              detail={t("wallet.teacherShare")}
              icon={GraduationCap}
            />
            <MetricCard
              label={t("wallet.withdrawals")}
              value={formatLocalizedCurrency(
                Math.abs(values.totalWithdrawn),
                values.currency,
                locale,
              )}
              detail={t("wallet.withdrawalsDetail")}
              icon={ArrowLeft}
              tone="warm"
            />
          </div>
          <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <form
              className="card grid gap-4 p-5"
              onSubmit={(event) => {
                event.preventDefault();
                requestWithdrawal.mutate();
              }}
            >
              <div>
                <h2 className="text-lg font-black">
                  {t("wallet.requestWithdrawal")}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {t("wallet.destinationPrivacy")}
                </p>
              </div>
              <label className="grid gap-1 text-sm font-bold">
                {t("wallet.amount")}
                <input
                  type="number"
                  min="0.001"
                  max={values.availableBalance}
                  step="0.001"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="rounded-xl border border-border bg-white/5 p-3"
                  required
                />
              </label>
              <label className="grid gap-1 text-sm font-bold">
                {t("wallet.method")}
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  className="rounded-xl border border-border bg-white/5 p-3"
                >
                  <option value="BankTransfer">
                    {t("wallet.bankTransfer")}
                  </option>
                  <option value="EWallet">{t("wallet.eWallet")}</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-bold">
                {method === "BankTransfer"
                  ? t("wallet.bankDestination")
                  : t("wallet.eWalletDestination")}
                <input
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  className="rounded-xl border border-border bg-white/5 p-3"
                  autoComplete="off"
                  minLength={4}
                  maxLength={300}
                  required
                />
              </label>
              <button
                type="submit"
                disabled={
                  requestWithdrawal.isPending || values.availableBalance <= 0
                }
                className="focus-ring rounded-xl bg-primary px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {requestWithdrawal.isPending
                  ? t("wallet.submitting")
                  : t("wallet.submit")}
              </button>
              {requestWithdrawal.isError && (
                <p role="alert" className="text-sm text-red-400">
                  {requestWithdrawal.error instanceof Error
                    ? requestWithdrawal.error.message
                    : t("wallet.submitError")}
                </p>
              )}
            </form>
            <WalletTable
              title={t("wallet.recentActivity")}
              empty={t("wallet.noTransactions")}
              rows={values.transactions.map((transaction) => ({
                id: transaction.id,
                title: transaction.description,
                meta: formatLocalizedDateTime(transaction.createdAtUtc, locale),
                amount: formatLocalizedCurrency(
                  transaction.amount,
                  transaction.currency,
                  locale,
                  { signDisplay: "always" },
                ),
                positive: transaction.amount >= 0,
              }))}
            />
          </div>
          <div className="mt-6">
            <WalletTable
              title={t("wallet.withdrawalRequests")}
              empty={t("wallet.noWithdrawals")}
              rows={values.payouts.map((payout) => ({
                id: payout.id,
                title: `${payout.method === "BankTransfer" ? t("wallet.bankTransfer") : t("wallet.eWallet")} — ${payout.destinationMasked}`,
                meta: `${payout.status}${payout.reviewNote ? ` — ${payout.reviewNote}` : ""}`,
                amount: formatLocalizedCurrency(
                  payout.amount,
                  payout.currency,
                  locale,
                ),
                positive: false,
              }))}
            />
          </div>
        </>
      )}
    </section>
  );
}

function WalletTable({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: {
    id: string;
    title: string;
    meta: string;
    amount: string;
    positive: boolean;
  }[];
}) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-black">{title}</h2>
      <div className="mt-4 grid gap-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-white/[0.035] p-3"
          >
            <div>
              <p className="font-bold">{row.title}</p>
              <p className="mt-1 text-xs text-muted">{row.meta}</p>
            </div>
            <span
              className={
                row.positive
                  ? "font-black text-emerald-300"
                  : "font-black text-amber-300"
              }
            >
              {row.amount}
            </span>
          </div>
        ))}
        {!rows.length && <p className="text-sm text-muted">{empty}</p>}
      </div>
    </section>
  );
}
function AreaLink({
  href,
  title,
  text,
  icon,
}: {
  href: string;
  title: string;
  text: string;
  icon: typeof BookOpenCheck;
}) {
  const locale = useLocale();
  const t = useTranslations("teacherWorkspace");
  return (
    <Link
      href={`/${locale}/teacher/${href}`}
      className="focus-ring block rounded-[1.25rem]"
    >
      <ActionCard title={title} description={text} icon={icon}>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-black text-primary">
          {t("shared.open")}
          <ArrowLeft size={16} className="rtl:rotate-180" aria-hidden="true" />
        </span>
      </ActionCard>
    </Link>
  );
}
type AssignedEvaluation = {
  id: string;
  status: string;
  studentComment?: string;
  filesCount: number;
  criteria: string[];
  selectedCriteria: string[];
  submissionAttemptNumber: number;
  isRetake: boolean;
  isResit: boolean;
  resitOfEvaluationRequestId: string | null;
  retakeOfEvaluationRequestId: string | null;
};

function TeacherEvaluations() {
  const locale = useLocale();
  const t = useTranslations("teacherWorkspace");
  const evaluations = useQuery({
    queryKey: ["teacher-evaluations"],
    queryFn: () => api<AssignedEvaluation[]>("/evaluations/assigned"),
  });
  if (evaluations.isPending)
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          {t("shared.loading")}
        </div>
      </section>
    );
  if (evaluations.isError)
    return (
      <section className="shell py-10">
        <p className="card p-6" role="alert">
          {t("evaluations.loadError")}
        </p>
      </section>
    );
  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow={t("evaluations.eyebrow")}
        title={t("shared.evaluationWork")}
        description={t("evaluations.description")}
      />
      <div className="mt-5 grid gap-4">
        {evaluations.data?.map((evaluation) => (
          <Link
            key={evaluation.id}
            href={`/${locale}/teacher/evaluations/${evaluation.id}`}
            className="card focus-ring block p-5"
            data-interactive
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-primary">
                  <ClipboardCheck size={18} aria-hidden="true" />
                  <span className="text-sm font-black">
                    {evaluation.isRetake
                      ? t("evaluations.assignedRetake")
                      : evaluation.isResit
                        ? t("evaluations.resitFinalReview")
                        : t("evaluations.assignedEvaluation")}
                  </span>
                </div>
                {evaluation.isResit &&
                  evaluation.resitOfEvaluationRequestId && (
                    <p className="mt-2 text-xs text-muted">
                      {t("shared.originalRequest")}{" "}
                      {evaluation.resitOfEvaluationRequestId.slice(0, 8)}
                    </p>
                  )}
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                  {evaluation.studentComment || t("shared.noStudentNote")}
                </p>
              </div>
              <span className="rounded-full border border-border bg-white/5 px-3 py-1 text-xs font-bold text-muted">
                {evaluation.status}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <Files size={14} aria-hidden="true" />
                {evaluation.filesCount} {t("evaluations.files")}
              </span>
              <span>
                {evaluation.criteria.length} {t("evaluations.criteria")}
              </span>
              <span className="ms-auto inline-flex items-center gap-1 font-bold text-primary">
                {t("evaluations.start")}
                <ArrowLeft
                  size={15}
                  className="rtl:rotate-180"
                  aria-hidden="true"
                />
              </span>
            </div>
          </Link>
        ))}
        {!evaluations.data?.length && (
          <div className="card p-6 text-sm leading-6 text-muted">
            {t("evaluations.empty")}
          </div>
        )}
      </div>
    </section>
  );
}

type EvaluationDetail = {
  id: string;
  status: string;
  isRetake: boolean;
  isResit: boolean;
  resitOfEvaluationRequestId: string | null;
  retakeOfEvaluationRequestId: string | null;
  studentComment?: string;
  criteria: string[];
  selectedCriteria: string[];
  submissionAttemptNumber: number;
  revisionDueAtUtc: string | null;
  effectiveRevisionDueAtUtc: string | null;
  calculatedGrade: string | null;
  sectionResults: { section: string; grade: string }[];
  files: {
    id: string;
    originalFileName: string;
    lengthBytes: number;
    createdAtUtc: string;
    scanStatus: string;
  }[];
  results: {
    criterionCode: string;
    achievement: string;
    evidence?: string;
    comment?: string;
  }[];
  evidence: { criterionCode: string; narrative: string }[];
  feedback: {
    body: string;
    requestsResubmission: boolean;
    createdAtUtc: string;
  }[];
};

type ResultDraft = Record<
  string,
  { achievement: string; evidence: string; comment: string }
>;

function TeacherEvaluationReview({ evaluationId }: { evaluationId: string }) {
  const locale = useLocale();
  const t = useTranslations("teacherWorkspace");
  const [draft, setDraft] = useState<ResultDraft>({});
  const [feedback, setFeedback] = useState("");
  const [requestRevision, setRequestRevision] = useState(false);
  const [revisionDueLocal, setRevisionDueLocal] = useState("");
  const [criteriaPlanDraft, setCriteriaPlanDraft] = useState<string[] | null>(
    null,
  );
  const evaluation = useQuery({
    queryKey: ["teacher-evaluation", evaluationId],
    queryFn: () => api<EvaluationDetail>(`/evaluations/${evaluationId}`),
  });
  const submit = useMutation({
    mutationFn: () => {
      if (
        requestRevision &&
        !evaluation.data?.isResit &&
        (!revisionDueLocal || !Number.isFinite(Date.parse(revisionDueLocal)))
      )
        throw new Error(t("evaluationReview.invalidDeadline"));
      const results =
        activeCriteria.map((criterion) => {
          const value = criterionValue(criterion);
          return {
            criterionCode: criterion,
            achievement: value.achievement,
            evidence: value.evidence || null,
            comment: value.comment || null,
          };
        }) ?? [];
      if (evaluation.data?.isRetake)
        return api(`/evaluations/${evaluationId}/results`, {
          method: "POST",
          body: JSON.stringify(results),
        });
      return api(`/evaluations/${evaluationId}/review`, {
        method: "POST",
        body: JSON.stringify({
          results,
          feedback: feedback.trim(),
          requestRevision:
            !evaluation.data?.isResit &&
            evaluation.data?.submissionAttemptNumber === 1
              ? requestRevision
              : false,
          revisionDueAtUtc:
            !evaluation.data?.isResit &&
            evaluation.data?.submissionAttemptNumber === 1 &&
            requestRevision
              ? new Date(revisionDueLocal).toISOString()
              : null,
        }),
      });
    },
    onSuccess: () => {
      setDraft({});
      setFeedback("");
      setRequestRevision(false);
      setRevisionDueLocal("");
      evaluation.refetch();
    },
  });
  const saveCriteriaPlan = useMutation({
    mutationFn: (criterionCodes: string[]) =>
      api(`/evaluations/${evaluationId}/criteria-plan`, {
        method: "POST",
        body: JSON.stringify({ criterionCodes }),
      }),
    onSuccess: () => {
      setCriteriaPlanDraft(null);
      evaluation.refetch();
    },
  });
  if (evaluation.isPending)
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          {t("shared.loading")}
        </div>
      </section>
    );
  if (evaluation.isError || !evaluation.data)
    return (
      <section className="shell py-10">
        <p className="card p-6" role="alert">
          {t("evaluationReview.unavailable")}
        </p>
      </section>
    );
  const activeCriteria =
    criteriaPlanDraft ?? evaluation.data.selectedCriteria ?? [];
  const storedResults = Object.fromEntries(
    evaluation.data.results.map((result) => [result.criterionCode, result]),
  );
  const criterionValue = (criterion: string) => {
    const stored = storedResults[criterion];
    return (
      draft[criterion] ?? {
        achievement: stored?.achievement ?? "",
        evidence: stored?.evidence ?? "",
        comment: stored?.comment ?? "",
      }
    );
  };
  const setCriterion = (
    criterion: string,
    changes: Partial<ResultDraft[string]>,
  ) =>
    setDraft((current) => ({
      ...current,
      [criterion]: {
        ...(current[criterion] ?? criterionValue(criterion)),
        ...changes,
      },
    }));
  const complete = activeCriteria.every((criterion) =>
    Boolean(criterionValue(criterion).achievement),
  );
  const revisionDeadlineValid =
    evaluation.data.isResit ||
    !requestRevision ||
    (Boolean(revisionDueLocal) &&
      Number.isFinite(Date.parse(revisionDueLocal)));
  const isPlanning =
    evaluation.data.submissionAttemptNumber === 1 &&
    (criteriaPlanDraft !== null || activeCriteria.length === 0);
  const criterionSections = groupCriteriaBySection(evaluation.data.criteria);
  const activeCriterionSections = groupCriteriaBySection(activeCriteria);
  const awaitingStudentRevision = evaluation.data.status === "NeedsRevision";
  const awaitingAdminApproval = evaluation.data.status === "UnderReview";
  const revisionRequestedAt = evaluation.data.feedback
    .filter((item) => item.requestsResubmission)
    .at(-1)?.createdAtUtc;
  const isRevisedFile = (createdAtUtc: string) =>
    evaluation.data.submissionAttemptNumber === 2 &&
    Boolean(revisionRequestedAt) &&
    Date.parse(createdAtUtc) > Date.parse(revisionRequestedAt!);
  const togglePlanCriterion = (criterion: string) =>
    setCriteriaPlanDraft((current) => {
      const selected = current ?? evaluation.data.selectedCriteria;
      return selected.includes(criterion)
        ? selected.filter((item) => item !== criterion)
        : [...selected, criterion];
    });
  return (
    <section className="shell py-10">
      <Link
        href={`/${locale}/teacher/evaluations`}
        className="focus-ring inline-flex items-center gap-1 text-sm font-bold text-primary"
      >
        <ArrowLeft size={16} className="rtl:rotate-180" aria-hidden="true" />
        {t("evaluationReview.back")}
      </Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form
          className="card p-5 sm:p-7"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              complete &&
              (evaluation.data.isRetake || feedback.trim()) &&
              revisionDeadlineValid
            )
              submit.mutate();
          }}
        >
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
            {evaluation.data.isRetake
              ? t("evaluationReview.retakeEyebrow")
              : evaluation.data.isResit
                ? t("evaluationReview.resitEyebrow")
                : evaluation.data.submissionAttemptNumber === 1
                  ? t("evaluationReview.initialEyebrow")
                  : t("evaluationReview.revisionEyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-black">
            {t("evaluationReview.title")}
          </h1>
          {evaluation.data.isResit &&
            evaluation.data.resitOfEvaluationRequestId && (
              <p className="mt-2 text-sm text-muted">
                {t("shared.originalRequest")}{" "}
                {evaluation.data.resitOfEvaluationRequestId.slice(0, 8)}
              </p>
            )}
          {isPlanning ? (
            <>
              <p className="mt-3 text-sm leading-6 text-muted">
                {t("evaluationReview.planningDescription")}
              </p>
              <div className="mt-6 grid gap-4">
                {criterionSections.map((section) => (
                  <fieldset
                    key={section.section}
                    className="rounded-2xl border border-primary/25 bg-white/[.025] p-4"
                  >
                    <legend className="px-1 text-base font-black text-foreground">
                      {sectionLabel(section.section, t)}
                    </legend>
                    <div className="mt-3 grid gap-3">
                      {groupCriteriaByBand(section.criteria)
                        .filter((group) => group.criteria.length > 0)
                        .map((group) => {
                          const selectedCount = group.criteria.filter(
                            (criterion) => activeCriteria.includes(criterion),
                          ).length;
                          return (
                            <div
                              key={`${section.section}-${group.band}`}
                              className="rounded-xl border border-border bg-black/10 p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-black text-foreground">
                                  {criterionGroupLabel(group.band, t)}
                                </p>
                                <span className="text-xs text-muted">
                                  {t("evaluationReview.selectedCount", {
                                    selected: String(selectedCount),
                                    total: String(group.criteria.length),
                                  })}
                                </span>
                              </div>
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                {group.criteria.map((criterion) => (
                                  <label
                                    key={criterion}
                                    className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-surface-solid/50 px-3 py-2.5 text-sm font-bold text-foreground hover:bg-white/5"
                                  >
                                    <span>{criterionLabel(criterion)}</span>
                                    <input
                                      type="checkbox"
                                      checked={activeCriteria.includes(
                                        criterion,
                                      )}
                                      onChange={() =>
                                        togglePlanCriterion(criterion)
                                      }
                                      className="focus-ring size-4 accent-[var(--primary)]"
                                    />
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </fieldset>
                ))}
              </div>
              <button
                type="button"
                onClick={() => saveCriteriaPlan.mutate(activeCriteria)}
                disabled={
                  activeCriteria.length === 0 || saveCriteriaPlan.isPending
                }
                className="focus-ring mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BadgeCheck size={18} aria-hidden="true" />
                {saveCriteriaPlan.isPending
                  ? t("shared.loading")
                  : t("evaluationReview.confirmCriteria")}
              </button>
              {saveCriteriaPlan.isError && (
                <p className="mt-3 text-sm text-red-500" role="alert">
                  {saveCriteriaPlan.error instanceof Error
                    ? saveCriteriaPlan.error.message
                    : t("shared.requestFailed")}
                </p>
              )}
            </>
          ) : awaitingStudentRevision ? (
            <div
              className="mt-5 rounded-2xl border border-primary/30 bg-primary/10 p-5"
              role="status"
            >
              <p className="font-black text-foreground">
                {t("evaluationReview.awaitingRevision")}
              </p>
              <p className="mt-2 text-sm text-muted">
                {t("evaluationReview.estimatedResult")}
              </p>
              <p className="mt-2 text-2xl font-black text-primary">
                {evaluation.data.calculatedGrade ?? "—"}
              </p>
              {evaluation.data.feedback.at(-1)?.body ? (
                <p className="mt-3 rounded-xl border border-border bg-surface-solid/60 p-3 text-sm text-muted">
                  {evaluation.data.feedback.at(-1)?.body}
                </p>
              ) : null}
            </div>
          ) : awaitingAdminApproval ? (
            <div
              className="mt-5 rounded-2xl border border-primary/30 bg-primary/10 p-5"
              role="status"
            >
              <p className="font-black text-foreground">
                {t("evaluationReview.awaitingApproval")}
              </p>
              <p className="mt-2 text-sm text-muted">
                {t("evaluationReview.serverResult")}
              </p>
              <p className="mt-2 text-2xl font-black text-primary">
                {evaluation.data.calculatedGrade ?? "—"}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {evaluation.data.sectionResults.map((section) => (
                  <p
                    key={section.section}
                    className="rounded-xl border border-border bg-surface-solid/60 p-3 text-sm"
                  >
                    <strong>{sectionLabel(section.section, t)}: </strong>
                    {section.grade}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/10 p-4">
                <div>
                  <p className="text-sm font-black text-foreground">
                    {t("evaluationReview.selectedCriteria")}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {activeCriterionSections
                      .map(
                        (section) =>
                          `${section.section}: ${section.criteria.length}`,
                      )
                      .join(" · ")}
                  </p>
                </div>
                {evaluation.data.status === "Assigned" &&
                  evaluation.data.submissionAttemptNumber === 1 && (
                    <button
                      type="button"
                      onClick={() => setCriteriaPlanDraft([...activeCriteria])}
                      className="focus-ring rounded-xl border border-primary/40 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10"
                    >
                      {t("evaluationReview.editCriteria")}
                    </button>
                  )}
              </div>
              <p className="mt-4 text-sm leading-6 text-muted">
                {t("evaluationReview.gradingDescription")}
              </p>
              <div className="mt-6 grid gap-4">
                {activeCriterionSections.map((section) => (
                  <section
                    key={section.section}
                    className="rounded-2xl border border-primary/25 bg-white/[.025] p-4"
                  >
                    <h2 className="text-lg font-black text-foreground">
                      {sectionLabel(section.section, t)}
                    </h2>
                    <div className="mt-4 grid gap-4">
                      {groupCriteriaByBand(section.criteria)
                        .filter((group) => group.criteria.length > 0)
                        .map((group) => (
                          <div key={`${section.section}-${group.band}`}>
                            <h3 className="text-sm font-black text-primary">
                              {criterionGroupLabel(group.band, t)}
                            </h3>
                            <div className="mt-2 grid gap-3">
                              {group.criteria.map((criterion) => (
                                <fieldset
                                  key={criterion}
                                  className="rounded-xl border border-border bg-surface-solid/50 p-4"
                                >
                                  <legend className="px-1 text-sm font-black text-foreground">
                                    {criterionLabel(criterion)}
                                  </legend>
                                  <div className="mt-2">
                                    <label className="grid gap-1 text-xs font-bold text-muted">
                                      {t("evaluationReview.outcome")}
                                      <select
                                        required
                                        value={
                                          criterionValue(criterion).achievement
                                        }
                                        onChange={(event) =>
                                          setCriterion(criterion, {
                                            achievement: event.target.value,
                                          })
                                        }
                                        className="rounded-xl border border-border bg-transparent p-2.5 text-sm text-foreground"
                                      >
                                        <option value="">
                                          {t("evaluationReview.chooseOutcome")}
                                        </option>
                                        <option value="Achieved">
                                          {t("evaluationReview.achieved")}
                                        </option>
                                        <option value="PartiallyAchieved">
                                          {t(
                                            "evaluationReview.partiallyAchieved",
                                          )}
                                        </option>
                                        <option value="NotAchieved">
                                          {t("evaluationReview.notAchieved")}
                                        </option>
                                        <option value="NotApplicable">
                                          {t("evaluationReview.notApplicable")}
                                        </option>
                                      </select>
                                    </label>
                                  </div>
                                  <label className="mt-3 grid gap-1 text-xs font-bold text-muted">
                                    {t("evaluationReview.evidence")}
                                    <textarea
                                      value={criterionValue(criterion).evidence}
                                      onChange={(event) =>
                                        setCriterion(criterion, {
                                          evidence: event.target.value,
                                        })
                                      }
                                      className="min-h-20 rounded-xl border border-border bg-transparent p-2.5 text-sm text-foreground"
                                    />
                                  </label>
                                  <label className="mt-3 grid gap-1 text-xs font-bold text-muted">
                                    {t("evaluationReview.comment")}
                                    <textarea
                                      value={criterionValue(criterion).comment}
                                      onChange={(event) =>
                                        setCriterion(criterion, {
                                          comment: event.target.value,
                                        })
                                      }
                                      className="min-h-20 rounded-xl border border-border bg-transparent p-2.5 text-sm text-foreground"
                                    />
                                  </label>
                                </fieldset>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  </section>
                ))}
              </div>
              {!evaluation.data.isRetake ? (
                <div className="mt-6 grid gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-4">
                  <label className="grid gap-2 text-sm font-bold text-foreground">
                    {t("evaluationReview.feedback")}
                    <textarea
                      required
                      maxLength={4000}
                      value={feedback}
                      onChange={(event) => setFeedback(event.target.value)}
                      className="min-h-28 rounded-xl border border-border bg-transparent p-3 text-sm font-normal text-foreground"
                      placeholder={t("evaluationReview.feedbackPlaceholder")}
                    />
                  </label>
                  {evaluation.data.isResit ? null : evaluation.data
                      .submissionAttemptNumber === 1 ? (
                    <div className="grid gap-3">
                      <label className="flex items-start gap-3 rounded-xl border border-border bg-surface-solid/60 p-3 text-sm">
                        <input
                          type="checkbox"
                          checked={requestRevision}
                          onChange={(event) => {
                            setRequestRevision(event.target.checked);
                            if (!event.target.checked) setRevisionDueLocal("");
                          }}
                          className="mt-1 size-4 accent-[var(--primary)]"
                        />
                        <span>
                          <strong>{t("evaluationReview.openRevision")}</strong>
                          <span className="mt-1 block text-muted">
                            {t("evaluationReview.openRevisionDescription")}
                          </span>
                        </span>
                      </label>
                      {requestRevision && (
                        <label className="grid gap-2 text-sm font-bold text-foreground">
                          {t("evaluationReview.revisionDeadline")}
                          <input
                            type="datetime-local"
                            required
                            value={revisionDueLocal}
                            onChange={(event) =>
                              setRevisionDueLocal(event.target.value)
                            }
                            className="rounded-xl border border-border bg-transparent p-3 text-sm font-normal text-foreground"
                          />
                        </label>
                      )}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-border bg-surface-solid/60 p-3 text-sm text-muted">
                      {t("evaluationReview.finalRevision")}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-6 rounded-xl border border-border bg-surface-solid/60 p-3 text-sm text-muted">
                  {t("evaluationReview.historicalRetakeDescription")}
                </p>
              )}
              <button
                disabled={
                  !complete ||
                  (!evaluation.data.isRetake && !feedback.trim()) ||
                  !revisionDeadlineValid ||
                  submit.isPending
                }
                className="focus-ring mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BadgeCheck size={18} aria-hidden="true" />
                {evaluation.data.isRetake
                  ? t("evaluationReview.submitRetake")
                  : evaluation.data.submissionAttemptNumber === 1
                    ? t("evaluationReview.submitReview")
                    : t("evaluationReview.submitRevision")}
              </button>
              {submit.isSuccess && (
                <p
                  className="mt-3 text-sm font-bold text-primary"
                  role="status"
                >
                  {evaluation.data.isRetake
                    ? t("evaluationReview.retakeSuccess")
                    : t("evaluationReview.reviewSuccess")}
                </p>
              )}
              {submit.isError && (
                <p className="mt-3 text-sm text-red-500" role="alert">
                  {submit.error instanceof Error
                    ? submit.error.message
                    : t("shared.requestFailed")}
                </p>
              )}
            </>
          )}
        </form>
        <aside className="card h-fit p-5 lg:sticky lg:top-24">
          <h2 className="flex items-center gap-2 font-black">
            <Files size={18} className="text-primary" aria-hidden="true" />
            {t("evaluationReview.studentFiles")}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            {evaluation.data.studentComment || t("shared.noStudentNote")}
          </p>
          <div className="mt-4 grid gap-2">
            {evaluation.data.files.map((file) => {
              const revised = isRevisedFile(file.createdAtUtc);
              return (
                <a
                  key={file.id}
                  href={`/api/v1/evaluations/${evaluationId}/files/${file.id}`}
                  className="focus-ring rounded-xl border border-border bg-white/5 p-3 text-sm font-bold text-primary hover:bg-primary/10"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {file.originalFileName}
                    </span>
                    {revised ? (
                      <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">
                        {t("evaluationReview.revisedFile")}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-xs font-normal text-muted">
                    {(file.lengthBytes / 1024 / 1024).toFixed(2)}{" "}
                    {t("shared.megabytes")} · {file.scanStatus}
                  </span>
                </a>
              );
            })}
            {!evaluation.data.files.length && (
              <p className="text-sm text-muted">
                {t("evaluationReview.noFiles")}
              </p>
            )}
          </div>
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="font-black">
              {t("evaluationReview.evidencePortfolio")}
            </h3>
            <div className="mt-3 grid gap-2 text-sm text-muted">
              {evaluation.data.evidence.map((item) => (
                <p key={item.criterionCode}>
                  <strong className="text-foreground">
                    {item.criterionCode}:
                  </strong>
                  {item.narrative}
                </p>
              ))}
              {!evaluation.data.evidence.length ? (
                <p>{t("evaluationReview.noWrittenEvidence")}</p>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

type CriterionSection = { section: string; criteria: string[] };

function describeCriterion(criterion: string) {
  const code = criterion.trim().toUpperCase();
  const match = /^([A-Z])[.:-]([PMD]\d+)$/i.exec(code);
  const label = match?.[2] ?? code;
  return {
    section: match?.[1] ?? "A",
    band: /^[PMD]/i.test(label) ? label.charAt(0).toUpperCase() : "Other",
    label,
  };
}

function groupCriteriaBySection(criteria: string[]): CriterionSection[] {
  const grouped = new Map<string, string[]>();
  criteria.forEach((criterion) => {
    const { section } = describeCriterion(criterion);
    grouped.set(section, [...(grouped.get(section) ?? []), criterion]);
  });
  return [...grouped.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([section, sectionCriteria]) => ({
      section,
      criteria: [...sectionCriteria].sort((first, second) =>
        criterionLabel(first).localeCompare(criterionLabel(second), undefined, {
          numeric: true,
        }),
      ),
    }));
}

function groupCriteriaByBand(criteria: string[]) {
  return ["P", "M", "D", "Other"].map((band) => ({
    band,
    criteria: criteria.filter(
      (criterion) => describeCriterion(criterion).band === band,
    ),
  }));
}

function criterionLabel(criterion: string) {
  return describeCriterion(criterion).label;
}

type TeacherTranslations = ReturnType<
  typeof useTranslations<"teacherWorkspace">
>;

function sectionLabel(section: string, t: TeacherTranslations) {
  return t("evaluationReview.section", { section });
}

function criterionGroupLabel(family: string, t: TeacherTranslations) {
  if (family === "P") return t("evaluationReview.passCriteria");
  if (family === "M") return t("evaluationReview.meritCriteria");
  if (family === "D") return t("evaluationReview.distinctionCriteria");
  return t("evaluationReview.additionalCriteria");
}
