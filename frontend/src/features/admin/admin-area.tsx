"use client";

/* The review cover endpoint is authenticated, so Next's image optimizer cannot request it. */
/* eslint-disable @next/next/no-img-element */

import { api } from "@/lib/api";
import { AccountSecurity } from "@/features/auth/account-security";
import { ContentStudio } from "@/features/admin/content-studio";
import { CommerceCatalogManager } from "@/features/admin/commerce-catalog";
import { CommissionSettings } from "@/features/admin/commission-settings";
import { AuditLogViewer } from "@/features/admin/audit-log";
import { AdminGradebook } from "@/features/admin/gradebook";
import { PlatformRatingModeration } from "@/features/admin/platform-rating-moderation";
import { PrivacyRequestManagement } from "@/features/admin/privacy-request-management";
import { SecurityIncidentManagement } from "@/features/admin/security-incident-management";
import { InternalVerificationPlanManagement } from "@/features/admin/internal-verification-plan-management";
import { EvaluationAppealManagement } from "@/features/admin/evaluation-appeal-management";
import { QualificationRegistryManagement } from "@/features/admin/qualification-registry-management";
import { AcademicCatalogue } from "@/features/admin/academic-catalogue";
import { DeliveryPlanning } from "@/features/admin/delivery-planning";
import { RetakeManagement } from "@/features/admin/retake-management";
import { EvaluatorSpecialismManagement } from "@/features/admin/evaluator-specialism-management";
import { EligibleEvaluatorAssignment } from "@/features/admin/eligible-evaluator-assignment";
import { AssessmentCoordinationQueue } from "@/features/admin/assessment-coordination-queue";
import { SupportCenter } from "@/features/support/support-center";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpenCheck,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LockKeyhole,
  MessageSquareQuote,
  Network,
  RotateCcw,
  Search,
  Trash2,
  UnlockKeyhole,
  UserRoundCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import {
  ActionCard,
  DashboardHeader,
  MetricCard,
} from "@/components/dashboard/dashboard-ui";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type Dashboard = {
  period: string;
  fromUtc: string;
  toUtc: string;
  students: number;
  activeStudents: number;
  teachers: number;
  activeTeachers: number;
  courses: number;
  publishedCourses: number;
  units: number;
  enrollments: number;
  assignments: number;
  pendingReviews: number;
  pendingApprovals: number;
  pendingEvaluations: number;
  evaluationsAwaitingVerification: number;
  completionRate: number;
  orders: number;
  activeSubscriptions: number;
  refunds: number;
  revenue: number;
  trend: {
    dateUtc: string;
    paidOrders: number;
    revenue: number;
    lessonActivity: number;
  }[];
};
type Approval = {
  id: string;
  arabicTitle: string;
  englishTitle: string;
  subjectArabicName?: string;
  subjectEnglishName?: string;
  subjectPendingReview?: boolean;
  status: string;
  price: number;
  isFree: boolean;
  hasCover: boolean;
  moduleCount: number;
  lessonCount: number;
  resourceCount: number;
};
type ApprovalDetail = {
  id: string;
  arabicTitle: string;
  englishTitle: string;
  arabicDescription: string;
  englishDescription: string;
  subjectArabicName?: string;
  subjectEnglishName?: string;
  subjectPendingReview?: boolean;
  status: string;
  price: number;
  isFree: boolean;
  hasCover: boolean;
  outcomes: { arabicText: string; englishText: string }[];
  assignments: {
    arabicTitle: string;
    englishTitle: string;
    arabicInstructions: string;
    englishInstructions: string;
    availableFromUtc?: string;
    dueAtUtc?: string;
    maxSubmissionAttempts: number;
    allowResubmission: boolean;
    maxFileSizeBytes: number;
    allowedFileExtensions: string[];
    maxScore?: number;
    isPublished: boolean;
    criteria: {
      code: string;
      band: string;
      arabicDescription: string;
      englishDescription: string;
    }[];
  }[];
  modules: {
    arabicTitle: string;
    englishTitle: string;
    lessons: {
      arabicTitle: string;
      englishTitle: string;
      arabicBody?: string;
      englishBody?: string;
      type: string;
      durationSeconds: number;
      resources: { id: string; displayName: string; contentType: string }[];
    }[];
  }[];
};

export function AdminArea({ segment }: { segment: string[] }) {
  const current = segment.join("/") || "dashboard";
  if (current === "students") return <StudentManagement />;
  if (current === "teachers") return <TeacherInvites />;
  if (current === "course-approvals") return <CourseApprovals />;
  if (current === "evaluations") return <AdminEvaluations />;
  if (current === "evaluator-specialisms")
    return <EvaluatorSpecialismManagement />;
  if (current === "retakes") return <RetakeManagement />;
  if (current === "wallet" || current === "accounting") return <AdminWallet />;
  if (current === "security") return <AccountSecurity />;
  if (current === "content") return <ContentStudio />;
  if (current === "commerce") return <CommerceCatalogManager />;
  if (current === "audit-logs") return <AuditLogViewer />;
  if (current === "gradebook") return <AdminGradebook />;
  if (current === "ratings") return <PlatformRatingModeration />;
  if (current === "privacy") return <PrivacyRequestManagement />;
  if (current === "security-incidents") return <SecurityIncidentManagement />;
  if (current === "internal-verification")
    return <InternalVerificationPlanManagement />;
  if (current === "evaluation-appeals") return <EvaluationAppealManagement />;
  if (current === "qualification-registry")
    return <QualificationRegistryManagement />;
  if (current === "academic-catalogue") return <AcademicCatalogue />;
  if (current === "delivery-planning") return <DeliveryPlanning />;
  if (current === "support") return <SupportCenter mode="admin" />;
  if (current === "integrations") return <SchoolIntegrations />;
  return <AdminDashboard />;
}

function DateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function AdminDashboard() {
  const locale = useLocale();
  const academicT = useTranslations("academicCatalogue");
  const deliveryT = useTranslations("deliveryPlanning");
  const [period, setPeriod] = useState("30d");
  const [customFrom, setCustomFrom] = useState(() =>
    DateInputValue(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
  );
  const [customTo, setCustomTo] = useState(() => DateInputValue(new Date()));
  const customRangeIsValid =
    Boolean(customFrom) && Boolean(customTo) && customFrom <= customTo;
  const dashboardQuery =
    period === "custom"
      ? `/admin/dashboard?period=custom&fromUtc=${encodeURIComponent(`${customFrom}T00:00:00.000Z`)}&toUtc=${encodeURIComponent(`${customTo}T23:59:59.999Z`)}`
      : `/admin/dashboard?period=${period}`;
  const result = useQuery({
    queryKey: ["admin-dashboard", period, customFrom, customTo],
    queryFn: () => api<Dashboard>(dashboardQuery),
    enabled: period !== "custom" || customRangeIsValid,
  });
  if (result.isPending)
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          …
        </div>
      </section>
    );
  if (result.isError || !result.data)
    return (
      <section className="shell py-10">
        <p className="card p-6">
          {locale === "ar"
            ? "سجّل الدخول كأدمن للوصول إلى لوحة التحكم."
            : "Sign in as an administrator to access this dashboard."}
        </p>
      </section>
    );
  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow="BETCCO Control Center"
        title={locale === "ar" ? "لوحة الأدمن" : "Admin dashboard"}
        description={
          locale === "ar"
            ? "راقب مؤشرات المنصة الحقيقية، واعتمد الدورات، وأسند التقييمات مع بقاء الصلاحيات على الخادم."
            : "Monitor real platform signals, approve courses, and assign evaluations with server-side authorization preserved."
        }
      />
      <div
        className="mt-5 flex flex-wrap gap-2"
        aria-label={locale === "ar" ? "الفترة الزمنية" : "Time period"}
      >
        {[
          ["today", locale === "ar" ? "اليوم" : "Today"],
          ["7d", locale === "ar" ? "7 أيام" : "7 days"],
          ["30d", locale === "ar" ? "30 يومًا" : "30 days"],
          ["3m", locale === "ar" ? "3 أشهر" : "3 months"],
          ["year", locale === "ar" ? "سنة" : "Year"],
          ["custom", locale === "ar" ? "فترة مخصصة" : "Custom range"],
          ["all", locale === "ar" ? "كل الوقت" : "All time"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setPeriod(value)}
            aria-pressed={period === value}
            className={`focus-ring rounded-lg border px-3 py-2 text-xs font-bold ${period === value ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {period === "custom" ? (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface/60 p-4">
          <label className="grid gap-1 text-sm font-bold">
            <span>{locale === "ar" ? "من" : "From"}</span>
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(event) => setCustomFrom(event.target.value)}
              className="focus-ring rounded-xl border border-border bg-transparent px-3 py-2 text-foreground"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            <span>{locale === "ar" ? "إلى" : "To"}</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              max={DateInputValue(new Date())}
              onChange={(event) => setCustomTo(event.target.value)}
              className="focus-ring rounded-xl border border-border bg-transparent px-3 py-2 text-foreground"
            />
          </label>
          {!customRangeIsValid ? (
            <p role="alert" className="pb-2 text-sm text-red-500">
              {locale === "ar"
                ? "اختر نطاقًا زمنيًا صحيحًا."
                : "Choose a valid date range."}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="mt-3 text-xs text-muted">
        {locale === "ar"
          ? "تتأثر الطلبات والإيرادات والنشاط التعليمي بالفترة المختارة، بينما تبقى مؤشرات الحالة الحالية لحظية."
          : "Orders, revenue, and learning activity follow the selected period; current-state metrics remain live."}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <MetricCard
          label={locale === "ar" ? "الطلاب" : "Students"}
          value={result.data.students}
          icon={UsersRound}
        />
        <MetricCard
          label={locale === "ar" ? "طلاب نشطون" : "Active students"}
          value={result.data.activeStudents}
          icon={UserRoundCheck}
          tone="secondary"
        />
        <MetricCard
          label={locale === "ar" ? "المعلمون" : "Teachers"}
          value={result.data.teachers}
          icon={GraduationCap}
          tone="secondary"
        />
        <MetricCard
          label={locale === "ar" ? "معلمون مفعّلون" : "Active teachers"}
          value={result.data.activeTeachers}
          icon={UserRoundCheck}
          tone="accent"
        />
        <MetricCard
          label={locale === "ar" ? "الدورات" : "Courses"}
          value={result.data.courses}
          icon={BookOpenCheck}
        />
        <MetricCard
          label={locale === "ar" ? "الدورات المنشورة" : "Published courses"}
          value={result.data.publishedCourses}
          icon={BookOpenCheck}
          tone="accent"
        />
        <MetricCard
          label={locale === "ar" ? "الوحدات" : "Units"}
          value={result.data.units}
          icon={FileText}
          tone="secondary"
        />
        <MetricCard
          label={locale === "ar" ? "التسجيلات" : "Enrollments"}
          value={result.data.enrollments}
          icon={UserRoundCheck}
          tone="accent"
        />
        <MetricCard
          label={locale === "ar" ? "المهام" : "Assignments"}
          value={result.data.assignments}
          icon={ClipboardCheck}
          tone="warm"
        />
        <MetricCard
          label={locale === "ar" ? "مهام بانتظار التدقيق" : "Pending reviews"}
          value={result.data.pendingReviews}
          icon={ClipboardCheck}
          tone="warm"
        />
        <MetricCard
          label={
            locale === "ar" ? "نسبة إكمال التسجيلات" : "Enrollment completion"
          }
          value={`${result.data.completionRate}%`}
          icon={BadgeCheck}
          tone="secondary"
        />
        <MetricCard
          label={locale === "ar" ? "موافقات معلقة" : "Pending approvals"}
          value={result.data.pendingApprovals}
          icon={BadgeCheck}
          tone="warm"
        />
        <MetricCard
          label={
            locale === "ar"
              ? "نتائج بانتظار الاعتماد"
              : "Results awaiting approval"
          }
          value={result.data.evaluationsAwaitingVerification}
          icon={ClipboardCheck}
          tone="secondary"
        />
        <MetricCard
          label={
            locale === "ar"
              ? "تقييمات تحتاج إسنادًا"
              : "Evaluations awaiting assignment"
          }
          value={result.data.pendingEvaluations}
          icon={ClipboardCheck}
          tone="warm"
        />
        <MetricCard
          label={locale === "ar" ? "الإيراد المؤكد" : "Confirmed revenue"}
          value={`${result.data.revenue.toFixed(3)} JOD`}
          icon={WalletCards}
          tone="secondary"
        />
        <MetricCard
          label={locale === "ar" ? "الطلبات" : "Orders"}
          value={result.data.orders}
          icon={WalletCards}
          tone="accent"
        />
        <MetricCard
          label={locale === "ar" ? "اشتراكات نشطة" : "Active subscriptions"}
          value={result.data.activeSubscriptions}
          icon={UserRoundCheck}
          tone="secondary"
        />
        <MetricCard
          label={locale === "ar" ? "الاستردادات" : "Refunds"}
          value={result.data.refunds}
          icon={RotateCcw}
          tone="warm"
        />
      </div>
      <AdminAnalyticsTrend locale={locale} points={result.data.trend} />
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <AdminLink
          href="students"
          label={locale === "ar" ? "الطلاب" : "Students"}
          text={
            locale === "ar"
              ? "ابحث عن حساب طالب وأعد ضبط جهازه عند الحاجة."
              : "Find a student account and reset its device when needed."
          }
          icon={UsersRound}
        />
        <AdminLink
          href="teachers"
          label={locale === "ar" ? "إدارة المعلمين" : "Manage teachers"}
          text={
            locale === "ar"
              ? "شاهد العدد، وأرسل الدعوات، وجمّد أو فعّل الحسابات."
              : "See the count, send invitations, and freeze or activate accounts."
          }
          icon={UserRoundCheck}
        />
        <AdminLink
          href="course-approvals"
          label={locale === "ar" ? "موافقات الدورات" : "Course approvals"}
          text={
            locale === "ar"
              ? "راجع متطلبات النشر قبل الإتاحة."
              : "Review publishing requirements before availability."
          }
          icon={BadgeCheck}
        />
        <AdminLink
          href="evaluations"
          label={locale === "ar" ? "التقييمات" : "Evaluations"}
          text={
            locale === "ar"
              ? "أسند التقييم ثم راجع النتيجة المحسوبة قبل الاعتماد النهائي."
              : "Assign evaluation work, then review the calculated result before final approval."
          }
          icon={ClipboardCheck}
        />
        <AdminLink
          href="internal-verification"
          label={locale === "ar" ? "عينات التحقق الداخلي" : "IV sampling"}
          text={
            locale === "ar"
              ? "حدد عينات مراجعة مستقلة بمبرر موثق بدل نسبة ثابتة."
              : "Select independent review samples with a documented rationale, not a fixed rate."
          }
          icon={ClipboardCheck}
        />
        <AdminLink
          href="evaluation-appeals"
          label={
            locale === "ar" ? "الاستئنافات الأكاديمية" : "Academic appeals"
          }
          text={
            locale === "ar"
              ? "راجع الاستئنافات بصورة مستقلة وسجل القرار وتعليله."
              : "Review appeals independently and record a reasoned decision."
          }
          icon={FileText}
        />
        <AdminLink
          href="qualification-registry"
          label={locale === "ar" ? "سجل المؤهلات" : "Qualification registry"}
          text={
            locale === "ar"
              ? "وثّق إصدارات المؤهلات واربطها بروبركات التقييم الجديدة."
              : "Register sourced qualification versions and bind them to new assessment rubrics."
          }
          icon={Network}
        />
        <AdminLink
          href="academic-catalogue"
          label={academicT("title")}
          text={academicT("description")}
          icon={BookOpenCheck}
        />
        <AdminLink
          href="delivery-planning"
          label={deliveryT("title")}
          text={deliveryT("description")}
          icon={Network}
        />
        <AdminLink
          href="gradebook"
          label={locale === "ar" ? "دفتر الدرجات" : "Gradebook"}
          text={
            locale === "ar"
              ? "راجع نتائج الواجبات حسب الدورة والوحدة والمعلم والطالب والحالة والنتيجة."
              : "Review coursework results by course, unit, teacher, student, status, and grade."
          }
          icon={BookOpenCheck}
        />
        <AdminLink
          href="ratings"
          label={locale === "ar" ? "تقييمات المنصة" : "Platform reviews"}
          text={
            locale === "ar"
              ? "راجع ملاحظات الطلاب وانشر فقط التقييمات التي وافق أصحابها على عرضها."
              : "Review learner feedback and publish only reviews whose authors opted in."
          }
          icon={MessageSquareQuote}
        />
        <AdminLink
          href="wallet"
          label={locale === "ar" ? "المحفظة والمستحقات" : "Wallet and payouts"}
          text={
            locale === "ar"
              ? "راجع عمولة المنصة 30٪ واعتمد طلبات سحب المعلمين."
              : "Review the platform's 30% commission and approve teacher withdrawals."
          }
          icon={WalletCards}
        />
        <AdminLink
          href="content"
          label={
            locale === "ar" ? "المحتوى والتجارب" : "Content and experiences"
          }
          text={
            locale === "ar"
              ? "أنشئ مقالات وباقات وجلسات مباشرة وملفات عامة للمعلمين."
              : "Create articles, packages, live sessions, and public teacher profiles."
          }
          icon={FileText}
        />
        <AdminLink
          href="commerce"
          label={
            locale === "ar" ? "العضويات والخصومات" : "Memberships and discounts"
          }
          text={
            locale === "ar"
              ? "أدر العضويات واشتراكات الدورات والكوبونات من مكان واحد."
              : "Manage memberships, course subscriptions, and coupons in one place."
          }
          icon={WalletCards}
        />
        <AdminLink
          href="audit-logs"
          label={locale === "ar" ? "سجل التدقيق" : "Audit logs"}
          text={
            locale === "ar"
              ? "ابحث في العمليات الحساسة والجهة التي نفذتها وسياقها."
              : "Search sensitive operations, their actor, and recorded context."
          }
          icon={FileText}
        />
        <AdminLink
          href="privacy"
          label={locale === "ar" ? "طلبات الخصوصية" : "Privacy requests"}
          text={
            locale === "ar"
              ? "راجع طلبات الحقوق والهوية قبل اتخاذ أي إجراء على البيانات."
              : "Review rights requests and identity checks before taking action on data."
          }
          icon={LockKeyhole}
        />
        <AdminLink
          href="integrations"
          label={locale === "ar" ? "تكاملات المدارس" : "School integrations"}
          text={
            locale === "ar"
              ? "تحقق من اتصال OneRoster دون استيراد أي بيانات تلقائيًا."
              : "Check OneRoster connectivity without importing data automatically."
          }
          icon={Network}
        />
      </div>
    </section>
  );
}

function AdminAnalyticsTrend({
  locale,
  points,
}: {
  locale: string;
  points: Dashboard["trend"];
}) {
  const definitions = [
    {
      key: "revenue" as const,
      label: locale === "ar" ? "الإيراد المؤكد" : "Confirmed revenue",
      color: "bg-primary",
      format: (value: number) => `${value.toFixed(3)} JOD`,
    },
    {
      key: "paidOrders" as const,
      label: locale === "ar" ? "الطلبات المدفوعة" : "Paid orders",
      color: "bg-secondary",
      format: (value: number) => String(value),
    },
    {
      key: "lessonActivity" as const,
      label: locale === "ar" ? "نشاط التعلّم" : "Learning activity",
      color: "bg-amber-400",
      format: (value: number) => String(value),
    },
  ];
  return (
    <section className="card mt-5 p-5">
      <div>
        <h2 className="font-black text-foreground">
          {locale === "ar"
            ? "اتجاهات الفترة المحددة"
            : "Selected period trends"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {locale === "ar"
            ? "تعتمد على الطلبات المدفوعة الفعلية وتحديثات تقدّم الدروس في الفترة التي اخترتها."
            : "Based on actual paid orders and lesson-progress updates in the selected period."}
        </p>
      </div>
      {points.length ? (
        <div className="mt-5 grid gap-6 lg:grid-cols-3">
          {definitions.map((definition) => {
            const maximum = Math.max(
              1,
              ...points.map((point) => point[definition.key]),
            );
            const total = points.reduce(
              (sum, point) => sum + point[definition.key],
              0,
            );
            return (
              <article key={definition.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-black text-foreground">
                    {definition.label}
                  </h3>
                  <span className="text-xs font-bold text-muted">
                    {definition.format(total)}
                  </span>
                </div>
                <div
                  className="mt-4 flex h-28 items-end gap-1.5"
                  aria-label={definition.label}
                >
                  {points.map((point) => {
                    const value = point[definition.key];
                    const height =
                      value === 0 ? 3 : Math.max(7, (value / maximum) * 100);
                    const day = new Intl.DateTimeFormat(
                      locale === "ar" ? "ar-JO" : "en",
                      {
                        month: "short",
                        day: "numeric",
                      },
                    ).format(new Date(point.dateUtc));
                    return (
                      <div
                        key={point.dateUtc}
                        className="group relative flex h-full min-w-1 flex-1 items-end"
                        title={`${day}: ${definition.format(value)}`}
                      >
                        <span
                          className={`${definition.color} block w-full rounded-t-sm opacity-85 transition-opacity group-hover:opacity-100`}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-muted">
                  {locale === "ar"
                    ? "مرّر فوق الأعمدة لعرض التفاصيل."
                    : "Hover over bars for details."}
                </p>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted">
          {locale === "ar"
            ? "لا توجد طلبات مدفوعة أو تحديثات تعلم ضمن الفترة المختارة بعد."
            : "There are no paid orders or learning updates in the selected period yet."}
        </p>
      )}
    </section>
  );
}

type SchoolIntegrationStatus = {
  provider: string;
  isConfigured: boolean;
  isReachable: boolean;
  message: string;
};

function SchoolIntegrations() {
  const locale = useLocale();
  const status = useQuery({
    queryKey: ["school-integration-status"],
    queryFn: () =>
      api<SchoolIntegrationStatus>("/admin/integrations/school/status"),
  });
  const test = useMutation({
    mutationFn: () =>
      api<SchoolIntegrationStatus>(
        "/admin/integrations/school/test-connection",
        { method: "POST" },
      ),
  });
  const current = test.data ?? status.data;
  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow="BETCCO Integrations"
        title={locale === "ar" ? "تكاملات المدارس" : "School integrations"}
        description={
          locale === "ar"
            ? "موصل OneRoster اختياري. لا تستورد BETCCO أي قوائم أو بيانات طلاب تلقائيًا."
            : "OneRoster is optional. BETCCO never imports rosters or student data automatically."
        }
      />
      <article className="card mt-6 max-w-3xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black">
              <Network size={20} className="text-primary" aria-hidden="true" />
              {current?.provider ?? "OneRoster"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              {current?.message ??
                (locale === "ar"
                  ? "جارٍ تحميل حالة التكامل…"
                  : "Loading integration status…")}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-black ${current?.isReachable ? "bg-primary/15 text-primary" : "bg-white/5 text-muted"}`}
          >
            {current?.isReachable
              ? locale === "ar"
                ? "متصل"
                : "Connected"
              : current?.isConfigured
                ? locale === "ar"
                  ? "مُعدّ"
                  : "Configured"
                : locale === "ar"
                  ? "غير مفعّل"
                  : "Disabled"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => test.mutate()}
          disabled={!current?.isConfigured || test.isPending}
          className="focus-ring mt-5 rounded-xl bg-primary px-4 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {locale === "ar" ? "اختبار الاتصال" : "Test connection"}
        </button>
        {test.isError ? (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {test.error instanceof Error
              ? test.error.message
              : "Request failed."}
          </p>
        ) : null}
      </article>
    </section>
  );
}

type AdminPayout = {
  id: string;
  teacherUserId: string;
  teacherName: string;
  teacherEmail: string;
  amount: number;
  currency: string;
  method: string;
  destinationMasked: string;
  status: string;
  reviewNote?: string;
  createdAtUtc: string;
  paidAtUtc?: string;
};
type SaleAllocation = {
  id: string;
  paymentId: string;
  courseId: string;
  courseTitle: string;
  teacherName: string;
  grossAmount: number;
  discountAllocated: number;
  netAmount: number;
  platformCommission: number;
  teacherEarning: number;
  currency: string;
  createdAtUtc: string;
};
type AdminWalletView = {
  platformBalance: number;
  confirmedPlatformCommission: number;
  currency: string;
  payouts: AdminPayout[];
  recentSales: SaleAllocation[];
};

function AdminWallet() {
  const locale = useLocale();
  const client = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const wallet = useQuery({
    queryKey: ["admin-wallet"],
    queryFn: () => api<AdminWalletView>("/admin/wallet"),
  });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ["admin-wallet"] });
    client.invalidateQueries({ queryKey: ["admin-dashboard"] });
  };
  const approve = useMutation({
    mutationFn: (payoutId: string) =>
      api(`/admin/wallet/payouts/${payoutId}/approve`, {
        method: "POST",
        body: JSON.stringify({ note: notes[payoutId] || null }),
      }),
    onSuccess: refresh,
  });
  const reject = useMutation({
    mutationFn: (payoutId: string) =>
      api(`/admin/wallet/payouts/${payoutId}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: notes[payoutId] || null }),
      }),
    onSuccess: refresh,
  });
  const pay = useMutation({
    mutationFn: (payoutId: string) =>
      api(`/admin/wallet/payouts/${payoutId}/pay`, { method: "POST" }),
    onSuccess: refresh,
  });
  const values = wallet.data;
  const pendingAction = approve.isPending || reject.isPending || pay.isPending;
  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow="BETCCO Platform Wallet"
        title={locale === "ar" ? "المحفظة والمستحقات" : "Wallet and payouts"}
        description={
          locale === "ar"
            ? "تُحتسب عمولة المنصة 30٪ وحصة المعلم 70٪ على الخادم بعد تأكيد الدفع. بيانات السحب مشفّرة ولا تظهر هنا إلا بصورة مخفية."
            : "The 30% platform commission and 70% teacher share are calculated server-side after verified payment. Withdrawal destinations are encrypted and only masked here."
        }
      />
      <CommissionSettings />
      {wallet.isPending ? (
        <div className="card mt-6 p-6" aria-busy>
          …
        </div>
      ) : wallet.isError || !values ? (
        <p className="card mt-6 p-6" role="alert">
          {locale === "ar"
            ? "تعذّر تحميل المحفظة. تأكد من تسجيل الدخول كأدمن."
            : "Unable to load the wallet. Confirm that you are signed in as an administrator."}
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <MetricCard
              label={locale === "ar" ? "رصيد المنصة" : "Platform balance"}
              value={`${values.platformBalance.toFixed(3)} ${values.currency}`}
              detail={
                locale === "ar"
                  ? "عمولة المنصة وإيراد الدورات غير المسندة"
                  : "Platform commissions and unassigned-course revenue"
              }
              icon={WalletCards}
              tone="secondary"
            />
            <MetricCard
              label={
                locale === "ar"
                  ? "عمولة مؤكدة (30٪)"
                  : "Confirmed commission (30%)"
              }
              value={`${values.confirmedPlatformCommission.toFixed(3)} ${values.currency}`}
              detail={
                locale === "ar" ? "من المبيعات المؤكدة" : "From verified sales"
              }
              icon={BadgeCheck}
              tone="warm"
            />
          </div>
          <section className="card mt-6 p-5">
            <div>
              <h2 className="text-lg font-black">
                {locale === "ar"
                  ? "طلبات سحب المعلمين"
                  : "Teacher withdrawal requests"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {locale === "ar"
                  ? "اعتمد الطلب ثم نفّذ الدفع. في التطوير، التنفيذ محاكاة آمنة ولا يحوّل أي أموال حقيقية."
                  : "Approve a request before executing payment. In development, execution is a safe simulation and never transfers real money."}
              </p>
            </div>
            <div className="mt-4 grid gap-3">
              {values.payouts.map((payout) => (
                <article
                  key={payout.id}
                  className="rounded-xl border border-border bg-white/[0.035] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{payout.teacherName}</p>
                      <p className="text-sm text-muted">
                        {payout.teacherEmail}
                      </p>
                      <p className="mt-2 text-sm">
                        {payout.method === "BankTransfer"
                          ? locale === "ar"
                            ? "تحويل بنكي"
                            : "Bank transfer"
                          : locale === "ar"
                            ? "محفظة إلكترونية"
                            : "E-wallet"}{" "}
                        — {payout.destinationMasked}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="font-black text-amber-300">
                        {payout.amount.toFixed(3)} {payout.currency}
                      </p>
                      <p className="mt-1 text-xs font-bold text-primary">
                        {payout.status}
                      </p>
                    </div>
                  </div>
                  <label className="mt-3 grid gap-1 text-sm font-bold">
                    {locale === "ar" ? "ملاحظة الإدارة" : "Admin note"}
                    <input
                      value={notes[payout.id] ?? payout.reviewNote ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [payout.id]: event.target.value,
                        }))
                      }
                      maxLength={1000}
                      className="rounded-lg border border-border bg-white/5 p-2.5"
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {payout.status === "Requested" && (
                      <>
                        <button
                          type="button"
                          disabled={pendingAction}
                          onClick={() => approve.mutate(payout.id)}
                          className="focus-ring rounded-lg bg-emerald-400 px-3 py-2 text-sm font-black text-slate-950 disabled:opacity-50"
                        >
                          {locale === "ar" ? "اعتماد" : "Approve"}
                        </button>
                        <button
                          type="button"
                          disabled={pendingAction}
                          onClick={() => reject.mutate(payout.id)}
                          className="focus-ring rounded-lg border border-red-400/50 px-3 py-2 text-sm font-black text-red-300 disabled:opacity-50"
                        >
                          {locale === "ar"
                            ? "رفض وإعادة الرصيد"
                            : "Reject and restore balance"}
                        </button>
                      </>
                    )}
                    {payout.status === "Approved" && (
                      <button
                        type="button"
                        disabled={pendingAction}
                        onClick={() => pay.mutate(payout.id)}
                        className="focus-ring rounded-lg bg-primary px-3 py-2 text-sm font-black text-slate-950 disabled:opacity-50"
                      >
                        {locale === "ar" ? "تنفيذ الدفع" : "Execute payout"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!values.payouts.length && (
                <p className="text-sm text-muted">
                  {locale === "ar"
                    ? "لا توجد طلبات سحب بعد."
                    : "No withdrawal requests yet."}
                </p>
              )}
              {(approve.isError || reject.isError || pay.isError) && (
                <p role="alert" className="text-sm text-red-400">
                  {locale === "ar"
                    ? "تعذّر تنفيذ إجراء المحفظة. راجع حالة الطلب ثم حاول مجددًا."
                    : "The wallet action could not be completed. Review the request status and try again."}
                </p>
              )}
            </div>
          </section>
          <section className="card mt-6 p-5">
            <h2 className="text-lg font-black">
              {locale === "ar"
                ? "آخر توزيعات المبيعات"
                : "Recent sales allocations"}
            </h2>
            <div className="mt-4 grid gap-2">
              {values.recentSales.map((sale) => (
                <div
                  key={sale.id}
                  className="grid gap-2 rounded-xl border border-border bg-white/[0.035] p-3 sm:grid-cols-[1.4fr_repeat(3,0.8fr)]"
                >
                  <div>
                    <p className="font-bold">{sale.courseTitle}</p>
                    <p className="text-xs text-muted">{sale.teacherName}</p>
                  </div>
                  <p className="text-sm">
                    {locale === "ar" ? "الصافي" : "Net"}:{" "}
                    {sale.netAmount.toFixed(3)} {sale.currency}
                  </p>
                  <p className="text-sm text-primary">
                    {locale === "ar" ? "المنصة 30٪" : "Platform 30%"}:{" "}
                    {sale.platformCommission.toFixed(3)} {sale.currency}
                  </p>
                  <p className="text-sm text-emerald-300">
                    {locale === "ar" ? "المعلم 70٪" : "Teacher 70%"}:{" "}
                    {sale.teacherEarning.toFixed(3)} {sale.currency}
                  </p>
                </div>
              ))}
              {!values.recentSales.length && (
                <p className="text-sm text-muted">
                  {locale === "ar"
                    ? "لا توجد مبيعات مؤكدة بعد."
                    : "No verified sales yet."}
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </section>
  );
}

type Student = {
  id: string;
  displayName: string;
  email: string;
  emailConfirmed: boolean;
  isFrozen: boolean;
};

type BulkStudentAction = "approve" | "freeze" | "unfreeze" | "delete";

type BulkStudentActionResult = {
  action: BulkStudentAction;
  succeededIds: string[];
  failedIds: string[];
};

function StudentManagement() {
  const locale = useLocale();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [pendingBulkAction, setPendingBulkAction] =
    useState<BulkStudentAction | null>(null);
  const [lastBulkResult, setLastBulkResult] =
    useState<BulkStudentActionResult | null>(null);
  const [resetTarget, setResetTarget] = useState<Student | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [reason, setReason] = useState("");
  const students = useQuery({
    queryKey: ["admin-students", search],
    queryFn: () =>
      api<{ items: Student[] }>(
        `/admin/users?role=Student&pageSize=100&search=${encodeURIComponent(search)}`,
      ),
  });
  const resetDevice = useMutation({
    mutationFn: ({
      userId,
      resetReason,
    }: {
      userId: string;
      resetReason: string;
    }) =>
      api(`/admin/users/${userId}/reset-device`, {
        method: "POST",
        body: JSON.stringify({ reason: resetReason }),
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["admin-students"] });
      setResetTarget(null);
      setReason("");
    },
  });
  const approveStudent = useMutation({
    mutationFn: (userId: string) =>
      api(`/admin/users/${userId}/approve`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-students"] }),
  });
  const freezeStudent = useMutation({
    mutationFn: ({ userId, frozen }: { userId: string; frozen: boolean }) =>
      api(`/admin/users/${userId}/freeze`, {
        method: "POST",
        body: JSON.stringify({ frozen }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-students"] }),
  });
  const bulkStudentAction = useMutation({
    mutationFn: async ({
      action,
      userIds,
    }: {
      action: BulkStudentAction;
      userIds: string[];
    }): Promise<BulkStudentActionResult> => {
      const results = await Promise.all(
        userIds.map(async (userId) => {
          try {
            if (action === "approve") {
              await api(`/admin/users/${userId}/approve`, { method: "POST" });
            } else if (action === "delete") {
              await api(`/admin/users/${userId}`, { method: "DELETE" });
            } else {
              await api(`/admin/users/${userId}/freeze`, {
                method: "POST",
                body: JSON.stringify({ frozen: action === "freeze" }),
              });
            }
            return { userId, succeeded: true };
          } catch {
            return { userId, succeeded: false };
          }
        }),
      );

      return {
        action,
        succeededIds: results
          .filter((result) => result.succeeded)
          .map((result) => result.userId),
        failedIds: results
          .filter((result) => !result.succeeded)
          .map((result) => result.userId),
      };
    },
    onSuccess: (result) => {
      client.invalidateQueries({ queryKey: ["admin-students"] });
      if (result.action === "delete") {
        client.invalidateQueries({ queryKey: ["admin-dashboard"] });
      }
      setSelectedStudentIds(result.failedIds);
      setLastBulkResult(result);
      setPendingBulkAction(null);
    },
  });
  const deleteStudent = useMutation({
    mutationFn: (userId: string) =>
      api(`/admin/users/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["admin-students"] });
      client.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setDeleteTarget(null);
    },
  });
  const closeReset = () => {
    if (resetDevice.isPending) return;
    setResetTarget(null);
    setReason("");
  };
  const visibleStudentIds =
    students.data?.items.map((student) => student.id) ?? [];
  const selectedVisibleStudentIds = selectedStudentIds.filter((id) =>
    visibleStudentIds.includes(id),
  );
  const allVisibleStudentsSelected =
    visibleStudentIds.length > 0 &&
    selectedVisibleStudentIds.length === visibleStudentIds.length;
  const bulkActionLabel = (action: BulkStudentAction) => {
    if (locale === "ar") {
      return action === "approve"
        ? "تأكيد الحسابات المحددة"
        : action === "freeze"
          ? "تجميد الحسابات المحددة"
          : action === "unfreeze"
            ? "إلغاء تجميد الحسابات المحددة"
            : "حذف الحسابات المحددة";
    }

    return action === "approve"
      ? "Approve selected accounts"
      : action === "freeze"
        ? "Freeze selected accounts"
        : action === "unfreeze"
          ? "Unfreeze selected accounts"
          : "Delete selected accounts";
  };
  const toggleStudentSelection = (studentId: string) => {
    setLastBulkResult(null);
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  };
  const toggleAllVisibleStudents = () => {
    setLastBulkResult(null);
    setSelectedStudentIds(allVisibleStudentsSelected ? [] : visibleStudentIds);
  };

  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow="BETCCO Control Center"
        title={locale === "ar" ? "إدارة الطلاب" : "Student management"}
        description={
          locale === "ar"
            ? "ابحث عن الطالب، ثم أعد ضبط ربط الجهاز عند الحاجة مع تسجيل سبب الإجراء."
            : "Find a student and reset a device binding when needed, with a recorded reason."
        }
      />
      <label className="mt-6 flex max-w-xl items-center gap-2 rounded-xl border border-border bg-white/5 px-3 py-2.5">
        <Search size={18} className="text-muted" aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setSelectedStudentIds([]);
            setLastBulkResult(null);
          }}
          placeholder={
            locale === "ar"
              ? "ابحث بالاسم أو البريد الإلكتروني"
              : "Search by name or email"
          }
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none"
          aria-label={locale === "ar" ? "بحث عن طالب" : "Search students"}
        />
      </label>
      {students.isPending ? (
        <div className="card mt-5 p-6" aria-busy>
          …
        </div>
      ) : students.isError ? (
        <p className="card mt-5 p-6 text-sm text-red-500" role="alert">
          {locale === "ar"
            ? "تعذر تحميل قائمة الطلاب."
            : "Unable to load students."}
        </p>
      ) : (
        <div className="mt-5 grid gap-3">
          {!!students.data?.items.length && (
            <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-bold text-foreground">
                <input
                  type="checkbox"
                  checked={allVisibleStudentsSelected}
                  onChange={toggleAllVisibleStudents}
                  className="h-5 w-5 rounded border-border accent-primary"
                  aria-label={
                    locale === "ar"
                      ? "تحديد جميع الطلاب الظاهرين"
                      : "Select all visible students"
                  }
                />
                {locale === "ar"
                  ? "تحديد جميع الطلاب الظاهرين"
                  : "Select all visible students"}
              </label>
              <p className="text-xs text-muted">
                {locale === "ar"
                  ? `التحديد يقتصر على ${visibleStudentIds.length} حسابًا ظاهرًا في هذه الصفحة.`
                  : `Selection is limited to the ${visibleStudentIds.length} accounts currently shown.`}
              </p>
            </div>
          )}
          {selectedVisibleStudentIds.length > 0 && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/35 bg-primary/10 p-4"
              role="status"
            >
              <p className="font-black text-foreground">
                {locale === "ar"
                  ? `تم تحديد ${selectedVisibleStudentIds.length} حساب${selectedVisibleStudentIds.length === 1 ? "" : "ات"}.`
                  : `${selectedVisibleStudentIds.length} account${selectedVisibleStudentIds.length === 1 ? "" : "s"} selected.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPendingBulkAction("approve")}
                  className="focus-ring inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 px-3 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-400/10"
                >
                  <BadgeCheck size={16} aria-hidden="true" />
                  {locale === "ar" ? "تأكيد المحددين" : "Approve selected"}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingBulkAction("freeze")}
                  className="focus-ring inline-flex items-center gap-2 rounded-xl border border-red-400/40 px-3 py-2 text-sm font-bold text-red-300 hover:bg-red-400/10"
                >
                  <LockKeyhole size={16} aria-hidden="true" />
                  {locale === "ar" ? "تجميد المحددين" : "Freeze selected"}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingBulkAction("unfreeze")}
                  className="focus-ring inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 px-3 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-400/10"
                >
                  <UnlockKeyhole size={16} aria-hidden="true" />
                  {locale === "ar"
                    ? "إلغاء تجميد المحددين"
                    : "Unfreeze selected"}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingBulkAction("delete")}
                  className="focus-ring inline-flex items-center gap-2 rounded-xl border border-red-500/50 px-3 py-2 text-sm font-bold text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 size={16} aria-hidden="true" />
                  {locale === "ar" ? "حذف المحددين" : "Delete selected"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStudentIds([])}
                  className="focus-ring rounded-xl border border-border px-3 py-2 text-sm font-bold text-muted hover:text-foreground"
                >
                  {locale === "ar" ? "إلغاء التحديد" : "Clear selection"}
                </button>
              </div>
            </div>
          )}
          {students.data?.items.map((student) => (
            <article
              key={student.id}
              className="card flex flex-wrap items-center justify-between gap-4 p-5"
            >
              <div className="flex min-w-0 items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedStudentIds.includes(student.id)}
                  onChange={() => toggleStudentSelection(student.id)}
                  className="mt-1 h-5 w-5 shrink-0 rounded border-border accent-primary"
                  aria-label={
                    locale === "ar"
                      ? `تحديد حساب ${student.displayName}`
                      : `Select ${student.displayName}`
                  }
                />
                <div className="min-w-0">
                  <p className="truncate font-black text-foreground">
                    {student.displayName}
                  </p>
                  <p className="mt-1 truncate text-sm text-muted">
                    {student.email}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {student.emailConfirmed
                      ? locale === "ar"
                        ? "البريد مؤكّد"
                        : "Email verified"
                      : locale === "ar"
                        ? "البريد غير مؤكّد"
                        : "Email unverified"}
                    {student.isFrozen &&
                      ` · ${locale === "ar" ? "الحساب مجمّد" : "Account frozen"}`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {student.emailConfirmed ? (
                  <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 px-4 py-2.5 text-sm font-bold text-emerald-300">
                    <BadgeCheck size={16} aria-hidden="true" />
                    {locale === "ar" ? "الحساب مؤكّد" : "Account approved"}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={approveStudent.isPending}
                    onClick={() => approveStudent.mutate(student.id)}
                    className="focus-ring inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 px-4 py-2.5 text-sm font-bold text-emerald-300 hover:bg-emerald-400/10 disabled:cursor-wait disabled:opacity-50"
                  >
                    <BadgeCheck size={16} aria-hidden="true" />
                    {locale === "ar" ? "تأكيد الحساب" : "Approve account"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={freezeStudent.isPending}
                  onClick={() =>
                    freezeStudent.mutate({
                      userId: student.id,
                      frozen: !student.isFrozen,
                    })
                  }
                  className={`focus-ring inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold disabled:cursor-wait disabled:opacity-50 ${student.isFrozen ? "border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10" : "border-red-400/40 text-red-300 hover:bg-red-400/10"}`}
                >
                  {student.isFrozen ? (
                    <UnlockKeyhole size={16} aria-hidden="true" />
                  ) : (
                    <LockKeyhole size={16} aria-hidden="true" />
                  )}
                  {student.isFrozen
                    ? locale === "ar"
                      ? "إلغاء التجميد"
                      : "Unfreeze"
                    : locale === "ar"
                      ? "تجميد الحساب"
                      : "Freeze account"}
                </button>
                <button
                  type="button"
                  disabled={student.isFrozen || resetDevice.isPending}
                  onClick={() => {
                    setResetTarget(student);
                    setReason("");
                  }}
                  className="focus-ring inline-flex items-center gap-2 rounded-xl border border-amber-400/40 px-4 py-2.5 text-sm font-bold text-amber-300 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  {locale === "ar" ? "إعادة ضبط الجهاز" : "Reset device"}
                </button>
                <button
                  type="button"
                  disabled={deleteStudent.isPending}
                  onClick={() => setDeleteTarget(student)}
                  className="focus-ring inline-flex items-center gap-2 rounded-xl border border-red-500/50 px-4 py-2.5 text-sm font-bold text-red-300 hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-50"
                >
                  <Trash2 size={16} aria-hidden="true" />
                  {locale === "ar" ? "حذف الحساب" : "Delete account"}
                </button>
              </div>
            </article>
          ))}
          {!students.data?.items.length && (
            <p className="card p-6 text-sm text-muted">
              {locale === "ar"
                ? "لا يوجد طلاب مطابقون للبحث."
                : "No matching students found."}
            </p>
          )}
        </div>
      )}

      {(approveStudent.isError ||
        freezeStudent.isError ||
        deleteStudent.isError ||
        bulkStudentAction.isError) && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {locale === "ar"
            ? "تعذر تنفيذ الإجراء على حساب الطالب."
            : "Unable to update the student account."}
        </p>
      )}
      {lastBulkResult && (
        <p
          role={lastBulkResult.failedIds.length ? "alert" : "status"}
          className={`mt-4 text-sm ${lastBulkResult.failedIds.length ? "text-amber-300" : "text-emerald-300"}`}
        >
          {locale === "ar"
            ? `${bulkActionLabel(lastBulkResult.action)}: نجح ${lastBulkResult.succeededIds.length} حساب${lastBulkResult.failedIds.length ? `، وتعذر تنفيذ الإجراء على ${lastBulkResult.failedIds.length} حساب.` : "."}`
            : `${bulkActionLabel(lastBulkResult.action)}: ${lastBulkResult.succeededIds.length} account${lastBulkResult.succeededIds.length === 1 ? "" : "s"} updated${lastBulkResult.failedIds.length ? `; ${lastBulkResult.failedIds.length} could not be updated.` : "."}`}
        </p>
      )}

      {pendingBulkAction && selectedVisibleStudentIds.length > 0 && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={bulkActionLabel(pendingBulkAction)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              bulkStudentAction.mutate({
                action: pendingBulkAction,
                userIds: selectedVisibleStudentIds,
              });
            }}
            className="glass-panel w-full max-w-lg p-6 shadow-2xl"
          >
            <h2
              className={`text-xl font-black ${pendingBulkAction === "delete" ? "text-red-300" : ""}`}
            >
              {bulkActionLabel(pendingBulkAction)}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              {locale === "ar"
                ? pendingBulkAction === "delete"
                  ? `سيُحذف ${selectedVisibleStudentIds.length} حساب${selectedVisibleStudentIds.length === 1 ? "" : "ات"} محدد نهائيًا ولن يستطيع أصحابها تسجيل الدخول. لا يمكن التراجع عن الحذف، بينما تبقى سجلات الدفع والتدقيق اللازمة للمراجعة محفوظة.`
                  : `سيُنفَّذ هذا الإجراء على ${selectedVisibleStudentIds.length} حساب${selectedVisibleStudentIds.length === 1 ? "" : "ات"} محدد فقط. يسجل النظام كل تغيير في سجل التدقيق، ولا يشمل الحذف أو إعادة ضبط الأجهزة.`
                : pendingBulkAction === "delete"
                  ? `${selectedVisibleStudentIds.length} selected account${selectedVisibleStudentIds.length === 1 ? " will" : "s will"} be permanently deleted and unable to sign in. This cannot be undone; required payment and audit records remain available for review.`
                  : `This action will affect only the ${selectedVisibleStudentIds.length} selected account${selectedVisibleStudentIds.length === 1 ? "" : "s"}. Each change is recorded in the audit log; deletion and device resets are excluded.`}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={bulkStudentAction.isPending}
                onClick={() => setPendingBulkAction(null)}
                className="focus-ring rounded-xl border border-border px-4 py-2.5 text-sm font-bold"
              >
                {locale === "ar" ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                disabled={bulkStudentAction.isPending}
                className={`focus-ring rounded-xl px-4 py-2.5 text-sm font-black disabled:cursor-wait disabled:opacity-60 ${pendingBulkAction === "delete" ? "bg-red-500 text-white" : "bg-primary text-slate-950"}`}
              >
                {bulkStudentAction.isPending
                  ? "…"
                  : locale === "ar"
                    ? "تأكيد الإجراء"
                    : "Confirm action"}
              </button>
            </div>
          </form>
        </div>
      )}

      {resetTarget && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              resetDevice.mutate({
                userId: resetTarget.id,
                resetReason: reason,
              });
            }}
            className="glass-panel w-full max-w-lg p-6 shadow-2xl"
            aria-label={
              locale === "ar" ? "إعادة ضبط جهاز الطالب" : "Reset student device"
            }
          >
            <h2 className="text-xl font-black">
              {locale === "ar"
                ? "إعادة ضبط جهاز الطالب"
                : "Reset student device"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {locale === "ar"
                ? `سيُسمح لـ ${resetTarget.displayName} بتسجيل الدخول من جهاز جديد. اكتب سبب الإجراء ليُحفظ في سجل التدقيق.`
                : `${resetTarget.displayName} will be able to sign in from a new device. Record a reason for the audit log.`}
            </p>
            <label className="mt-5 grid gap-2 text-sm font-bold">
              {locale === "ar" ? "سبب إعادة الضبط" : "Reset reason"}
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="min-h-24 rounded-xl border border-border bg-white/5 p-3 text-sm font-normal outline-none focus:border-primary"
                required
              />
            </label>
            {resetDevice.isError && (
              <p role="alert" className="mt-3 text-sm text-red-400">
                {resetDevice.error instanceof Error
                  ? resetDevice.error.message
                  : locale === "ar"
                    ? "تعذر إعادة ضبط الجهاز."
                    : "Unable to reset the device."}
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeReset}
                disabled={resetDevice.isPending}
                className="focus-ring rounded-xl border border-border px-4 py-2.5 text-sm font-bold"
              >
                {locale === "ar" ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                disabled={!reason.trim() || resetDevice.isPending}
                className="focus-ring inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw size={16} aria-hidden="true" />
                {resetDevice.isPending
                  ? "…"
                  : locale === "ar"
                    ? "تأكيد إعادة الضبط"
                    : "Confirm reset"}
              </button>
            </div>
          </form>
        </div>
      )}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={
            locale === "ar" ? "حذف حساب طالب" : "Delete student account"
          }
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              deleteStudent.mutate(deleteTarget.id);
            }}
            className="glass-panel w-full max-w-lg p-6 shadow-2xl"
          >
            <h2 className="text-xl font-black text-red-300">
              {locale === "ar" ? "حذف حساب الطالب" : "Delete student account"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              {locale === "ar"
                ? `سيُحذف حساب ${deleteTarget.displayName} نهائيًا ولن يتمكن من تسجيل الدخول. تبقى سجلات الدفع والتدقيق اللازمة للمراجعة محفوظة.`
                : `${deleteTarget.displayName}'s account will be permanently deleted and they will no longer be able to sign in. Required payment and audit records remain for review.`}
            </p>
            {deleteStudent.isError && (
              <p role="alert" className="mt-3 text-sm text-red-300">
                {deleteStudent.error instanceof Error
                  ? deleteStudent.error.message
                  : locale === "ar"
                    ? "تعذر حذف الحساب."
                    : "Unable to delete the account."}
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={deleteStudent.isPending}
                onClick={() => setDeleteTarget(null)}
                className="focus-ring rounded-xl border border-border px-4 py-2.5 text-sm font-bold"
              >
                {locale === "ar" ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                disabled={deleteStudent.isPending}
                className="focus-ring inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60"
              >
                <Trash2 size={16} aria-hidden="true" />
                {deleteStudent.isPending
                  ? "…"
                  : locale === "ar"
                    ? "حذف نهائي"
                    : "Delete permanently"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function AdminLink({
  href,
  label,
  text,
  icon,
}: {
  href: string;
  label: string;
  text: string;
  icon: typeof ClipboardCheck;
}) {
  const locale = useLocale();
  return (
    <Link
      className="focus-ring block rounded-[1.25rem]"
      href={`/${locale}/admin/${href}`}
    >
      <ActionCard title={label} description={text} icon={icon}>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-black text-primary">
          {locale === "ar" ? "فتح" : "Open"}
          <ArrowLeft size={16} className="rtl:rotate-180" aria-hidden="true" />
        </span>
      </ActionCard>
    </Link>
  );
}

type PendingEvaluation = {
  id: string;
  status: string;
  studentComment?: string;
  filesCount: number;
  criteria: string[];
};
type UnderReviewEvaluation = {
  id: string;
  studentComment?: string;
  filesCount: number;
  calculatedGrade: string | null;
  sectionResults: { section: string; grade: string }[];
  results: {
    criterionCode: string;
    achievement: string;
    evidence?: string;
    comment?: string;
  }[];
  evidence: { criterionCode: string; narrative: string }[];
};
type Teacher = {
  id: string;
  displayName: string;
  email: string;
  isFrozen: boolean;
};
type TeacherInvitation = {
  id: string;
  displayName: string;
  email: string;
  status: "Issued" | "Accepted" | "Expired" | "Revoked";
  createdAtUtc: string;
  expiresAtUtc: string;
  acceptedAtUtc?: string;
  revokedAtUtc?: string;
  canRevoke: boolean;
};

function AdminEvaluations() {
  const locale = useLocale();
  const client = useQueryClient();
  const [lastAssigned, setLastAssigned] = useState(false);
  const currentUser = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api<{ roles: string[] }>("/auth/me"),
    retry: false,
  });
  const canVerify =
    currentUser.data?.roles.some((role) =>
      ["Admin", "InternalVerifier", "LeadInternalVerifier"].includes(role),
    ) ?? false;
  const pending = useQuery({
    queryKey: ["pending-evaluations"],
    queryFn: () => api<PendingEvaluation[]>("/evaluations/pending-assignment"),
  });
  const underReview = useQuery({
    queryKey: ["under-review-evaluations"],
    queryFn: () => api<UnderReviewEvaluation[]>("/evaluations/under-review"),
    refetchInterval: 10_000,
    enabled: canVerify,
  });
  const [verificationNotes, setVerificationNotes] = useState<
    Record<string, string>
  >({});
  const [resubmissionDueDates, setResubmissionDueDates] = useState<
    Record<string, string>
  >({});
  const verify = useMutation({
    mutationFn: ({
      requestId,
      approve,
    }: {
      requestId: string;
      approve: boolean;
    }) =>
      api(`/evaluations/${requestId}/internal-verification`, {
        method: "POST",
        body: JSON.stringify({
          approve,
          comment: verificationNotes[requestId] || null,
          resubmissionDueAtUtc: approve
            ? null
            : resubmissionDueDates[requestId]
              ? new Date(resubmissionDueDates[requestId]).toISOString()
              : null,
        }),
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["under-review-evaluations"] });
      client.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
  });
  if (
    currentUser.isPending ||
    pending.isPending ||
    (canVerify && underReview.isPending)
  )
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          …
        </div>
      </section>
    );
  if (
    currentUser.isError ||
    pending.isError ||
    (canVerify && underReview.isError)
  )
    return (
      <section className="shell py-10">
        <p className="card p-6" role="alert">
          {locale === "ar"
            ? "تعذر تحميل طلبات التقييم."
            : "Unable to load evaluation requests."}
        </p>
      </section>
    );
  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow="BETCCO Evaluation"
        title={locale === "ar" ? "إسناد التقييمات" : "Assign evaluations"}
        description={
          locale === "ar"
            ? "اختر مقيّمًا مؤهلاً لوحدة الطلب. يتحقق الخادم من الأهلية عند الإسناد."
            : "Choose an evaluator eligible for the request's Unit. The server rechecks eligibility on assignment."
        }
      />
      <AssessmentCoordinationQueue />
      {lastAssigned && (
        <p className="mt-4 text-sm text-green-700" role="status">
          {locale === "ar" ? "تم إسناد التقييم." : "Evaluation assigned."}
        </p>
      )}
      <div className="mt-5 grid gap-4">
        {pending.data?.map((evaluation) => (
          <EligibleEvaluatorAssignment
            key={evaluation.id}
            evaluation={evaluation}
            onAssigned={() => {
              setLastAssigned(true);
              client.invalidateQueries({ queryKey: ["pending-evaluations"] });
              client.invalidateQueries({
                queryKey: ["assessment-coordination"],
              });
              client.invalidateQueries({ queryKey: ["admin-dashboard"] });
            }}
          />
        ))}
        {!pending.data?.length && (
          <div className="card p-6 text-sm leading-6 text-muted">
            {locale === "ar"
              ? "لا توجد تقييمات مدفوعة بانتظار الإسناد."
              : "No paid evaluations are waiting for assignment."}
          </div>
        )}
      </div>
      <section className="mt-10" hidden={!canVerify}>
        <div className="mb-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
            {locale === "ar" ? "المراجعة الداخلية" : "Internal verification"}
          </p>
          <h2 className="mt-1 text-2xl font-black">
            {locale === "ar"
              ? "نتائج بانتظار الاعتماد"
              : "Results awaiting approval"}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {locale === "ar"
              ? "راجع حكم المعلم والأدلة قبل الاعتماد أو طلب إعادة التسليم مع ملاحظات واضحة."
              : "Review the assessor decision and evidence before approval, or request a resubmission with clear feedback."}
          </p>
        </div>
        <div className="grid gap-4">
          {underReview.data?.map((evaluation) => (
            <article key={evaluation.id} className="card p-5">
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-primary">
                      {locale === "ar"
                        ? "النتيجة المحسوبة"
                        : "Calculated result"}
                    </p>
                    <p className="mt-1 text-xl font-black text-foreground">
                      {evaluation.calculatedGrade ?? "—"}
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {evaluation.sectionResults.map((section) => (
                        <p
                          key={section.section}
                          className="rounded-lg border border-border/70 bg-surface-solid/70 px-3 py-2 text-xs text-muted"
                        >
                          <strong className="text-foreground">
                            {locale === "ar"
                              ? `القسم ${section.section}`
                              : `Section ${section.section}`}
                            :{" "}
                          </strong>
                          {section.grade}
                        </p>
                      ))}
                    </div>
                  </div>
                  <h3 className="font-black">
                    {locale === "ar" ? "نتائج المعايير" : "Criterion outcomes"}
                  </h3>
                  <ul className="mt-3 grid gap-2 text-sm">
                    {evaluation.results.map((result) => (
                      <li
                        key={result.criterionCode}
                        className="rounded-lg border border-border/70 p-3"
                      >
                        <strong>{result.criterionCode}: </strong>
                        {result.achievement}
                        {result.comment ? (
                          <p className="mt-1 text-muted">{result.comment}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="font-black">
                    {locale === "ar" ? "أدلة الطالب" : "Student evidence"}
                  </h3>
                  <ul className="mt-3 grid gap-2 text-sm text-muted">
                    {evaluation.evidence.map((evidence) => (
                      <li key={evidence.criterionCode}>
                        <strong className="text-foreground">
                          {evidence.criterionCode}:{" "}
                        </strong>
                        {evidence.narrative}
                      </li>
                    ))}
                    {!evaluation.evidence.length ? (
                      <li>
                        {locale === "ar"
                          ? "لم يضف الطالب أدلة نصية."
                          : "The student did not add written evidence."}
                      </li>
                    ) : null}
                  </ul>
                </div>
              </div>
              <textarea
                value={verificationNotes[evaluation.id] ?? ""}
                onChange={(event) =>
                  setVerificationNotes((current) => ({
                    ...current,
                    [evaluation.id]: event.target.value,
                  }))
                }
                maxLength={4000}
                className="mt-5 min-h-24 w-full rounded-xl border border-border bg-transparent p-3 text-sm"
                placeholder={
                  locale === "ar"
                    ? "ملاحظة داخلية أو تعليمات لإعادة التسليم (مطلوبة عند طلب إعادة التسليم)"
                    : "Internal note or resubmission instructions (required for resubmission)"
                }
              />
              <label className="mt-3 grid gap-1 text-sm font-semibold">
                {locale === "ar"
                  ? "آخر موعد مصرح لإعادة التسليم"
                  : "Authorised resubmission deadline"}
                <input
                  type="datetime-local"
                  value={resubmissionDueDates[evaluation.id] ?? ""}
                  onChange={(event) =>
                    setResubmissionDueDates((current) => ({
                      ...current,
                      [evaluation.id]: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-border bg-transparent p-3 text-sm"
                />
                <span className="text-xs font-normal text-muted">
                  {locale === "ar"
                    ? "يُستخدم فقط عند طلب إعادة التسليم؛ يظل خاضعًا للحدود المحددة في نسخة قواعد التقييم."
                    : "Used only when requesting resubmission and remains subject to the assessment rule-set limits."}
                </span>
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    verify.mutate({ requestId: evaluation.id, approve: true })
                  }
                  disabled={verify.isPending}
                  className="focus-ring rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950"
                >
                  {locale === "ar" ? "اعتماد النتيجة" : "Approve result"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    verify.mutate({
                      requestId: evaluation.id,
                      approve: false,
                    })
                  }
                  disabled={
                    verify.isPending ||
                    !(verificationNotes[evaluation.id] ?? "").trim() ||
                    !resubmissionDueDates[evaluation.id]
                  }
                  className="focus-ring rounded-xl border border-amber-400/50 px-4 py-2.5 text-sm font-black text-amber-300 disabled:opacity-50"
                >
                  {locale === "ar" ? "طلب إعادة تسليم" : "Request resubmission"}
                </button>
              </div>
            </article>
          ))}
          {!underReview.data?.length ? (
            <p className="card p-5 text-sm text-muted">
              {locale === "ar"
                ? "لا توجد نتائج بانتظار المراجعة الداخلية."
                : "There are no results awaiting internal verification."}
            </p>
          ) : null}
        </div>
      </section>
      {verify.isError && (
        <p role="alert" className="mt-4 text-sm text-red-500">
          {verify.error instanceof Error
            ? verify.error.message
            : "Unable to verify this result."}
        </p>
      )}
    </section>
  );
}
function TeacherInvites() {
  const locale = useLocale();
  const client = useQueryClient();
  const [displayName, setName] = useState("");
  const [email, setEmail] = useState("");
  const [revocationReasons, setRevocationReasons] = useState<
    Record<string, string>
  >({});
  const teachers = useQuery({
    queryKey: ["admin-teachers"],
    queryFn: () =>
      api<{ items: Teacher[]; totalCount: number }>(
        "/admin/users?role=Teacher&pageSize=100",
      ),
  });
  const invitations = useQuery({
    queryKey: ["teacher-invitations"],
    queryFn: () =>
      api<{ items: TeacherInvitation[]; totalCount: number }>(
        "/admin/users/teachers/invitations?pageSize=100",
      ),
  });
  const refreshTeachers = () => {
    client.invalidateQueries({ queryKey: ["admin-dashboard"] });
    client.invalidateQueries({ queryKey: ["admin-teachers"] });
    client.invalidateQueries({ queryKey: ["teachers-for-evaluation"] });
    client.invalidateQueries({ queryKey: ["teacher-invitations"] });
  };
  const invite = useMutation({
    mutationFn: () =>
      api("/admin/users/teachers/invite", {
        method: "POST",
        body: JSON.stringify({ displayName, email }),
      }),
    onSuccess: () => {
      setName("");
      setEmail("");
      refreshTeachers();
    },
  });
  const freezeTeacher = useMutation({
    mutationFn: ({ userId, frozen }: { userId: string; frozen: boolean }) =>
      api(`/admin/users/${userId}/freeze`, {
        method: "POST",
        body: JSON.stringify({ frozen }),
      }),
    onSuccess: refreshTeachers,
  });
  const revokeInvitation = useMutation({
    mutationFn: ({
      invitationId,
      reason,
    }: {
      invitationId: string;
      reason: string;
    }) =>
      api(`/admin/users/teachers/invitations/${invitationId}/revoke`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: (_, { invitationId }) => {
      setRevocationReasons((current) => {
        const remaining = { ...current };
        delete remaining[invitationId];
        return remaining;
      });
      refreshTeachers();
    },
  });
  const teacherItems = teachers.data?.items ?? [];
  const invitationItems = invitations.data?.items ?? [];
  const activeCount = teacherItems.filter(
    (teacher) => !teacher.isFrozen,
  ).length;
  const formatInvitationDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  const invitationStatus = (status: TeacherInvitation["status"]) => {
    if (locale === "ar") {
      return {
        Issued: "صادرة",
        Accepted: "مقبولة",
        Expired: "منتهية",
        Revoked: "ملغاة",
      }[status];
    }
    return status;
  };

  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow="BETCCO Control Center"
        title={locale === "ar" ? "إدارة المعلمين" : "Teacher management"}
        description={
          locale === "ar"
            ? "شاهد عدد المعلمين، أرسل الدعوات، وجمّد أو فعّل حساب المعلم عند الحاجة."
            : "See your teacher count, send invitations, and freeze or reactivate a teacher account when needed."
        }
      />
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(19rem,0.8fr)_minmax(0,1.2fr)]">
        <div className="grid content-start gap-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              invite.mutate();
            }}
            className="card grid gap-4 p-6"
          >
            <h2 className="text-xl font-black">
              {locale === "ar" ? "دعوة معلم جديد" : "Invite a new teacher"}
            </h2>
            <p className="text-sm text-muted">
              {locale === "ar"
                ? "لا يوجد تسجيل ذاتي للمعلم. ترسل الدعوة رابط تعيين كلمة مرور آمن."
                : "Teachers cannot self-register. The invitation sends a secure password-setting link."}
            </p>
            <input
              value={displayName}
              onChange={(event) => setName(event.target.value)}
              placeholder={locale === "ar" ? "اسم المعلم" : "Teacher name"}
              className="rounded-lg border bg-transparent p-3"
              required
            />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              className="rounded-lg border bg-transparent p-3"
              required
            />
            <button
              disabled={invite.isPending}
              className="focus-ring rounded-xl bg-primary px-4 py-3 font-bold text-white disabled:cursor-wait disabled:opacity-60"
            >
              {invite.isPending
                ? "…"
                : locale === "ar"
                  ? "إرسال الدعوة"
                  : "Send invitation"}
            </button>
            {invite.isSuccess && (
              <p role="status" className="text-emerald-300">
                {locale === "ar" ? "أرسلت الدعوة." : "Invitation sent."}
              </p>
            )}
            {invite.isError && (
              <p role="alert" className="text-red-400">
                {invite.error instanceof Error
                  ? invite.error.message
                  : "Request failed."}
              </p>
            )}
          </form>
          <aside className="card grid content-start gap-4 p-6">
            <p className="text-sm font-bold text-muted">
              {locale === "ar" ? "إجمالي المعلمين" : "Total teachers"}
            </p>
            <p className="text-5xl font-black text-primary">
              {teachers.isPending ? "—" : (teachers.data?.totalCount ?? 0)}
            </p>
            <div className="border-t border-border pt-4">
              <p className="text-sm font-bold text-muted">
                {locale === "ar" ? "معلمون نشطون" : "Active teachers"}
              </p>
              <p className="mt-1 text-2xl font-black">{activeCount}</p>
            </div>
          </aside>
        </div>
        <section className="card min-w-0 p-5">
          <h2 className="text-xl font-black">
            {locale === "ar" ? "حسابات المعلمين" : "Teacher accounts"}
          </h2>
          {teachers.isPending ? (
            <div className="card mt-4 p-6" aria-busy>
              …
            </div>
          ) : teachers.isError ? (
            <p role="alert" className="card mt-4 p-6 text-sm text-red-400">
              {locale === "ar"
                ? "تعذر تحميل قائمة المعلمين."
                : "Unable to load teachers."}
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              {teacherItems.map((teacher) => (
                <article
                  key={teacher.id}
                  className="card flex flex-wrap items-center justify-between gap-4 p-5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-black">{teacher.displayName}</p>
                    <p className="mt-1 truncate text-sm text-muted">
                      {teacher.email}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {teacher.isFrozen
                        ? locale === "ar"
                          ? "الحساب مجمّد"
                          : "Account frozen"
                        : locale === "ar"
                          ? "الحساب نشط"
                          : "Account active"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={freezeTeacher.isPending}
                    onClick={() =>
                      freezeTeacher.mutate({
                        userId: teacher.id,
                        frozen: !teacher.isFrozen,
                      })
                    }
                    className={`focus-ring inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold disabled:cursor-wait disabled:opacity-50 ${teacher.isFrozen ? "border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10" : "border-red-400/40 text-red-300 hover:bg-red-400/10"}`}
                  >
                    {teacher.isFrozen ? (
                      <UnlockKeyhole size={16} aria-hidden="true" />
                    ) : (
                      <LockKeyhole size={16} aria-hidden="true" />
                    )}
                    {teacher.isFrozen
                      ? locale === "ar"
                        ? "تفعيل الحساب"
                        : "Activate account"
                      : locale === "ar"
                        ? "تجميد الحساب"
                        : "Freeze account"}
                  </button>
                </article>
              ))}
              {!teacherItems.length && (
                <p className="card p-6 text-sm text-muted">
                  {locale === "ar" ? "لا يوجد معلمون بعد." : "No teachers yet."}
                </p>
              )}
            </div>
          )}
          {freezeTeacher.isError && (
            <p role="alert" className="mt-4 text-sm text-red-400">
              {freezeTeacher.error instanceof Error
                ? freezeTeacher.error.message
                : locale === "ar"
                  ? "تعذر تحديث حالة حساب المعلم."
                  : "Unable to update the teacher account."}
            </p>
          )}
        </section>
        <section className="card min-w-0 p-5 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">
                {locale === "ar"
                  ? "سجل دعوات المعلمين"
                  : "Teacher invitation history"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {locale === "ar"
                  ? "تنتهي الدعوات غير المقبولة تلقائيًا بعد سبعة أيام."
                  : "Unaccepted invitations expire automatically after seven days."}
              </p>
            </div>
            <p className="text-sm text-muted">
              {invitations.isPending
                ? "…"
                : locale === "ar"
                  ? `${invitations.data?.totalCount ?? 0} دعوة`
                  : `${invitations.data?.totalCount ?? 0} invitation(s)`}
            </p>
          </div>
          {invitations.isPending ? (
            <div className="card mt-4 p-6" aria-busy>
              …
            </div>
          ) : invitations.isError ? (
            <p role="alert" className="card mt-4 p-6 text-sm text-red-400">
              {locale === "ar"
                ? "تعذر تحميل سجل الدعوات."
                : "Unable to load invitation history."}
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              {invitationItems.map((invitation) => (
                <article
                  key={invitation.id}
                  className="rounded-xl border border-border p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-black">
                        {invitation.displayName}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted">
                        {invitation.email}
                      </p>
                    </div>
                    <span className="rounded-full border border-border px-3 py-1 text-xs font-bold">
                      {invitationStatus(invitation.status)}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    {locale === "ar" ? "أُرسلت: " : "Issued: "}
                    {formatInvitationDate(invitation.createdAtUtc)} ·{" "}
                    {locale === "ar" ? "تنتهي: " : "Expires: "}
                    {formatInvitationDate(invitation.expiresAtUtc)}
                  </p>
                  {invitation.acceptedAtUtc && (
                    <p className="mt-1 text-xs text-emerald-300">
                      {locale === "ar" ? "قُبلت: " : "Accepted: "}
                      {formatInvitationDate(invitation.acceptedAtUtc)}
                    </p>
                  )}
                  {invitation.revokedAtUtc && (
                    <p className="mt-1 text-xs text-red-300">
                      {locale === "ar" ? "أُلغيت: " : "Revoked: "}
                      {formatInvitationDate(invitation.revokedAtUtc)}
                    </p>
                  )}
                  {invitation.canRevoke && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                      <input
                        value={revocationReasons[invitation.id] ?? ""}
                        onChange={(event) =>
                          setRevocationReasons((current) => ({
                            ...current,
                            [invitation.id]: event.target.value,
                          }))
                        }
                        maxLength={500}
                        placeholder={
                          locale === "ar" ? "سبب الإلغاء" : "Revocation reason"
                        }
                        className="min-w-48 flex-1 rounded-lg border bg-transparent p-2 text-sm"
                      />
                      <button
                        type="button"
                        disabled={
                          revokeInvitation.isPending ||
                          !revocationReasons[invitation.id]?.trim()
                        }
                        onClick={() =>
                          revokeInvitation.mutate({
                            invitationId: invitation.id,
                            reason: revocationReasons[invitation.id].trim(),
                          })
                        }
                        className="focus-ring rounded-lg border border-red-400/40 px-3 py-2 text-sm font-bold text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {locale === "ar" ? "إلغاء الدعوة" : "Revoke invitation"}
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {!invitationItems.length && (
                <p className="rounded-xl border border-border p-5 text-sm text-muted">
                  {locale === "ar"
                    ? "لا توجد دعوات بعد."
                    : "No invitations yet."}
                </p>
              )}
            </div>
          )}
          {revokeInvitation.isError && (
            <p role="alert" className="mt-4 text-sm text-red-400">
              {revokeInvitation.error instanceof Error
                ? revokeInvitation.error.message
                : locale === "ar"
                  ? "تعذر إلغاء الدعوة."
                  : "Unable to revoke the invitation."}
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
function CourseApprovals() {
  const locale = useLocale();
  const client = useQueryClient();
  const [selectedCourseId, setSelectedCourseId] = useState<string>();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const approvals = useQuery({
    queryKey: ["approvals"],
    queryFn: () => api<Approval[]>("/admin/courses/approvals"),
  });
  const review = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      api(`/admin/courses/${id}/review`, {
        method: "POST",
        body: JSON.stringify({
          approved,
          reason: approved ? null : reasons[id] || "Needs revision",
        }),
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["approvals"] });
      client.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
  });
  const publish = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/courses/${id}/publish`, { method: "POST" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["approvals"] });
      client.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setSelectedCourseId(undefined);
    },
  });
  const actionError = review.error ?? publish.error;
  if (approvals.isPending)
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          …
        </div>
      </section>
    );
  if (approvals.isError)
    return (
      <section className="shell py-10">
        <p className="card p-6">Access denied.</p>
      </section>
    );
  return (
    <section className="shell py-10">
      <h1 className="text-3xl font-black">
        {locale === "ar" ? "مراجعة الدورات" : "Course approvals"}
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
        {locale === "ar"
          ? "افتح محتوى الدورة أولًا لمراجعة الغلاف والوحدات والدروس والملفات، ثم اعتمدها. النشر خطوة مستقلة بعد الاعتماد."
          : "Open the course content to review its cover, modules, lessons, and files before approving it. Publishing remains a separate step."}
      </p>
      <div className="mt-6 space-y-3">
        {approvals.data.map((course) => (
          <article key={course.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-black">
                  {locale === "ar" ? course.arabicTitle : course.englishTitle}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {course.subjectArabicName
                    ? `${locale === "ar" ? course.subjectArabicName : course.subjectEnglishName} · `
                    : ""}
                  {course.moduleCount} {locale === "ar" ? "وحدات" : "modules"} ·{" "}
                  {course.lessonCount} {locale === "ar" ? "دروس" : "lessons"} ·{" "}
                  {course.resourceCount} {locale === "ar" ? "ملفات" : "files"} ·{" "}
                  {course.hasCover
                    ? locale === "ar"
                      ? "غلاف مرفوع"
                      : "Cover uploaded"
                    : locale === "ar"
                      ? "بدون غلاف"
                      : "No cover"}
                </p>
                {course.subjectPendingReview ? (
                  <p className="mt-1 text-xs font-bold text-amber-500">
                    {locale === "ar"
                      ? "المادة الجديدة ستُعتمد مع اعتماد الدورة."
                      : "The new subject will be approved with this course."}
                  </p>
                ) : null}
              </div>
              <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                {course.status === "Approved"
                  ? locale === "ar"
                    ? "معتمدة"
                    : "Approved"
                  : locale === "ar"
                    ? "بانتظار المراجعة"
                    : "Awaiting review"}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedCourseId((current) =>
                    current === course.id ? undefined : course.id,
                  )
                }
                className="focus-ring rounded-lg border border-primary/40 px-3 py-2 text-sm font-bold text-primary"
              >
                {selectedCourseId === course.id
                  ? locale === "ar"
                    ? "إخفاء المحتوى"
                    : "Hide content"
                  : locale === "ar"
                    ? "مراجعة المحتوى"
                    : "Review content"}
              </button>
              {course.status === "SubmittedForReview" ? (
                <>
                  <input
                    value={reasons[course.id] ?? ""}
                    onChange={(event) =>
                      setReasons((current) => ({
                        ...current,
                        [course.id]: event.target.value,
                      }))
                    }
                    placeholder={
                      locale === "ar"
                        ? "سبب الإرجاع عند الحاجة"
                        : "Reason if returning"
                    }
                    className="min-w-52 flex-1 rounded-lg border border-border bg-transparent px-3 text-sm"
                  />
                  <button
                    type="button"
                    className="focus-ring rounded-lg border border-red-500/45 px-3 py-2 text-sm font-bold text-red-400"
                    onClick={() =>
                      review.mutate({ id: course.id, approved: false })
                    }
                  >
                    {locale === "ar" ? "إرجاع للتعديل" : "Return for revision"}
                  </button>
                  <button
                    type="button"
                    className="focus-ring rounded-lg bg-primary px-3 py-2 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() =>
                      review.mutate({ id: course.id, approved: true })
                    }
                    disabled={
                      selectedCourseId !== course.id || review.isPending
                    }
                  >
                    {locale === "ar"
                      ? "اعتماد بعد المراجعة"
                      : "Approve after review"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="focus-ring rounded-lg bg-primary px-3 py-2 text-sm font-bold text-slate-950"
                  onClick={() => publish.mutate(course.id)}
                  disabled={publish.isPending}
                >
                  {locale === "ar" ? "نشر الدورة" : "Publish course"}
                </button>
              )}
            </div>
            {selectedCourseId === course.id ? (
              <CourseApprovalPreview courseId={course.id} />
            ) : null}
            {actionError ? (
              <p role="alert" className="mt-3 text-sm text-red-400">
                {actionError instanceof Error
                  ? actionError.message
                  : "Request failed."}
              </p>
            ) : null}
          </article>
        ))}
        {!approvals.data.length && (
          <p className="card p-5 text-muted">
            {locale === "ar"
              ? "لا توجد دورات بانتظار المراجعة."
              : "No courses await review."}
          </p>
        )}
      </div>
    </section>
  );
}

function CourseApprovalPreview({ courseId }: { courseId: string }) {
  const locale = useLocale();
  const detail = useQuery({
    queryKey: ["approval-course", courseId],
    queryFn: () => api<ApprovalDetail>(`/admin/courses/${courseId}`),
  });
  if (detail.isPending)
    return (
      <div
        className="mt-5 rounded-xl border border-border p-4 text-sm text-muted"
        aria-busy
      >
        …
      </div>
    );
  if (detail.isError || !detail.data)
    return (
      <p className="mt-5 rounded-xl border border-red-500/30 p-4 text-sm text-red-400">
        {locale === "ar"
          ? "تعذر تحميل محتوى الدورة."
          : "Unable to load course content."}
      </p>
    );
  const course = detail.data;
  return (
    <section className="mt-5 grid gap-5 border-t border-border pt-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div>
        {course.hasCover ? (
          <img
            src={`/api/v1/admin/courses/${course.id}/cover`}
            alt={
              locale === "ar"
                ? `غلاف ${course.arabicTitle}`
                : `${course.englishTitle} cover`
            }
            className="aspect-video w-full rounded-xl border border-border object-cover"
          />
        ) : (
          <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-border text-sm text-muted">
            {locale === "ar" ? "لا يوجد غلاف." : "No cover."}
          </div>
        )}
        <div className="mt-4 rounded-xl border border-border p-3 text-sm">
          <strong>
            {course.isFree
              ? locale === "ar"
                ? "مجانية"
                : "Free"
              : `${course.price.toFixed(3)} JOD`}
          </strong>
          <p className="mt-2 text-muted">
            {locale === "ar"
              ? course.arabicDescription
              : course.englishDescription}
          </p>
        </div>
      </div>
      <div className="grid gap-4">
        <div>
          <h3 className="font-black">
            {locale === "ar" ? "نواتج التعلم" : "Learning outcomes"}
          </h3>
          <ul className="mt-2 grid gap-2 text-sm text-muted">
            {course.outcomes.map((outcome) => (
              <li
                key={`${outcome.arabicText}-${outcome.englishText}`}
                className="rounded-lg border border-border p-3"
              >
                <strong className="block text-foreground">
                  {outcome.arabicText}
                </strong>
                {outcome.englishText}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-black">
            {locale === "ar" ? "الوحدات والدروس" : "Modules and lessons"}
          </h3>
          <div className="mt-2 grid gap-3">
            {course.modules.map((module) => (
              <article
                key={`${module.arabicTitle}-${module.englishTitle}`}
                className="rounded-xl border border-border p-4"
              >
                <h4 className="font-bold">
                  {locale === "ar" ? module.arabicTitle : module.englishTitle}
                </h4>
                <div className="mt-3 grid gap-3">
                  {module.lessons.map((lesson) => (
                    <div
                      key={`${lesson.arabicTitle}-${lesson.englishTitle}`}
                      className="rounded-lg border border-border/70 bg-black/5 p-3"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <strong>
                          {locale === "ar"
                            ? lesson.arabicTitle
                            : lesson.englishTitle}
                        </strong>
                        <span className="text-xs text-muted">
                          {lesson.type} ·{" "}
                          {Math.round(lesson.durationSeconds / 60)}{" "}
                          {locale === "ar" ? "دقيقة" : "min"}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                        {locale === "ar"
                          ? lesson.arabicBody
                          : lesson.englishBody}
                      </p>
                      {lesson.resources.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {lesson.resources.map((resource) => (
                            <a
                              key={resource.id}
                              href={`/api/v1/admin/courses/resources/${resource.id}`}
                              className="focus-ring rounded-lg border border-primary/35 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/10"
                            >
                              {resource.displayName}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-muted">
                          {locale === "ar"
                            ? "لا توجد ملفات لهذا الدرس."
                            : "No files for this lesson."}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-black">
            {locale === "ar" ? "المهام ومعاييرها" : "Coursework and criteria"}
          </h3>
          {course.assignments.length ? (
            <div className="mt-2 grid gap-3">
              {course.assignments.map((assignment) => (
                <article
                  key={`${assignment.arabicTitle}-${assignment.englishTitle}`}
                  className="rounded-xl border border-border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-bold">
                      {locale === "ar"
                        ? assignment.arabicTitle
                        : assignment.englishTitle}
                    </h4>
                    <span className="text-xs font-bold text-muted">
                      {assignment.isPublished
                        ? locale === "ar"
                          ? "منشورة"
                          : "Published"
                        : locale === "ar"
                          ? "مسودة"
                          : "Draft"}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                    {locale === "ar"
                      ? assignment.arabicInstructions
                      : assignment.englishInstructions}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {locale === "ar"
                      ? "إعداد التسليم: "
                      : "Submission settings: "}
                    {assignment.maxSubmissionAttempts}{" "}
                    {locale === "ar" ? "محاولات" : "attempts"} ·{" "}
                    {Math.round(assignment.maxFileSizeBytes / 1024 / 1024)}MB ·{" "}
                    {assignment.allowedFileExtensions.join(", ").toUpperCase()}
                    {assignment.allowResubmission
                      ? locale === "ar"
                        ? " · إعادة التسليم مسموحة"
                        : " · resubmission allowed"
                      : locale === "ar"
                        ? " · لا إعادة تسليم"
                        : " · no resubmission"}
                  </p>
                  <ul className="mt-3 grid gap-2 text-sm">
                    {assignment.criteria.map((criterion) => (
                      <li
                        key={criterion.code}
                        className="rounded-lg border border-border/70 bg-black/5 p-2.5"
                      >
                        <strong className="text-primary">
                          {criterion.code}
                        </strong>{" "}
                        · {criterion.band} —{" "}
                        {locale === "ar"
                          ? criterion.arabicDescription
                          : criterion.englishDescription}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">
              {locale === "ar"
                ? "لا توجد مهام مضافة لهذه الدورة."
                : "No coursework has been added to this course."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
