"use client";

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
import { useLocale } from "next-intl";
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
        eyebrow="BETCCO Teacher Studio"
        title={locale === "ar" ? "لوحة المعلم" : "Teacher dashboard"}
        description={
          locale === "ar"
            ? "أنشئ المحتوى، وتابع حالة مراجعته، وأنجز التقييمات المسندة إليك ضمن مساحة عمل مركزة."
            : "Create content, track its review state, and complete assigned evaluations from one focused workspace."
        }
        actions={
          <Link
            href={`/${locale}/teacher/courses/new`}
            className="focus-ring inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-slate-950"
          >
            <Plus size={18} aria-hidden="true" />
            {locale === "ar" ? "إنشاء دورة" : "Create course"}
          </Link>
        }
      />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label={locale === "ar" ? "مسوداتك" : "Your drafts"}
          value={courses.isPending ? "—" : drafts}
          detail={
            locale === "ar"
              ? "ابدأ بإكمال المتطلبات"
              : "Complete their publishing requirements"
          }
          icon={FilePenLine}
        />
        <MetricCard
          label={locale === "ar" ? "بانتظار المراجعة" : "Awaiting review"}
          value={courses.isPending ? "—" : waiting}
          detail={
            locale === "ar"
              ? "دورات أُرسلت إلى الأدمن"
              : "Courses submitted to an administrator"
          }
          icon={BadgeCheck}
          tone="warm"
        />
        <MetricCard
          label={locale === "ar" ? "الدورات المنشورة" : "Published courses"}
          value={courses.isPending ? "—" : published}
          detail={
            locale === "ar" ? "متاحة الآن للطلاب" : "Available to students now"
          }
          icon={GraduationCap}
          tone="secondary"
        />
        <MetricCard
          label={locale === "ar" ? "الطلاب المسجلون" : "Enrolled students"}
          value={analytics.isPending ? "—" : (analytics.data?.students ?? 0)}
          detail={
            locale === "ar"
              ? "عدد فريد عبر دوراتك"
              : "Unique learners across your courses"
          }
          icon={GraduationCap}
          tone="secondary"
        />
        <MetricCard
          label={locale === "ar" ? "بانتظار تدقيقك" : "Awaiting review"}
          value={
            analytics.isPending ? "—" : (analytics.data?.pendingReviews ?? 0)
          }
          detail={
            locale === "ar"
              ? "تسليمات مهام وتدريب تكويني"
              : "Submitted coursework and formative practice"
          }
          icon={ClipboardCheck}
          tone="warm"
        />
        <MetricCard
          label={locale === "ar" ? "متوسط التقدم" : "Average progress"}
          value={
            analytics.isPending
              ? "—"
              : `${analytics.data?.averageLessonProgress ?? 0}%`
          }
          detail={locale === "ar" ? "الدروس المنشورة" : "Published lessons"}
          icon={BookOpenCheck}
        />
        <MetricCard
          label={
            locale === "ar"
              ? "طلاب يحتاجون متابعة"
              : "Students needing attention"
          }
          value={
            analytics.isPending
              ? "—"
              : (analytics.data?.studentsAtRiskCount ?? 0)
          }
          detail={
            locale === "ar"
              ? "بناءً على التقدم والمهام والتدريب التكويني"
              : "Based on progress, coursework, and formative practice"
          }
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
          title={locale === "ar" ? "دوراتي" : "My courses"}
          text={
            locale === "ar"
              ? "شاهد الحالة وعدّل مسوداتك."
              : "Review the status of your course work."
          }
          icon={BookOpenCheck}
        />
        <AreaLink
          href="courses/new"
          title={locale === "ar" ? "أنشئ دورة" : "Create course"}
          text={
            locale === "ar"
              ? "ابدأ مسودة جديدة قابلة للمراجعة."
              : "Start a new draft ready for review."
          }
          icon={FilePenLine}
        />
        <AreaLink
          href="evaluations"
          title={locale === "ar" ? "مهام التقييم" : "Evaluation work"}
          text={
            locale === "ar"
              ? "افتح الطلبات المسندة إليك فقط."
              : "Open only the requests assigned to you."
          }
          icon={ClipboardCheck}
        />
        <AreaLink
          href="wallet"
          title={locale === "ar" ? "محفظتي" : "My wallet"}
          text={
            locale === "ar"
              ? "تابع أرباح دوراتك واطلب سحب رصيدك المتاح."
              : "Track course earnings and request a withdrawal of your available balance."
          }
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
        eyebrow="BETCCO Teacher Wallet"
        title={locale === "ar" ? "محفظتي" : "My wallet"}
        description={
          locale === "ar"
            ? "يُضاف لك 70٪ من صافي بيع كل دورة بعد التحقق من الدفع. اطلب السحب من رصيدك المتاح فقط."
            : "70% of each course's net sale is credited after payment verification. Request withdrawals only from your available balance."
        }
      />
      {wallet.isPending ? (
        <div className="card mt-6 p-6" aria-busy>
          …
        </div>
      ) : wallet.isError || !values ? (
        <p className="card mt-6 p-6" role="alert">
          {locale === "ar"
            ? "تعذّر تحميل المحفظة. تأكد من تسجيل الدخول كمعلم."
            : "Unable to load your wallet. Confirm that you are signed in as a teacher."}
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <MetricCard
              label={locale === "ar" ? "الرصيد المتاح" : "Available balance"}
              value={`${values.availableBalance.toFixed(3)} ${values.currency}`}
              detail={
                locale === "ar" ? "قابل لطلب السحب" : "Eligible for withdrawal"
              }
              icon={WalletCards}
              tone="secondary"
            />
            <MetricCard
              label={locale === "ar" ? "إجمالي الأرباح" : "Total earnings"}
              value={`${values.totalEarned.toFixed(3)} ${values.currency}`}
              detail={locale === "ar" ? "حصة المعلم 70٪" : "Teacher share: 70%"}
              icon={GraduationCap}
            />
            <MetricCard
              label={locale === "ar" ? "طلبات السحب" : "Withdrawals"}
              value={`${Math.abs(values.totalWithdrawn).toFixed(3)} ${values.currency}`}
              detail={locale === "ar" ? "محجوزة أو مدفوعة" : "Reserved or paid"}
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
                  {locale === "ar" ? "طلب سحب" : "Request withdrawal"}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {locale === "ar"
                    ? "لا تُعرض بيانات الوجهة كاملة للأدمن، وهي مشفّرة في النظام."
                    : "Destination details are encrypted in the system and masked for administrators."}
                </p>
              </div>
              <label className="grid gap-1 text-sm font-bold">
                {locale === "ar" ? "المبلغ (دينار أردني)" : "Amount (JOD)"}
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
                {locale === "ar" ? "طريقة السحب" : "Withdrawal method"}
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  className="rounded-xl border border-border bg-white/5 p-3"
                >
                  <option value="BankTransfer">
                    {locale === "ar" ? "تحويل بنكي" : "Bank transfer"}
                  </option>
                  <option value="EWallet">
                    {locale === "ar" ? "محفظة إلكترونية" : "E-wallet"}
                  </option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-bold">
                {method === "BankTransfer"
                  ? locale === "ar"
                    ? "رقم الحساب أو IBAN"
                    : "Account number or IBAN"
                  : locale === "ar"
                    ? "رقم المحفظة الإلكترونية"
                    : "E-wallet number"}
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
                  ? locale === "ar"
                    ? "جارٍ الإرسال…"
                    : "Submitting…"
                  : locale === "ar"
                    ? "إرسال طلب السحب"
                    : "Submit withdrawal request"}
              </button>
              {requestWithdrawal.isError && (
                <p role="alert" className="text-sm text-red-400">
                  {requestWithdrawal.error instanceof Error
                    ? requestWithdrawal.error.message
                    : locale === "ar"
                      ? "تعذّر إنشاء طلب السحب."
                      : "Unable to create the withdrawal request."}
                </p>
              )}
            </form>
            <WalletTable
              title={locale === "ar" ? "آخر العمليات" : "Recent activity"}
              empty={
                locale === "ar" ? "لا توجد عمليات بعد." : "No transactions yet."
              }
              rows={values.transactions.map((transaction) => ({
                id: transaction.id,
                title: transaction.description,
                meta: new Intl.DateTimeFormat(
                  locale === "ar" ? "ar-JO" : "en",
                  {
                    dateStyle: "medium",
                    timeStyle: "short",
                  },
                ).format(new Date(transaction.createdAtUtc)),
                amount: `${transaction.amount >= 0 ? "+" : ""}${transaction.amount.toFixed(3)} ${transaction.currency}`,
                positive: transaction.amount >= 0,
              }))}
            />
          </div>
          <div className="mt-6">
            <WalletTable
              title={locale === "ar" ? "طلبات السحب" : "Withdrawal requests"}
              empty={
                locale === "ar"
                  ? "لم تطلب سحبًا بعد."
                  : "You have not requested a withdrawal yet."
              }
              rows={values.payouts.map((payout) => ({
                id: payout.id,
                title: `${payout.method === "BankTransfer" ? (locale === "ar" ? "تحويل بنكي" : "Bank transfer") : locale === "ar" ? "محفظة إلكترونية" : "E-wallet"} — ${payout.destinationMasked}`,
                meta: `${payout.status}${payout.reviewNote ? ` — ${payout.reviewNote}` : ""}`,
                amount: `${payout.amount.toFixed(3)} ${payout.currency}`,
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
  return (
    <Link
      href={`/${locale}/teacher/${href}`}
      className="focus-ring block rounded-[1.25rem]"
    >
      <ActionCard title={title} description={text} icon={icon}>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-black text-primary">
          {locale === "ar" ? "فتح" : "Open"}
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
  retakeOfEvaluationRequestId: string | null;
};

function TeacherEvaluations() {
  const locale = useLocale();
  const evaluations = useQuery({
    queryKey: ["teacher-evaluations"],
    queryFn: () => api<AssignedEvaluation[]>("/evaluations/assigned"),
  });
  if (evaluations.isPending)
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          …
        </div>
      </section>
    );
  if (evaluations.isError)
    return (
      <section className="shell py-10">
        <p className="card p-6" role="alert">
          {locale === "ar"
            ? "تعذر تحميل التقييمات المسندة إليك."
            : "Unable to load your assigned evaluations."}
        </p>
      </section>
    );
  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow="BETCCO Evaluation"
        title={locale === "ar" ? "مهام التقييم" : "Evaluation work"}
        description={
          locale === "ar"
            ? "لا تظهر هنا إلا الطلبات التي أسندها الأدمن إلى حسابك."
            : "Only requests assigned to your account by an administrator appear here."
        }
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
                      ? locale === "ar"
                        ? "Retake مسند · Pass فقط"
                        : "Assigned Retake · Pass only"
                      : locale === "ar"
                        ? "طلب تقييم مسند"
                        : "Assigned evaluation"}
                  </span>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                  {evaluation.studentComment ||
                    (locale === "ar"
                      ? "لا توجد ملاحظة من الطالب."
                      : "No student note was provided.")}
                </p>
              </div>
              <span className="rounded-full border border-border bg-white/5 px-3 py-1 text-xs font-bold text-muted">
                {evaluation.status}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <Files size={14} aria-hidden="true" />
                {evaluation.filesCount} {locale === "ar" ? "ملفات" : "files"}
              </span>
              <span>
                {evaluation.criteria.length}{" "}
                {locale === "ar" ? "معايير" : "criteria"}
              </span>
              <span className="ms-auto inline-flex items-center gap-1 font-bold text-primary">
                {locale === "ar" ? "بدء التقييم" : "Start evaluation"}
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
            {locale === "ar"
              ? "لا توجد طلبات تقييم مسندة إليك حاليًا."
              : "You have no assigned evaluation requests right now."}
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
        (!revisionDueLocal || !Number.isFinite(Date.parse(revisionDueLocal)))
      )
        throw new Error(
          locale === "ar"
            ? "حدد موعدًا صالحًا لفرصة التعديل الوحيدة."
            : "Choose a valid deadline for the one revision check.",
        );
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
            evaluation.data?.submissionAttemptNumber === 1
              ? requestRevision
              : false,
          revisionDueAtUtc:
            evaluation.data?.submissionAttemptNumber === 1 && requestRevision
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
          …
        </div>
      </section>
    );
  if (evaluation.isError || !evaluation.data)
    return (
      <section className="shell py-10">
        <p className="card p-6" role="alert">
          {locale === "ar"
            ? "هذا الطلب غير متاح لحسابك."
            : "This request is unavailable to your account."}
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
        {locale === "ar" ? "كل مهام التقييم" : "All evaluation work"}
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
              ? "Historical Retake"
              : evaluation.data.submissionAttemptNumber === 1
                ? "BETCCO Initial Review"
                : "BETCCO Revision Check"}
          </p>
          <h1 className="mt-2 text-3xl font-black">
            {locale === "ar"
              ? "مراجعة مهمة الطالب"
              : "Student assignment review"}
          </h1>
          {isPlanning ? (
            <>
              <p className="mt-3 text-sm leading-6 text-muted">
                {locale === "ar"
                  ? "الخطوة الأولى: حدّد معايير كل قسم من المهمة. لكل قسم ابدأ بمعايير P، ثم أضف M، ثم D عند الحاجة؛ لا يمكن اعتماد D بدون P وM في القسم نفسه."
                  : "Step one: choose criteria within each task section. Start with P, then M, then D; a D criterion requires P and M in the same section."}
              </p>
              <div className="mt-6 grid gap-4">
                {criterionSections.map((section) => (
                  <fieldset
                    key={section.section}
                    className="rounded-2xl border border-primary/25 bg-white/[.025] p-4"
                  >
                    <legend className="px-1 text-base font-black text-foreground">
                      {sectionLabel(section.section, locale)}
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
                                  {criterionGroupLabel(group.band, locale)}
                                </p>
                                <span className="text-xs text-muted">
                                  {locale === "ar"
                                    ? `${selectedCount} من ${group.criteria.length} محدد`
                                    : `${selectedCount} of ${group.criteria.length} selected`}
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
                  ? "…"
                  : locale === "ar"
                    ? "تأكيد المعايير وبدء التقييم"
                    : "Confirm criteria and start evaluation"}
              </button>
              {saveCriteriaPlan.isError && (
                <p className="mt-3 text-sm text-red-500" role="alert">
                  {saveCriteriaPlan.error instanceof Error
                    ? saveCriteriaPlan.error.message
                    : "Request failed."}
                </p>
              )}
            </>
          ) : awaitingStudentRevision ? (
            <div
              className="mt-5 rounded-2xl border border-primary/30 bg-primary/10 p-5"
              role="status"
            >
              <p className="font-black text-foreground">
                {locale === "ar"
                  ? "تم إرسال الملاحظات للطالب. بانتظار النسخة المعدلة."
                  : "Feedback sent. Waiting for the learner's revised assignment."}
              </p>
              <p className="mt-2 text-sm text-muted">
                {locale === "ar"
                  ? "النتيجة التقديرية الحالية من BETCCO:"
                  : "Current BETCCO estimated result:"}
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
                {locale === "ar"
                  ? "أُرسلت النتيجة إلى الأدمن للاعتماد النهائي."
                  : "The result has been sent to the administrator for final approval."}
              </p>
              <p className="mt-2 text-sm text-muted">
                {locale === "ar"
                  ? "النتيجة المحسوبة من الخادم (لن تظهر للطالب قبل الاعتماد):"
                  : "Server-calculated result (not visible to the student until approval):"}
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
                    <strong>{sectionLabel(section.section, locale)}: </strong>
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
                    {locale === "ar"
                      ? "معايير المهمة المحددة"
                      : "Selected task criteria"}
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
                      {locale === "ar" ? "تعديل المعايير" : "Edit criteria"}
                    </button>
                  )}
              </div>
              <p className="mt-4 text-sm leading-6 text-muted">
                {locale === "ar"
                  ? "حدّد نتيجة كل معيار مختار. يحدد النظام النتيجة من المعايير المحققة وقاعدة التقييم المحفوظة للمهمة؛ لا تُحوّل النسبة المئوية إلى Pass أو Merit أو Distinction."
                  : "Set each selected criterion outcome. The server derives the outcome from achieved criteria and the task's saved assessment rule; a percentage never becomes Pass, Merit, or Distinction."}
              </p>
              <div className="mt-6 grid gap-4">
                {activeCriterionSections.map((section) => (
                  <section
                    key={section.section}
                    className="rounded-2xl border border-primary/25 bg-white/[.025] p-4"
                  >
                    <h2 className="text-lg font-black text-foreground">
                      {sectionLabel(section.section, locale)}
                    </h2>
                    <div className="mt-4 grid gap-4">
                      {groupCriteriaByBand(section.criteria)
                        .filter((group) => group.criteria.length > 0)
                        .map((group) => (
                          <div key={`${section.section}-${group.band}`}>
                            <h3 className="text-sm font-black text-primary">
                              {criterionGroupLabel(group.band, locale)}
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
                                      {locale === "ar" ? "النتيجة" : "Outcome"}
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
                                          {locale === "ar"
                                            ? "اختر النتيجة"
                                            : "Choose outcome"}
                                        </option>
                                        <option value="Achieved">
                                          {locale === "ar"
                                            ? "متحقق"
                                            : "Achieved"}
                                        </option>
                                        <option value="PartiallyAchieved">
                                          {locale === "ar"
                                            ? "متحقق جزئيًا"
                                            : "Partially achieved"}
                                        </option>
                                        <option value="NotAchieved">
                                          {locale === "ar"
                                            ? "غير متحقق"
                                            : "Not achieved"}
                                        </option>
                                        <option value="NotApplicable">
                                          {locale === "ar"
                                            ? "غير منطبق"
                                            : "Not applicable"}
                                        </option>
                                      </select>
                                    </label>
                                  </div>
                                  <label className="mt-3 grid gap-1 text-xs font-bold text-muted">
                                    {locale === "ar" ? "الدليل" : "Evidence"}
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
                                    {locale === "ar" ? "ملاحظة" : "Comment"}
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
                    {locale === "ar"
                      ? "ملاحظات المعلم للطالب"
                      : "Teacher feedback"}
                    <textarea
                      required
                      maxLength={4000}
                      value={feedback}
                      onChange={(event) => setFeedback(event.target.value)}
                      className="min-h-28 rounded-xl border border-border bg-transparent p-3 text-sm font-normal text-foreground"
                      placeholder={
                        locale === "ar"
                          ? "اشرح للطالب ما هو جيد، ما الناقص، وما الذي يجب تعديله قبل التسليم للمدرسة."
                          : "Explain what is strong, what is missing, and what to revise before the school submission."
                      }
                    />
                  </label>
                  {evaluation.data.submissionAttemptNumber === 1 ? (
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
                          <strong>
                            {locale === "ar"
                              ? "فتح فرصة التعديل الوحيدة"
                              : "Open the one revision check"}
                          </strong>
                          <span className="mt-1 block text-muted">
                            {locale === "ar"
                              ? "سيشاهد الطالب النتيجة التقديرية الحالية وملاحظاتك، ثم يرفع نسخة معدلة مرة واحدة."
                              : "The learner will see the current estimated result and your feedback, then can upload one revised version."}
                          </span>
                        </span>
                      </label>
                      {requestRevision && (
                        <label className="grid gap-2 text-sm font-bold text-foreground">
                          {locale === "ar"
                            ? "آخر موعد للمراجعة الثانية"
                            : "Revision check deadline"}
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
                      {locale === "ar"
                        ? "هذه هي مراجعة النسخة المعدلة النهائية. لا توجد محاولة تعديل ثالثة."
                        : "This is the final revision check. No third revision is available."}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-6 rounded-xl border border-border bg-surface-solid/60 p-3 text-sm text-muted">
                  {locale === "ar"
                    ? "هذا Retake تاريخي موجود قبل تبسيط خدمة BETCCO. سيستمر بالمسار القديم حتى يكتمل، ولن يتم إنشاء Retake جديد."
                    : "This is a historical Retake created before the BETCCO review-flow simplification. It can finish through the legacy path, but no new Retake is created."}
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
                  ? locale === "ar"
                    ? "إرسال نتيجة الـRetake التاريخي"
                    : "Submit historical Retake result"
                  : evaluation.data.submissionAttemptNumber === 1
                    ? locale === "ar"
                      ? "إرسال المراجعة والملاحظات"
                      : "Send review and feedback"
                    : locale === "ar"
                      ? "إكمال فحص النسخة المعدلة"
                      : "Complete revision check"}
              </button>
              {submit.isSuccess && (
                <p
                  className="mt-3 text-sm font-bold text-primary"
                  role="status"
                >
                  {evaluation.data.isRetake
                    ? locale === "ar"
                      ? "تم إرسال نتيجة الـRetake التاريخي للمسار القديم."
                      : "The historical Retake result was sent through the legacy path."
                    : locale === "ar"
                      ? "تم حفظ مراجعة BETCCO وإرسال الملاحظات للطالب."
                      : "The BETCCO review was saved and the learner was notified."}
                </p>
              )}
              {submit.isError && (
                <p className="mt-3 text-sm text-red-500" role="alert">
                  {submit.error instanceof Error
                    ? submit.error.message
                    : "Request failed."}
                </p>
              )}
            </>
          )}
        </form>
        <aside className="card h-fit p-5 lg:sticky lg:top-24">
          <h2 className="flex items-center gap-2 font-black">
            <Files size={18} className="text-primary" aria-hidden="true" />
            {locale === "ar" ? "ملفات الطالب" : "Student files"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            {evaluation.data.studentComment ||
              (locale === "ar"
                ? "لا توجد ملاحظة من الطالب."
                : "No student note was provided.")}
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
                        {locale === "ar" ? "نسخة معدلة" : "Revised file"}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-xs font-normal text-muted">
                    {(file.lengthBytes / 1024 / 1024).toFixed(2)} MB ·{" "}
                    {file.scanStatus}
                  </span>
                </a>
              );
            })}
            {!evaluation.data.files.length && (
              <p className="text-sm text-muted">
                {locale === "ar"
                  ? "لا توجد ملفات متاحة."
                  : "No files are available."}
              </p>
            )}
          </div>
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="font-black">
              {locale === "ar"
                ? "ملف أدلة المعايير"
                : "Criterion evidence portfolio"}
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
                <p>
                  {locale === "ar"
                    ? "لم يربط الطالب أدلة نصية بالمعايير."
                    : "The student did not map written evidence to criteria."}
                </p>
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

function sectionLabel(section: string, locale: string) {
  if (locale === "ar") return `القسم ${section}`;
  return `Section ${section}`;
}

function criterionGroupLabel(family: string, locale: string) {
  if (family === "P")
    return locale === "ar" ? "معايير P (Pass)" : "P (Pass) criteria";
  if (family === "M")
    return locale === "ar" ? "معايير M (Merit)" : "M (Merit) criteria";
  if (family === "D")
    return locale === "ar"
      ? "معايير D (Distinction)"
      : "D (Distinction) criteria";
  return locale === "ar" ? "معايير إضافية" : "Additional criteria";
}
