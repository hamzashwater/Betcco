"use client";

/* eslint-disable @next/next/no-img-element */

import { formatLocalizedDate, formatLocalizedDateTime } from "@/i18n/date-time";
import {
  formatLocalizedCurrency,
  formatLocalizedNumber,
  formatLocalizedPercentage,
} from "@/i18n/number-format";
import { api } from "@/lib/api";
import { academicText } from "@/lib/academic-localization";
import { MotivationCard } from "@/components/motivation-card";
import { FilePicker } from "@/components/forms/file-picker";
import { StudentLearningAimPractice } from "@/features/learning/learning-aim-practice";
import { StudentComprehensivePractice } from "@/features/learning/comprehensive-practice";
import { AccountSecurity } from "@/features/auth/account-security";
import { AccountLayout } from "@/features/auth/account-layout";
import { StudentEmailChange } from "@/features/auth/student-email-change";
import { SupportCenter } from "@/features/support/support-center";
import { EvaluationAppeals } from "@/features/student/evaluation-appeals";
import { useStudentEvaluations } from "@/features/student/student-evaluation-page";
import {
  StudentResitDetail,
  StudentResitOpportunities,
} from "@/features/student/student-resit-workflow";
import { AiPracticeShell } from "@/features/student/ai-practice-shell";
import { StudentProgressIntelligence } from "@/features/student/student-progress-intelligence";
import {
  compactStudentCoursesQueryOptions,
  StudentCoursesLearningHub,
} from "@/features/student/student-courses-learning-hub";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpenCheck,
  CalendarDays,
  CircleCheckBig,
  ClipboardCheck,
  CreditCard,
  FileBadge,
  FolderOpen,
  Headphones,
  LockKeyhole,
  ListVideo,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  PlayCircle,
  Sparkles,
  StickyNote,
  Timer,
  Trophy,
  UserRound,
} from "lucide-react";
import {
  ActionCard,
  DashboardHeader,
  MetricCard,
} from "@/components/dashboard/dashboard-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode, useEffect, useRef, useState } from "react";

type AssessmentScopeOption = {
  assessmentScopeId: string;
  qualificationCode: string;
  qualificationArabicName: string;
  qualificationEnglishName: string;
  qualificationVersionCode: string;
  gradeCode: string;
  gradeArabicName: string;
  gradeEnglishName: string;
  specializationCode: string;
  specializationArabicName: string;
  specializationEnglishName: string;
  unitCode: string;
  unitArabicTitle: string;
  unitEnglishTitle: string;
  assessmentCode: string;
  assessmentVersion: number;
  assessmentArabicTitle: string;
  assessmentEnglishTitle: string;
  scopeVersion: number;
  learningAimCodes: string[];
  criteria: { code: string; band: string }[];
};

type EvaluationCheckoutResponse = {
  includedCreditApplied: boolean;
  evaluationStatus: string;
  paymentId: string | null;
  status?: string;
  provider?: string;
  checkoutReference?: string;
  redirectUrl?: string | null;
  providerSessionStatus?: string;
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
  currency?: string;
  paymentMethod?: string;
};

type AssessmentAcademicSummary = {
  qualificationCode: string;
  qualificationArabicName: string;
  qualificationEnglishName: string;
  qualificationVersionCode: string;
  unitCode: string;
  unitArabicTitle: string;
  unitEnglishTitle: string;
  assessmentCode: string;
  assessmentVersion: number;
  assessmentArabicTitle: string;
  assessmentEnglishTitle: string;
  learningAimCodes: string[];
};

type EvaluationServerFile = {
  id: string;
  originalFileName: string;
  contentType: string;
  lengthBytes: number;
  scanStatus: string;
};

type EvaluationDetail = {
  id: string;
  status: string;
  price: number;
  currency: string;
  studentComment: string | null;
  assessmentScopeId: string | null;
  isRetake: boolean;
  isResit: boolean;
  hasAuthenticityDeclaration: boolean | null;
  academic: AssessmentAcademicSummary | null;
  criteria: string[];
  files: EvaluationServerFile[];
  evidence: { criterionCode: string; narrative: string }[];
};

function AcademicIdentity({
  academic,
  locale,
}: {
  academic: AssessmentAcademicSummary | null;
  locale: string;
}) {
  const t = useTranslations("studentWorkspace");
  if (!academic) return null;
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-page/40 p-3 text-sm">
      <p className="font-bold">
        {academic.qualificationCode} ·{" "}
        {academicText(
          locale,
          academic.qualificationArabicName,
          academic.qualificationEnglishName,
        )}{" "}
        ({academic.qualificationVersionCode})
      </p>
      <p>
        {academic.unitCode} ·{" "}
        {academicText(
          locale,
          academic.unitArabicTitle,
          academic.unitEnglishTitle,
        )}
      </p>
      <p>
        {academic.assessmentCode} v{academic.assessmentVersion} ·{" "}
        {academicText(
          locale,
          academic.assessmentArabicTitle,
          academic.assessmentEnglishTitle,
        )}
      </p>
      <p className="text-muted">
        {t("academicIdentity.learningAims")}:{" "}
        {academic.learningAimCodes.join(", ")}
      </p>
    </div>
  );
}

export function StudentArea({
  segment,
  requestedLessonId,
}: {
  segment: string[];
  requestedLessonId?: string;
}) {
  const current = segment.join("/") || "dashboard";
  let content: ReactNode = <StudentDashboard />;
  if (current === "courses") content = <StudentCoursesLearningHub />;
  if (current === "ai-practice") content = <AiPracticeShell />;
  if (current.startsWith("learn/") && segment[1])
    content = (
      <CoursePlayer
        courseId={segment[1]}
        requestedLessonId={requestedLessonId}
      />
    );
  if (current === "evaluations/new")
    content = (
      <Suspense
        fallback={
          <section className="shell py-10">
            <div className="card p-6" aria-busy>
              …
            </div>
          </section>
        }
      >
        <EvaluationWizard />
      </Suspense>
    );
  if (current === "evaluations") content = <MyEvaluations />;
  if (current.startsWith("evaluations/") && segment[1] && segment[1] !== "new")
    content = <StudentResitDetail evaluationId={segment[1]} />;
  if (current === "appeals") content = <EvaluationAppeals />;
  if (current === "planner")
    content = <LearningOrganizer initialTab="planner" />;
  if (current === "notes") content = <LearningOrganizer initialTab="notes" />;
  if (current === "bookmarks")
    content = <LearningOrganizer initialTab="bookmarks" />;
  if (current.startsWith("certificates/") && segment[1])
    content = <CertificateDocument verificationCode={segment[1]} />;
  if (current === "certificates")
    content = <LearningOrganizer initialTab="certificates" />;
  if (current === "support") content = <SupportCenter mode="student" />;
  if (current === "account") content = <StudentAccount />;
  if (current === "purchases") content = <StudentPurchases />;
  if (current === "security") content = <AccountSecurity role="student" />;
  return (
    <>
      <StudentWorkspaceNav current={current} />
      {content}
    </>
  );
}

function StudentWorkspaceNav({ current }: { current: string }) {
  const t = useTranslations("studentWorkspace");
  const locale = useLocale();
  const links = [
    ["", t("navigation.overview")],
    ["courses", t("navigation.courses")],
    ["ai-practice", t("navigation.aiPractice")],
    ["evaluations", t("navigation.evaluations")],
    ["appeals", t("navigation.appeals")],
    ["planner", t("navigation.planner")],
    ["notes", t("navigation.notes")],
    ["bookmarks", t("navigation.bookmarks")],
    ["certificates", t("navigation.certificates")],
    ["purchases", t("navigation.payments")],
    ["account", t("navigation.account")],
    ["security", t("navigation.security")],
    ["support", t("navigation.support")],
  ] as const;
  const isCurrent = (href: string) =>
    href === ""
      ? current === "dashboard"
      : current === href || current.startsWith(`${href}/`);
  return (
    <nav
      aria-label={t("navigation.ariaLabel")}
      className="sticky top-[4.5rem] z-30 border-b border-border bg-[color:var(--background)]/95 backdrop-blur-xl"
    >
      <div className="shell flex gap-1 overflow-x-auto py-2">
        {links.map(([href, label]) => (
          <Link
            key={href || "dashboard"}
            href={href ? `/${locale}/student/${href}` : `/${locale}/student`}
            className={`focus-ring shrink-0 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${isCurrent(href) ? "bg-primary text-slate-950" : "text-muted hover:bg-primary/10 hover:text-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function StudentDashboard() {
  const t = useTranslations("studentWorkspace");
  const locale = useLocale();
  const courses = useQuery(compactStudentCoursesQueryOptions(locale));
  const overview = useQuery({
    queryKey: ["student-learning-overview", locale],
    queryFn: () =>
      api<LearningOverview>(`/student-tools/overview?locale=${locale}`),
  });
  const courseSummary = courses.data?.summary;
  const upcomingAssignments = overview.data?.upcomingAssignments ?? [];
  const completedLessons = courseSummary?.completedLessons ?? 0;
  const allLessons = courseSummary?.totalLessons ?? 0;
  const progress = courseSummary?.progressPercent ?? 0;
  const achievements = overview.data?.achievements ?? [];
  const pendingActions = overview.data?.pendingActions;
  const courseUnavailable = courses.isError && !courses.data;
  const overviewUnavailable = overview.isError && !overview.data;
  const courseErrorCopy = courses.data
    ? t("dashboard.courseRefreshError")
    : t("dashboard.courseLoadError");
  const overviewErrorCopy = overview.data
    ? t("dashboard.overviewRefreshError")
    : t("dashboard.overviewLoadError");
  const courseLoadingCopy = t("dashboard.courseLoading");
  const overviewLoadingCopy = t("dashboard.overviewLoading");
  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow={t("dashboard.eyebrow")}
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={
          <Link
            href={`/${locale}/student/courses`}
            className="focus-ring inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-slate-950"
          >
            <PlayCircle size={18} aria-hidden="true" />
            {t("dashboard.continueLearning")}
          </Link>
        }
      />
      <div
        className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-busy={courses.isPending || overview.isPending}
      >
        <MetricCard
          label={t("dashboard.metrics.enrolledCourses")}
          value={
            courses.isPending || courseUnavailable
              ? "—"
              : (courseSummary?.totalCourses ?? 0)
          }
          detail={
            courses.isError
              ? courseErrorCopy
              : courses.isPending
                ? courseLoadingCopy
                : t("dashboard.metrics.enrolledCoursesDetail")
          }
          icon={BookOpenCheck}
        />
        <MetricCard
          label={t("dashboard.metrics.completedLessons")}
          value={
            courses.isPending || courseUnavailable
              ? "—"
              : `${completedLessons}/${allLessons}`
          }
          detail={
            courses.isError
              ? courseErrorCopy
              : courses.isPending
                ? courseLoadingCopy
                : t("dashboard.metrics.completedLessonsDetail")
          }
          icon={CircleCheckBig}
          tone="secondary"
        />
        <MetricCard
          label={t("dashboard.metrics.overallProgress")}
          value={
            courses.isPending || courseUnavailable
              ? "—"
              : formatLocalizedPercentage(Math.round(progress), locale, {
                  maximumFractionDigits: 0,
                })
          }
          detail={
            courses.isError
              ? courseErrorCopy
              : courses.isPending
                ? courseLoadingCopy
                : t("dashboard.metrics.overallProgressDetail")
          }
          icon={Timer}
          tone="accent"
        />
        <MetricCard
          label={t("dashboard.metrics.upcomingCoursework")}
          value={
            overview.isPending || overviewUnavailable
              ? "—"
              : upcomingAssignments.length
          }
          detail={
            overview.isError
              ? overviewErrorCopy
              : overview.isPending
                ? overviewLoadingCopy
                : t("dashboard.metrics.upcomingCourseworkDetail")
          }
          icon={ClipboardCheck}
          tone="warm"
        />
        <MetricCard
          label={t("dashboard.metrics.unreadNotifications")}
          value={
            overview.isPending || overviewUnavailable
              ? "—"
              : (overview.data?.unreadNotifications ?? 0)
          }
          detail={
            overview.isError
              ? overviewErrorCopy
              : overview.isPending
                ? overviewLoadingCopy
                : t("dashboard.metrics.unreadNotificationsDetail")
          }
          icon={MessageSquareText}
        />
        <MetricCard
          label={t("dashboard.metrics.completionCertificates")}
          value={
            overview.isPending || overviewUnavailable
              ? "—"
              : (overview.data?.certificates.length ?? 0)
          }
          detail={
            overview.isError
              ? overviewErrorCopy
              : overview.isPending
                ? overviewLoadingCopy
                : t("dashboard.metrics.completionCertificatesDetail")
          }
          icon={FileBadge}
          tone="secondary"
        />
      </div>
      {courses.isError ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted" role="alert">
            {courseErrorCopy}
          </p>
          <button
            type="button"
            className="focus-ring rounded-xl border border-border px-3 py-2 text-sm font-bold text-primary disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void courses.refetch()}
            disabled={courses.isFetching}
          >
            {courses.isFetching
              ? t("dashboard.retrying")
              : t("dashboard.retryCourses")}
          </button>
        </div>
      ) : null}
      {overview.isError ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted" role="alert">
            {overviewErrorCopy}
          </p>
          <button
            type="button"
            className="focus-ring rounded-xl border border-border px-3 py-2 text-sm font-bold text-primary disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void overview.refetch()}
            disabled={overview.isFetching}
          >
            {overview.isFetching
              ? t("dashboard.retrying")
              : t("dashboard.retryOverview")}
          </button>
        </div>
      ) : null}
      <section
        className="card mt-5 p-5"
        aria-labelledby="student-pending-actions-heading"
      >
        <h2 id="student-pending-actions-heading" className="text-xl font-black">
          {t("dashboard.pendingActions.heading")}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {t("dashboard.pendingActions.description")}
        </p>
        {overview.isPending ? (
          <p className="mt-4 text-sm text-muted" aria-busy>
            {t("dashboard.pendingActions.loading")}
          </p>
        ) : overviewUnavailable || !pendingActions ? (
          <p className="mt-4 text-sm text-muted">
            {t("dashboard.pendingActions.error")}
          </p>
        ) : pendingActions.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            {t("dashboard.pendingActions.empty")}
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {pendingActions.map((action) => {
              const title = {
                EvaluationRevision: t(
                  "dashboard.pendingActions.evaluationRevisionTitle",
                ),
                ResitAuthorized: t(
                  "dashboard.pendingActions.resitAuthorizedTitle",
                ),
                ResitDraft: t("dashboard.pendingActions.resitDraftTitle"),
                EvaluationDraft: t(
                  "dashboard.pendingActions.evaluationDraftTitle",
                ),
              }[action.kind];
              const label = {
                EvaluationRevision: t(
                  "dashboard.pendingActions.evaluationRevisionLink",
                ),
                ResitAuthorized: t(
                  "dashboard.pendingActions.resitAuthorizedLink",
                ),
                ResitDraft: t("dashboard.pendingActions.resitDraftLink"),
                EvaluationDraft: t(
                  "dashboard.pendingActions.evaluationDraftLink",
                ),
              }[action.kind];
              const href =
                action.kind === "EvaluationDraft"
                  ? `/${locale}/student/evaluations/new?resume=${action.evaluationRequestId}`
                  : action.kind === "ResitDraft"
                    ? `/${locale}/student/evaluations/${action.evaluationRequestId}`
                    : `/${locale}/student/evaluations`;
              return (
                <article
                  key={`${action.kind}:${action.evaluationRequestId}`}
                  className="rounded-xl border border-border bg-surface-solid/45 p-4"
                >
                  <h3 className="font-black">{title}</h3>
                  {action.academic ? (
                    <p className="mt-2 text-sm text-muted">
                      {action.academic.unitCode} ·{" "}
                      {academicText(
                        locale,
                        action.academic.unitArabicTitle,
                        action.academic.unitEnglishTitle,
                      )}
                      {" · "}
                      {academicText(
                        locale,
                        action.academic.assessmentArabicTitle,
                        action.academic.assessmentEnglishTitle,
                      )}
                    </p>
                  ) : null}
                  {action.kind === "EvaluationRevision" &&
                  action.effectiveDueAtUtc ? (
                    <p className="mt-2 text-sm font-semibold text-amber-500">
                      {t("dashboard.pendingActions.revisionDeadline")}{" "}
                      {formatLocalizedDateTime(
                        action.effectiveDueAtUtc,
                        locale,
                      )}
                    </p>
                  ) : null}
                  <Link
                    className="focus-ring mt-3 inline-block font-bold text-primary underline"
                    href={href}
                  >
                    {label}
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <MotivationCard variant="dashboard" className="mt-5" />
      <section className="card mt-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
              {t("dashboard.milestones.heading")}
            </p>
            <h2 className="mt-1 text-xl font-black">
              {t("dashboard.milestones.description")}
            </h2>
          </div>
          <Trophy className="text-primary" aria-hidden="true" />
        </div>
        {overview.isPending ? (
          <p className="mt-4 text-sm text-muted" aria-busy>
            {t("dashboard.milestones.loading")}
          </p>
        ) : overviewUnavailable ? (
          <p className="mt-4 text-sm text-muted">
            {t("dashboard.milestones.error")}
          </p>
        ) : achievements.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            {t("dashboard.milestones.empty")}
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {achievements.map((achievement) => (
              <article
                key={achievement.code}
                className={`rounded-2xl border p-4 ${achievement.isCompleted ? "border-primary/40 bg-primary/10" : "border-border bg-muted/30"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-black">{achievement.title}</h3>
                  <CircleCheckBig
                    size={19}
                    className={
                      achievement.isCompleted ? "text-primary" : "text-muted"
                    }
                    aria-label={
                      achievement.isCompleted
                        ? t("dashboard.milestones.completedAria")
                        : t("dashboard.milestones.incompleteAria")
                    }
                  />
                </div>
                <p className="mt-2 text-sm text-muted">
                  {achievement.description}
                </p>
                <p className="mt-3 text-xs font-bold text-foreground">
                  {achievement.currentValue}/{achievement.targetValue}{" "}
                  {t("dashboard.milestones.completeCount")}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="card mt-5 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
              {t("dashboard.deadlines.eyebrow")}
            </p>
            <h2 className="mt-1 text-xl font-black">
              {t("dashboard.deadlines.heading")}
            </h2>
          </div>
          <CalendarDays className="text-primary" aria-hidden="true" />
        </div>
        {overview.isPending ? (
          <p className="mt-4 text-sm text-muted" aria-busy>
            …
          </p>
        ) : overviewUnavailable ? (
          <p className="mt-4 text-sm text-muted">
            {t("dashboard.deadlines.error")}
          </p>
        ) : upcomingAssignments.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {upcomingAssignments.map((assignment) => (
              <Link
                key={assignment.id}
                href={`/${locale}/student/learn/${assignment.courseId}`}
                className="focus-ring rounded-xl border border-border bg-surface-solid/45 p-4 hover:border-primary/45"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black">{assignment.title}</h3>
                    <p className="mt-1 text-xs text-muted">
                      {assignment.courseTitle}
                    </p>
                  </div>
                  <ClipboardCheck className="shrink-0 text-primary" size={18} />
                </div>
                <p className="mt-3 text-sm font-bold text-amber-500">
                  {t("dashboard.deadlines.due")}{" "}
                  {formatLocalizedDateTime(assignment.dueAtUtc, locale)}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            {t("dashboard.deadlines.empty")}
          </p>
        )}
      </section>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <DashboardLink
          href="courses"
          title={t("navigation.courses")}
          text={t("dashboard.quickLinks.coursesDescription")}
          icon={BookOpenCheck}
        />
        <DashboardLink
          href="evaluations/new"
          title={t("dashboard.quickLinks.evaluateTitle")}
          text={t("dashboard.quickLinks.evaluateDescription")}
          icon={ClipboardCheck}
        />
        <DashboardLink
          href="support"
          title={t("navigation.support")}
          text={t("dashboard.quickLinks.supportDescription")}
          icon={Headphones}
        />
        <DashboardLink
          href="planner"
          title={t("dashboard.quickLinks.plannerTitle")}
          text={t("dashboard.quickLinks.plannerDescription")}
          icon={CalendarDays}
        />
        <DashboardLink
          href="notes"
          title={t("dashboard.quickLinks.notesTitle")}
          text={t("dashboard.quickLinks.notesDescription")}
          icon={StickyNote}
        />
        <DashboardLink
          href="certificates"
          title={t("dashboard.quickLinks.certificatesTitle")}
          text={t("dashboard.quickLinks.certificatesDescription")}
          icon={FileBadge}
        />
        <DashboardLink
          href="account"
          title={t("navigation.account")}
          text={t("dashboard.quickLinks.accountDescription")}
          icon={UserRound}
        />
      </div>
      <div className="mt-8">
        <StudentCoursesLearningHub variant="compact" />
      </div>
    </section>
  );
}

function DashboardLink({
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
  const t = useTranslations("studentWorkspace");
  return (
    <Link
      href={`/${locale}/student/${href}`}
      className="focus-ring block rounded-[1.25rem]"
    >
      <ActionCard title={title} description={text} icon={icon}>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-black text-primary">
          {t("dashboard.quickLinks.open")}
          <ArrowLeft size={16} className="rtl:rotate-180" aria-hidden="true" />
        </span>
      </ActionCard>
    </Link>
  );
}

type StudentProfile = {
  displayName: string;
  email?: string;
  phone?: string;
  marketingConsent: boolean;
};

type StudentMemberships = {
  memberships: {
    id: string;
    title: string;
    startsAtUtc: string;
    endsAtUtc: string;
    status: "Active" | "Expired";
  }[];
  subscriptions: {
    id: string;
    title: string;
    courseId: string;
    startsAtUtc: string;
    endsAtUtc: string;
    status: "Active" | "Expired";
  }[];
};

type StudentPurchase = {
  id: string;
  purpose: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  method: string;
  provider?: string;
  paidAtUtc?: string;
  createdAtUtc: string;
};

type StudentPurchaseHistory = {
  items: StudentPurchase[];
  page: number;
  pageSize: number;
  totalCount: number;
};

type StudentIncludedEvaluationCredit = {
  unitDefinitionId: string;
  unitCode: string;
  unitTitle: string;
  status: "Available" | "Consumed" | "Revoked";
  grantedAtUtc: string;
  consumedAtUtc: string | null;
  revokedAtUtc: string | null;
};

type StudentEntitlement = {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  accessType: "Permanent" | "Timed";
  enrolledAtUtc: string;
  accessEndsAtUtc: string | null;
  sourcePaymentId: string | null;
  sourcePurpose: string;
  includedEvaluationCredits: StudentIncludedEvaluationCredit[];
};

type StudentEntitlementResponse = {
  items: StudentEntitlement[];
};

function StudentAccount() {
  const t = useTranslations("studentWorkspace");
  const tProfile = useTranslations("auth.accountProfile");
  const locale = useLocale();
  const client = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const profile = useQuery({
    queryKey: ["student-profile"],
    queryFn: () => api<StudentProfile>("/auth/profile"),
  });
  const memberships = useQuery({
    queryKey: ["student-memberships"],
    queryFn: () => api<StudentMemberships>("/memberships/me"),
  });
  const save = useMutation({
    mutationFn: (form: {
      displayName: string;
      phone: string;
      marketingConsent: boolean;
    }) =>
      api<StudentProfile>("/auth/profile", {
        method: "PUT",
        body: JSON.stringify({
          displayName: form.displayName.trim(),
          phone: form.phone.trim() || null,
          marketingConsent: form.marketingConsent,
        }),
      }),
    onSuccess: () => {
      setNotice(t("account.saved"));
      void client.invalidateQueries({ queryKey: ["student-profile"] });
      void client.invalidateQueries({ queryKey: ["current-user"] });
    },
  });
  const entries = [
    ...(memberships.data?.memberships ?? []).map((item) => ({
      ...item,
      kind: t("account.membershipKind"),
    })),
    ...(memberships.data?.subscriptions ?? []).map((item) => ({
      ...item,
      kind: t("account.subscriptionKind"),
    })),
  ].sort(
    (first, second) =>
      new Date(second.endsAtUtc).getTime() -
      new Date(first.endsAtUtc).getTime(),
  );
  return (
    <AccountLayout role="student" active="profile">
      <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <form
          className="card min-w-0 p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            setNotice(null);
            const values = new FormData(event.currentTarget);
            save.mutate({
              displayName: String(values.get("displayName") ?? "").trim(),
              phone: String(values.get("phone") ?? "").trim(),
              marketingConsent: values.get("marketingConsent") === "on",
            });
          }}
        >
          <div className="flex items-start gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
              <UserRound size={22} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-black">{tProfile("basicDetails")}</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {t("account.description")}
              </p>
            </div>
          </div>
          {profile.isPending ? (
            <p className="mt-6 text-sm text-muted" aria-busy>
              {t("loading")}
            </p>
          ) : profile.isError || !profile.data ? (
            <p role="alert" className="mt-6 text-sm text-red-600">
              {tProfile("loadError")}
            </p>
          ) : (
            <div className="mt-6 grid gap-4">
              <label className="grid gap-1 text-sm font-bold">
                <span>{tProfile("name")}</span>
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  name="displayName"
                  defaultValue={profile.data.displayName}
                  className="focus-ring rounded-xl border border-border bg-transparent px-3 py-2.5 text-foreground"
                />
              </label>
              <label className="grid gap-1 text-sm font-bold">
                <span>{tProfile("email")}</span>
                <input
                  readOnly
                  value={profile.data.email ?? ""}
                  className="rounded-xl border border-border bg-muted/35 px-3 py-2.5 text-muted"
                />
              </label>
              <label className="grid gap-1 text-sm font-bold">
                <span>{tProfile("phoneOptional")}</span>
                <input
                  inputMode="tel"
                  maxLength={40}
                  name="phone"
                  defaultValue={profile.data.phone ?? ""}
                  className="focus-ring rounded-xl border border-border bg-transparent px-3 py-2.5 text-foreground"
                />
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-3 text-sm leading-6">
                <input
                  type="checkbox"
                  name="marketingConsent"
                  defaultChecked={profile.data.marketingConsent}
                  className="mt-1 size-4 accent-[var(--primary)]"
                />
                <span>{tProfile("marketingConsent")}</span>
              </label>
              <button
                type="submit"
                disabled={save.isPending}
                className="focus-ring rounded-xl bg-primary px-4 py-3 text-sm font-black text-slate-950 disabled:cursor-wait disabled:opacity-60"
              >
                {save.isPending ? tProfile("saving") : tProfile("saveDetails")}
              </button>
              {notice ? (
                <p
                  role="status"
                  className="text-sm text-emerald-700 dark:text-emerald-300"
                >
                  {notice}
                </p>
              ) : null}
              {save.isError ? (
                <p role="alert" className="text-sm text-red-600">
                  {save.error instanceof Error
                    ? save.error.message
                    : tProfile("saveError")}
                </p>
              ) : null}
            </div>
          )}
        </form>
        <section className="card min-w-0 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
              <CreditCard size={22} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-black">
                {t("account.membershipsHeading")}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {t("account.membershipsDescription")}
              </p>
            </div>
          </div>
          {memberships.isPending ? (
            <p className="mt-6 text-sm text-muted" aria-busy>
              {t("loading")}
            </p>
          ) : memberships.isError ? (
            <p role="alert" className="mt-6 text-sm text-red-600">
              {t("account.membershipsError")}
            </p>
          ) : entries.length ? (
            <div className="mt-6 grid gap-3">
              {entries.map((entry) => (
                <article
                  key={`${entry.kind}-${entry.id}`}
                  className="rounded-xl border border-border bg-muted/20 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{entry.title}</p>
                      <p className="mt-1 text-xs text-muted">{entry.kind}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-black ${entry.status === "Active" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted"}`}
                    >
                      {entry.status === "Active"
                        ? t("account.active")
                        : t("account.expired")}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    {t("account.ends")}{" "}
                    {formatLocalizedDate(entry.endsAtUtc, locale)}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-border p-4 text-sm leading-6 text-muted">
              <p>{t("account.membershipsEmpty")}</p>
              <Link
                href={`/${locale}/memberships`}
                className="focus-ring mt-3 inline-flex font-black text-primary"
              >
                {t("account.exploreMemberships")}
              </Link>
            </div>
          )}
          <Link
            href={`/${locale}/student/purchases`}
            className="focus-ring mt-6 inline-flex items-center gap-2 text-sm font-black text-primary"
          >
            <CreditCard size={16} aria-hidden="true" />
            {t("account.viewPaymentHistory")}
          </Link>
        </section>
      </div>
      <StudentEmailChange />
    </AccountLayout>
  );
}

function StudentPurchases() {
  const t = useTranslations("studentWorkspace");
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const purchases = useQuery({
    queryKey: ["student-purchases", page],
    queryFn: () =>
      api<StudentPurchaseHistory>(
        `/student-tools/purchases?page=${page}&pageSize=12`,
      ),
  });
  const entitlements = useQuery({
    queryKey: ["student-entitlements", locale],
    queryFn: () =>
      api<StudentEntitlementResponse>(
        `/student-tools/entitlements?locale=${locale}`,
      ),
  });
  const labelForPurpose = (purpose: string) => {
    const labels: Record<string, string> = {
      CoursePurchase: t("purchases.purpose.coursePurchase"),
      CoursePackage: t("purchases.purpose.coursePackage"),
      Evaluation: t("purchases.purpose.evaluation"),
      Membership: t("account.membershipKind"),
      CourseSubscription: t("account.subscriptionKind"),
    };
    return labels[purpose] ?? purpose;
  };
  const labelForStatus = (status: string) => {
    const labels: Record<string, string> = {
      Pending: t("purchases.status.pending"),
      Processing: t("purchases.status.processing"),
      Paid: t("purchases.status.paid"),
      Failed: t("purchases.status.failed"),
      Cancelled: t("purchases.status.cancelled"),
      Refunded: t("purchases.status.refunded"),
      PartiallyRefunded: t("purchases.status.partiallyRefunded"),
      Chargeback: t("purchases.status.chargeback"),
    };
    return labels[status] ?? status;
  };
  const formatAmount = (amount: number, currency: string) =>
    formatLocalizedCurrency(amount, currency, locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const labelForSource = (purpose: string) => {
    const labels: Record<string, string> = {
      CourseCart: t("purchases.purpose.coursePurchase"),
      Membership: t("account.membershipKind"),
      CourseSubscription: t("account.subscriptionKind"),
      DirectEnrollment: t("purchases.sourcePurpose.directEnrollment"),
    };
    return labels[purpose] ?? purpose;
  };
  const labelForCreditStatus = (
    status: StudentIncludedEvaluationCredit["status"],
  ) => {
    const labels: Record<StudentIncludedEvaluationCredit["status"], string> = {
      Available: t("purchases.creditStatus.available"),
      Consumed: t("purchases.creditStatus.consumed"),
      Revoked: t("purchases.creditStatus.revoked"),
    };
    return labels[status];
  };
  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow={t("purchases.eyebrow")}
        title={t("purchases.title")}
        description={t("purchases.description")}
        actions={
          <Link
            href={`/${locale}/student/account`}
            className="focus-ring inline-flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-black text-foreground"
          >
            <UserRound size={18} aria-hidden="true" />
            {t("navigation.account")}
          </Link>
        }
      />
      <section
        className="card mt-6 p-5 sm:p-6"
        aria-labelledby="student-entitlements-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2
              id="student-entitlements-heading"
              className="text-xl font-black"
            >
              {t("purchases.courseAccessHeading")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              {t("purchases.courseAccessDescription")}
            </p>
          </div>
          <LockKeyhole size={22} className="text-primary" aria-hidden="true" />
        </div>
        {entitlements.isPending ? (
          <p className="mt-5 text-sm text-muted" aria-busy>
            {t("loading")}
          </p>
        ) : entitlements.isError || !entitlements.data ? (
          <p role="alert" className="mt-5 text-sm text-red-600">
            {t("purchases.courseAccessError")}
          </p>
        ) : entitlements.data.items.length ? (
          <div className="mt-5 grid gap-4">
            {entitlements.data.items.map((entitlement) => (
              <article
                key={entitlement.enrollmentId}
                className="rounded-2xl border border-border bg-muted/15 p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{entitlement.courseTitle}</p>
                    <p className="mt-1 text-xs text-muted">
                      {t("purchases.source")}{" "}
                      {labelForSource(entitlement.sourcePurpose)}
                    </p>
                    {entitlement.sourcePaymentId ? (
                      <p className="mt-1 break-all font-mono text-[11px] text-muted">
                        {entitlement.sourcePaymentId}
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">
                    {entitlement.accessType === "Permanent"
                      ? t("purchases.permanentAccess")
                      : t("purchases.timedAccess")}
                  </span>
                </div>
                {entitlement.accessEndsAtUtc ? (
                  <p className="mt-3 text-xs text-muted">
                    {t("purchases.accessEnds")}{" "}
                    {formatLocalizedDate(entitlement.accessEndsAtUtc, locale)}
                  </p>
                ) : null}
                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-sm font-black">
                    {t("purchases.includedCredits")}
                  </p>
                  {entitlement.includedEvaluationCredits.length ? (
                    <div className="mt-3 grid gap-2">
                      {entitlement.includedEvaluationCredits.map((credit) => (
                        <div
                          key={credit.unitDefinitionId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold">
                              {credit.unitCode} · {credit.unitTitle}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-black ${
                              credit.status === "Available"
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : credit.status === "Revoked"
                                  ? "bg-red-500/10 text-red-700 dark:text-red-300"
                                  : "bg-muted text-muted"
                            }`}
                          >
                            {labelForCreditStatus(credit.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted">
                      {t("purchases.creditsEmpty")}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted">
            {t("purchases.courseAccessEmpty")}
          </p>
        )}
      </section>
      {purchases.isPending ? (
        <div className="card mt-6 p-6" aria-busy>
          {t("loading")}
        </div>
      ) : purchases.isError || !purchases.data ? (
        <p role="alert" className="card mt-6 p-6 text-red-600">
          {t("purchases.loadError")}
        </p>
      ) : purchases.data.items.length ? (
        <>
          <div className="mt-6 grid gap-4">
            {purchases.data.items.map((payment) => (
              <article key={payment.id} className="card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-black">
                      {labelForPurpose(payment.purpose)}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {formatLocalizedDateTime(
                        payment.paidAtUtc ?? payment.createdAtUtc,
                        locale,
                      )}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-xl font-black text-primary">
                      {formatAmount(payment.total, payment.currency)}
                    </p>
                    <span className="mt-1 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">
                      {labelForStatus(payment.status)}
                    </span>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
                  <div>
                    <span className="text-muted">
                      {t("purchases.paymentMethod")}
                    </span>
                    <p className="mt-1 font-bold">{payment.method}</p>
                  </div>
                  <div>
                    <span className="text-muted">
                      {t("purchases.discount")}
                    </span>
                    <p className="mt-1 font-bold">
                      {formatAmount(payment.discount, payment.currency)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted">
                      {t("purchases.reference")}
                    </span>
                    <p className="mt-1 break-all font-mono text-xs font-bold">
                      {payment.id}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {purchases.data.totalCount > purchases.data.pageSize ? (
            <nav
              className="mt-6 flex items-center justify-center gap-3"
              aria-label={t("purchases.pages")}
            >
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="focus-ring rounded-xl border border-border px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                {t("purchases.previous")}
              </button>
              <span className="text-sm text-muted">
                {purchases.data.page} /{" "}
                {Math.ceil(purchases.data.totalCount / purchases.data.pageSize)}
              </span>
              <button
                type="button"
                disabled={
                  page * purchases.data.pageSize >= purchases.data.totalCount
                }
                onClick={() => setPage((current) => current + 1)}
                className="focus-ring rounded-xl border border-border px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                {t("purchases.next")}
              </button>
            </nav>
          ) : null}
        </>
      ) : (
        <div className="card mt-6 p-6 text-center">
          <CreditCard className="mx-auto text-primary" aria-hidden="true" />
          <h2 className="mt-3 text-xl font-black">
            {t("purchases.emptyHeading")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {t("purchases.emptyDescription")}
          </p>
          <Link
            href={`/${locale}/courses`}
            className="focus-ring mt-4 inline-flex font-black text-primary"
          >
            {t("purchases.exploreCourses")}
          </Link>
        </div>
      )}
    </section>
  );
}

type LearningOverview = {
  pendingActions: StudentPendingAction[];
  notes: {
    id: string;
    lessonId: string;
    courseId: string;
    lessonTitle: string;
    body: string;
    updatedAtUtc: string;
  }[];
  bookmarks: {
    id: string;
    lessonId: string;
    courseId: string;
    lessonTitle: string;
  }[];
  calendar: {
    id: string;
    personalEntryId?: string;
    title: string;
    details?: string;
    startsAtUtc: string;
    endsAtUtc?: string;
    isLiveSession: boolean;
    eventType: "Personal" | "LiveSession" | "Assignment";
  }[];
  certificates: {
    verificationCode: string;
    title: string;
    issuedAtUtc: string;
  }[];
  upcomingAssignments: {
    id: string;
    courseId: string;
    lessonId?: string;
    title: string;
    courseTitle: string;
    dueAtUtc: string;
    submissionStatus?: string;
  }[];
  unreadNotifications: number;
  achievements: {
    code: string;
    title: string;
    description: string;
    currentValue: number;
    targetValue: number;
    isCompleted: boolean;
  }[];
};

type StudentPendingAction = {
  evaluationRequestId: string;
  originalEvaluationRequestId: string | null;
  authorizationId: string | null;
  occurredAtUtc: string;
  academic: AssessmentAcademicSummary | null;
} & (
  | { kind: "EvaluationRevision"; effectiveDueAtUtc: string | null }
  | {
      kind: "ResitAuthorized" | "ResitDraft" | "EvaluationDraft";
      effectiveDueAtUtc: null;
    }
);

function LearningOrganizer({
  initialTab,
}: {
  initialTab: "planner" | "notes" | "bookmarks" | "certificates";
}) {
  const t = useTranslations("studentWorkspace");
  const locale = useLocale();
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [calendarView, setCalendarView] = useState<"month" | "week" | "day">(
    "month",
  );
  const calendarViewLabels = {
    month: t("organizer.calendar.month"),
    week: t("organizer.calendar.week"),
    day: t("organizer.calendar.day"),
  } as const;
  const overview = useQuery({
    queryKey: ["student-learning-overview", locale],
    queryFn: () =>
      api<LearningOverview>(`/student-tools/overview?locale=${locale}`),
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["student-learning-overview"] });
  const addCalendar = useMutation({
    mutationFn: () =>
      api("/student-tools/calendar", {
        method: "POST",
        body: JSON.stringify({
          title,
          details,
          startsAtUtc: new Date(startsAt).toISOString(),
          endsAtUtc: null,
        }),
      }),
    onSuccess: () => {
      setTitle("");
      setDetails("");
      setStartsAt("");
      refresh();
    },
  });
  const removeCalendar = useMutation({
    mutationFn: (id: string) =>
      api(`/student-tools/calendar/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const heading =
    initialTab === "planner"
      ? t("dashboard.quickLinks.plannerTitle")
      : initialTab === "notes"
        ? t("dashboard.quickLinks.notesTitle")
        : initialTab === "bookmarks"
          ? t("organizer.bookmarksTitle")
          : t("dashboard.quickLinks.certificatesTitle");
  if (overview.isPending)
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          {t("loading")}
        </div>
      </section>
    );
  if (overview.isError || !overview.data)
    return (
      <section className="shell py-10">
        <p className="card p-6">{t("organizer.loadError")}</p>
      </section>
    );
  const data = overview.data;
  const displayedCalendar = calendarEntriesForView(data.calendar, calendarView);
  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow={t("organizer.eyebrow")}
        title={heading}
        description={t("organizer.description")}
      />
      {initialTab === "planner" ? (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              addCalendar.mutate();
            }}
            className="card mt-6 grid gap-3 p-5 md:grid-cols-[1fr_1fr_auto]"
          >
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={180}
              className="rounded-xl border border-border bg-surface-solid px-3 py-2"
              placeholder={t("organizer.titlePlaceholder")}
            />
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              required
              className="rounded-xl border border-border bg-surface-solid px-3 py-2"
            />
            <button
              disabled={addCalendar.isPending}
              className="focus-ring rounded-xl bg-primary px-4 py-2 font-black text-slate-950"
            >
              {t("organizer.add")}
            </button>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={1000}
              className="min-h-20 rounded-xl border border-border bg-surface-solid px-3 py-2 md:col-span-3"
              placeholder={t("organizer.detailsPlaceholder")}
            />
          </form>
          <div
            className="mt-5 flex flex-wrap gap-2"
            role="group"
            aria-label={t("organizer.calendarView")}
          >
            {(["month", "week", "day"] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setCalendarView(view)}
                aria-pressed={calendarView === view}
                className={`focus-ring rounded-lg border px-3 py-2 text-sm font-bold ${calendarView === view ? "border-primary bg-primary text-slate-950" : "border-border text-muted"}`}
              >
                {calendarViewLabels[view]}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-3">
            {displayedCalendar.length ? (
              displayedCalendar.map((entry) => (
                <article
                  key={entry.id}
                  className="card flex flex-wrap items-center justify-between gap-4 p-5"
                >
                  <div>
                    <p className="font-black">{entry.title}</p>
                    {entry.details ? (
                      <p className="mt-1 text-sm text-muted">{entry.details}</p>
                    ) : null}
                    <p className="mt-2 text-xs font-bold text-primary">
                      {formatLocalizedDateTime(entry.startsAtUtc, locale)}
                    </p>
                  </div>
                  {entry.eventType === "LiveSession" ? (
                    <Link
                      href={`/${locale}/live`}
                      className="focus-ring rounded-lg border border-border px-3 py-2 text-sm font-bold text-primary"
                    >
                      {t("organizer.openSession")}
                    </Link>
                  ) : entry.personalEntryId ? (
                    <button
                      type="button"
                      onClick={() =>
                        removeCalendar.mutate(entry.personalEntryId!)
                      }
                      className="focus-ring rounded-lg border border-red-500/40 px-3 py-2 text-sm font-bold text-red-400"
                    >
                      {t("organizer.delete")}
                    </button>
                  ) : (
                    <Link
                      href={`/${locale}/student/courses`}
                      className="focus-ring rounded-lg border border-border px-3 py-2 text-sm font-bold text-primary"
                    >
                      {t("organizer.openAssignment")}
                    </Link>
                  )}
                </article>
              ))
            ) : (
              <p className="card p-5 text-muted">{t("organizer.noDates")}</p>
            )}
          </div>
        </>
      ) : null}
      {initialTab === "notes" ? (
        <div className="mt-6 grid gap-3">
          {data.notes.length ? (
            data.notes.map((note) => (
              <Link
                key={note.id}
                href={`/${locale}/student/learn/${note.courseId}`}
                className="card focus-ring block p-5"
              >
                <p className="font-black">{note.lessonTitle}</p>
                <p className="mt-2 whitespace-pre-line text-sm text-muted">
                  {note.body}
                </p>
              </Link>
            ))
          ) : (
            <p className="card p-5 text-muted">{t("organizer.notesEmpty")}</p>
          )}
        </div>
      ) : null}
      {initialTab === "bookmarks" ? (
        <div className="mt-6 grid gap-3">
          {data.bookmarks.length ? (
            data.bookmarks.map((bookmark) => (
              <Link
                key={bookmark.id}
                href={`/${locale}/student/learn/${bookmark.courseId}`}
                className="card focus-ring flex items-center gap-3 p-5"
              >
                <Bookmark className="text-primary" aria-hidden="true" />
                <span className="font-black">{bookmark.lessonTitle}</span>
              </Link>
            ))
          ) : (
            <p className="card p-5 text-muted">
              {t("organizer.bookmarksEmpty")}
            </p>
          )}
        </div>
      ) : null}
      {initialTab === "certificates" ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {data.certificates.length ? (
            data.certificates.map((certificate) => (
              <article key={certificate.verificationCode} className="card p-6">
                <FileBadge className="text-primary" aria-hidden="true" />
                <h2 className="mt-4 text-xl font-black">{certificate.title}</h2>
                <p className="mt-2 text-sm text-muted">
                  {t("organizer.verificationCode")}{" "}
                  {certificate.verificationCode}
                </p>
                <Link
                  href={`/${locale}/student/certificates/${certificate.verificationCode}`}
                  className="focus-ring mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950"
                >
                  {t("organizer.viewCertificate")}
                </Link>
              </article>
            ))
          ) : (
            <p className="card p-5 text-muted">
              {t("organizer.certificatesEmpty")}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function calendarEntriesForView(
  entries: LearningOverview["calendar"],
  view: "month" | "week" | "day",
) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  if (view === "month") {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 1);
  } else if (view === "week") {
    end.setDate(end.getDate() + 7);
  } else {
    end.setDate(end.getDate() + 1);
  }
  return entries.filter((entry) => {
    const date = new Date(entry.startsAtUtc);
    return date >= start && date < end;
  });
}

type CertificateDetail = {
  studentName: string;
  courseTitle: string;
  issuedAtUtc: string;
  verificationCode: string;
};

function CertificateDocument({
  verificationCode,
}: {
  verificationCode: string;
}) {
  const locale = useLocale();
  const certificate = useQuery({
    queryKey: ["my-certificate", verificationCode, locale],
    queryFn: () =>
      api<CertificateDetail>(
        `/student-tools/my-certificates/${encodeURIComponent(verificationCode)}?locale=${locale}`,
      ),
  });
  if (certificate.isPending)
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          …
        </div>
      </section>
    );
  if (certificate.isError || !certificate.data)
    return (
      <section className="shell py-10">
        <p className="card p-6" role="alert">
          {locale === "ar"
            ? "تعذّر العثور على الشهادة أو لا تملك صلاحية عرضها."
            : "The certificate could not be found, or you do not have permission to view it."}
        </p>
      </section>
    );
  const issuedOn = formatLocalizedDate(certificate.data.issuedAtUtc, locale, {
    dateStyle: "long",
  });
  return (
    <section className="shell py-10">
      <div className="certificate-print-actions mb-5 flex flex-wrap justify-between gap-3">
        <Link
          href={`/${locale}/student/certificates`}
          className="focus-ring inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-black text-muted hover:text-foreground"
        >
          <ArrowLeft size={17} aria-hidden="true" />
          {locale === "ar" ? "شهاداتي" : "My certificates"}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="focus-ring inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950"
        >
          <FileBadge size={17} aria-hidden="true" />
          {locale === "ar" ? "طباعة الشهادة" : "Print certificate"}
        </button>
      </div>
      <article className="certificate-document relative overflow-hidden rounded-[2rem] border-[10px] border-primary/75 bg-white p-8 text-center text-[#0d1b2a] shadow-2xl sm:p-12">
        <span className="absolute inset-4 rounded-[1.4rem] border border-[#1b4f72]/35" />
        <span className="absolute -start-20 -top-20 size-56 rounded-full bg-[#21c1a6]/15" />
        <span className="absolute -bottom-24 -end-20 size-72 rounded-full bg-[#1b4f72]/10" />
        <div className="relative mx-auto max-w-3xl">
          <p className="text-sm font-black tracking-[0.24em] text-[#1b4f72]">
            BETCCO
          </p>
          <div className="mx-auto mt-4 grid size-16 place-items-center rounded-2xl bg-[#1b4f72] text-white shadow-lg">
            <FileBadge size={32} aria-hidden="true" />
          </div>
          <p className="mt-6 text-sm font-bold uppercase tracking-[0.16em] text-[#1b4f72]">
            {locale === "ar" ? "شهادة إكمال" : "Certificate of Completion"}
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">
            {certificate.data.studentName}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-8 text-[#31596f] sm:text-lg">
            {locale === "ar"
              ? "أتم بنجاح متطلبات التعلّم الأساسية في الدورة التالية على منصة BETCCO:"
              : "has successfully completed the core learning requirements for the following BETCCO course:"}
          </p>
          <h2 className="mt-5 text-2xl font-black text-[#1b4f72] sm:text-3xl">
            {certificate.data.courseTitle}
          </h2>
          <div className="mx-auto mt-9 grid max-w-lg gap-4 border-y border-[#1b4f72]/20 py-5 text-sm sm:grid-cols-2">
            <div>
              <p className="font-bold text-[#31596f]">
                {locale === "ar" ? "تاريخ الإصدار" : "Issue date"}
              </p>
              <p className="mt-1 font-black">{issuedOn}</p>
            </div>
            <div>
              <p className="font-bold text-[#31596f]">
                {locale === "ar" ? "رقم الشهادة" : "Certificate ID"}
              </p>
              <p
                dir="ltr"
                className="mt-1 break-all font-mono text-xs font-black"
              >
                {certificate.data.verificationCode}
              </p>
            </div>
          </div>
          <div className="mx-auto mt-6 grid w-fit justify-items-center gap-2 rounded-xl border border-[#1b4f72]/20 bg-white p-3 print:border-0">
            <img
              src={`/api/v1/student-tools/certificates/${encodeURIComponent(certificate.data.verificationCode)}/qr`}
              alt={
                locale === "ar"
                  ? "رمز QR للتحقق من الشهادة"
                  : "Certificate verification QR code"
              }
              width={120}
              height={120}
              className="size-28"
            />
            <p className="max-w-36 text-center text-[10px] font-bold text-[#31596f]">
              {locale === "ar"
                ? "امسح الرمز للتحقق من الشهادة"
                : "Scan to verify this certificate"}
            </p>
          </div>
          <p className="mt-7 text-xs leading-5 text-[#496679]">
            {locale === "ar"
              ? "هذه شهادة إكمال صادرة من BETCCO وليست شهادة Pearson أو اعتمادًا رسميًا من Pearson BTEC."
              : "This is a BETCCO completion certificate. It is not a Pearson certificate or official Pearson BTEC accreditation."}
          </p>
        </div>
      </article>
    </section>
  );
}

type StudentCoursePlayerLesson = {
  id: string;
  title: string;
  body?: string | null;
  durationSeconds: number;
  type: string;
  isLocked: boolean;
  lockReason?: string;
  availableAtUtc?: string;
  video?: {
    id: string;
    displayName: string;
    contentType: string;
  } | null;
  resources: {
    id: string;
    displayName: string;
    contentType: string;
    externalUrl?: string;
  }[];
  isCompleted: boolean;
  lastPositionSeconds: number;
  lastVisitedAtUtc?: string | null;
};

type StudentCoursePlayerResult = {
  id: string;
  title: string;
  resumeLessonId?: string | null;
  currentLessonId?: string | null;
  previousLessonId?: string | null;
  nextLessonId?: string | null;
  requestedLessonRejected: boolean;
  modules: {
    id: string;
    title: string;
    isLocked: boolean;
    lockReason?: string;
    availableAtUtc?: string;
    lessons: StudentCoursePlayerLesson[];
  }[];
};

type StudentLessonProgressResult = {
  isCompleted: boolean;
  lastPositionSeconds: number;
  lastVisitedAtUtc: string;
};

function CoursePlayer({
  courseId,
  requestedLessonId,
}: {
  courseId: string;
  requestedLessonId?: string;
}) {
  const t = useTranslations("studentWorkspace");
  const locale = useLocale();
  const client = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const result = useQuery({
    queryKey: ["player", courseId, locale, requestedLessonId],
    queryFn: () => {
      const params = new URLSearchParams({ locale });
      if (requestedLessonId) params.set("lessonId", requestedLessonId);
      return api<StudentCoursePlayerResult>(
        `/learning/courses/${courseId}/player?${params.toString()}`,
      );
    },
  });
  const progress = useMutation({
    mutationFn: (request: {
      lessonId: string;
      lastPositionSeconds: number;
      markCompleted: boolean;
    }) =>
      api<StudentLessonProgressResult>(
        `/learning/lessons/${request.lessonId}/progress`,
        {
          method: "POST",
          body: JSON.stringify({
            lastPositionSeconds: request.lastPositionSeconds,
            markCompleted: request.markCompleted,
          }),
        },
      ),
    onSuccess: (saved, request) => {
      client.setQueriesData<StudentCoursePlayerResult>(
        { queryKey: ["player", courseId] },
        (current) =>
          current
            ? {
                ...current,
                modules: current.modules.map((module) => ({
                  ...module,
                  lessons: module.lessons.map((lesson) =>
                    lesson.id === request.lessonId
                      ? {
                          ...lesson,
                          isCompleted: saved.isCompleted,
                          lastPositionSeconds: saved.lastPositionSeconds,
                          lastVisitedAtUtc: saved.lastVisitedAtUtc,
                        }
                      : lesson,
                  ),
                })),
              }
            : current,
      );
      if (request.markCompleted) {
        void client.invalidateQueries({ queryKey: ["player", courseId] });
        void client.invalidateQueries({
          queryKey: ["learning-aim-practice", courseId],
        });
        void client.invalidateQueries({
          queryKey: ["student-courses-learning-hub"],
        });
      }
    },
  });
  const certificate = useMutation({
    mutationFn: () =>
      api<{ verificationCode: string }>(
        `/student-tools/courses/${courseId}/certificates`,
        { method: "POST" },
      ),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["student-learning-overview"] }),
  });
  const lockedMessage = (reason?: string, availableAtUtc?: string) => {
    if (reason === "AvailableOnDate" || reason === "AvailableAfterEnrollment")
      return t("coursePlayer.lockedOnDate", {
        date: formatLocalizedDateTime(availableAtUtc, locale),
      });
    return t("coursePlayer.lockedPrerequisite");
  };
  if (result.isPending)
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          {t("loading")}
        </div>
      </section>
    );
  if (result.isError || !result.data)
    return (
      <section className="shell py-10">
        <p className="card p-6">{t("coursePlayer.noAccess")}</p>
      </section>
    );
  const visibleModules = result.data.modules.map((module) => ({
    ...module,
    lessons: module.lessons.filter((item) => item.type !== "LegacyArchived"),
  }));
  const allLessons = visibleModules.flatMap((module) => module.lessons);
  const lesson = allLessons.find(
    (item) => item.id === result.data.currentLessonId,
  );
  const previousLesson = allLessons.find(
    (item) => item.id === result.data.previousLessonId,
  );
  const nextLesson = allLessons.find(
    (item) => item.id === result.data.nextLessonId,
  );
  const lessonHref = (lessonId: string) =>
    `/${locale}/student/learn/${courseId}?lessonId=${encodeURIComponent(lessonId)}`;
  return (
    <section
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={`shell grid gap-6 py-10 ${sidebarOpen ? "lg:grid-cols-[minmax(0,1fr)_340px]" : "lg:grid-cols-1"}`}
    >
      <div className="card p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
              {t("coursePlayer.eyebrow")}
            </p>
            <h1 className="mt-2 text-3xl font-black">{result.data.title}</h1>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/5 px-3 py-2 text-xs font-bold text-muted">
            <ListVideo size={15} aria-hidden="true" />
            {result.data.modules.length} {t("coursePlayer.modules")}
          </span>
          <button
            type="button"
            onClick={() => setSidebarOpen((value) => !value)}
            className="focus-ring inline-flex items-center gap-2 rounded-xl border border-border bg-white/5 px-3 py-2 text-sm font-bold text-muted hover:bg-primary/10 hover:text-primary"
            aria-expanded={sidebarOpen}
            aria-controls="player-course-content"
          >
            {sidebarOpen ? (
              <PanelRightClose size={17} aria-hidden="true" />
            ) : (
              <PanelRightOpen size={17} aria-hidden="true" />
            )}
            {sidebarOpen
              ? t("coursePlayer.hideContent")
              : t("coursePlayer.showContent")}
          </button>
        </div>
        {result.data.requestedLessonRejected ? (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200"
          >
            {t("coursePlayer.requestedLessonUnavailable")}
          </p>
        ) : null}
        <StudentProgressIntelligence courseId={courseId} />
        <StudentLearningAimPractice courseId={courseId} />
        <StudentComprehensivePractice courseId={courseId} />
        {lesson ? (
          <>
            {lesson.video && !lesson.isLocked ? (
              <LessonVideo
                key={`video-${lesson.id}`}
                lesson={lesson}
                savePending={progress.isPending}
                onSave={(lastPositionSeconds, markCompleted) =>
                  progress.mutate({
                    lessonId: lesson.id,
                    lastPositionSeconds,
                    markCompleted,
                  })
                }
              />
            ) : (
              <div className="relative mt-6 aspect-video overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_75%_20%,rgba(38,211,199,.22),transparent_30%),linear-gradient(135deg,#101e42,#080f24)] p-6 text-white shadow-2xl sm:p-8">
                <span className="absolute -end-14 -top-14 size-48 rounded-full border border-primary/25" />
                <span className="relative grid size-12 place-items-center rounded-2xl bg-primary text-slate-950 shadow-lg">
                  <PlayCircle size={25} aria-hidden="true" />
                </span>
                <p className="relative mt-8 text-xl font-black">
                  {lesson.title}
                </p>
                <p className="relative mt-2 flex items-center gap-2 text-sm text-slate-300">
                  <Timer size={15} aria-hidden="true" />
                  {lesson.type} · {Math.round(lesson.durationSeconds / 60)}{" "}
                  {t("coursePlayer.minutes")}
                </p>
                <p className="relative mt-8 max-w-md whitespace-pre-wrap text-sm leading-6 text-slate-300">
                  {lesson.isLocked
                    ? lockedMessage(lesson.lockReason, lesson.availableAtUtc)
                    : lesson.body || t("coursePlayer.noLessonText")}
                </p>
              </div>
            )}
            {lesson.video && lesson.body && !lesson.isLocked ? (
              <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-muted">
                {lesson.body}
              </p>
            ) : null}
            {lesson.resources.length ? (
              <div className="mt-5 rounded-2xl border border-border bg-surface-solid/55 p-4">
                <h2 className="font-black">{t("coursePlayer.lessonFiles")}</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {lesson.resources.map((resource) => (
                    <a
                      key={resource.id}
                      href={
                        resource.externalUrl ||
                        `/api/v1/learning/lessons/${lesson.id}/resources/${resource.id}`
                      }
                      target={resource.externalUrl ? "_blank" : undefined}
                      rel={resource.externalUrl ? "noreferrer" : undefined}
                      className="focus-ring inline-flex items-center gap-2 rounded-xl border border-primary/35 px-3 py-2 text-sm font-bold text-primary hover:bg-primary/10"
                    >
                      <FileBadge size={16} aria-hidden="true" />
                      {resource.displayName}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
            <CourseResourceCenter courseId={courseId} />
            <CourseAnnouncementsPanel courseId={courseId} />
            <button
              type="button"
              onClick={() =>
                progress.mutate({
                  lessonId: lesson.id,
                  lastPositionSeconds: lesson.lastPositionSeconds,
                  markCompleted: true,
                })
              }
              disabled={
                progress.isPending ||
                lesson.isLocked ||
                lesson.isCompleted ||
                lesson.type === "Video"
              }
              className="focus-ring mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-slate-950"
            >
              <CircleCheckBig size={18} aria-hidden="true" />
              {lesson.isCompleted
                ? t("coursePlayer.completed")
                : lesson.type === "Video"
                  ? t("coursePlayer.videoCompletion")
                  : t("coursePlayer.markComplete")}
            </button>
            <button
              type="button"
              onClick={() => certificate.mutate()}
              disabled={certificate.isPending}
              className="focus-ring ms-3 mt-5 inline-flex items-center gap-2 rounded-xl border border-primary/50 px-4 py-3 font-bold text-primary hover:bg-primary/10"
            >
              <FileBadge size={18} aria-hidden="true" />
              {t("coursePlayer.issueCertificate")}
            </button>
            {certificate.data ? (
              <p role="status" className="mt-3 text-sm text-primary">
                {t("coursePlayer.certificateIssued")}{" "}
                {certificate.data.verificationCode}
              </p>
            ) : null}
            {certificate.isError ? (
              <p role="alert" className="mt-3 text-sm text-red-400">
                {certificate.error instanceof Error
                  ? certificate.error.message
                  : t("coursePlayer.completeLessonsFirst")}
              </p>
            ) : null}
            {progress.isSuccess ? (
              <p role="status" className="mt-3 text-sm text-primary">
                {t("coursePlayer.progressSaved")}
              </p>
            ) : null}
            {progress.isError ? (
              <p role="alert" className="mt-3 text-sm text-red-400">
                {t("coursePlayer.progressSaveError")}
              </p>
            ) : null}
            <MotivationCard variant="player" className="mt-5" />
            <StudentCourseGradebookPanel courseId={courseId} />
            <LessonWorkspace
              key={lesson.id}
              courseId={courseId}
              lessonId={lesson.id}
            />
            <AiTutorPanel courseId={courseId} lessonId={lesson.id} />
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              {previousLesson ? (
                <Link
                  href={lessonHref(previousLesson.id)}
                  className="focus-ring inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2.5 text-sm font-bold text-muted hover:bg-white/5"
                >
                  <ArrowLeft
                    size={16}
                    className="rtl:rotate-180"
                    aria-hidden="true"
                  />
                  {t("coursePlayer.previousLesson")}
                </Link>
              ) : (
                <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-xl border border-border px-3 py-2.5 text-sm font-bold text-muted opacity-40">
                  <ArrowLeft
                    size={16}
                    className="rtl:rotate-180"
                    aria-hidden="true"
                  />
                  {t("coursePlayer.previousLesson")}
                </span>
              )}
              {nextLesson ? (
                <Link
                  href={lessonHref(nextLesson.id)}
                  className="focus-ring inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-black text-slate-950"
                >
                  {t("coursePlayer.nextLesson")}
                  <ArrowRight
                    size={16}
                    className="rtl:rotate-180"
                    aria-hidden="true"
                  />
                </Link>
              ) : (
                <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-black text-slate-950 opacity-40">
                  {t("coursePlayer.nextLesson")}
                  <ArrowRight
                    size={16}
                    className="rtl:rotate-180"
                    aria-hidden="true"
                  />
                </span>
              )}
            </div>
            {lesson.type === "Assignment" ? (
              <>
                <CourseAssignmentPanel
                  courseId={courseId}
                  lessonId={lesson.id}
                />
                <Link
                  className="focus-ring mt-4 inline-block rounded-xl border border-primary/40 px-4 py-3 text-sm font-bold text-primary"
                  href={`/${locale}/student/evaluations/new`}
                >
                  {t("coursePlayer.evaluateAssignment")}
                </Link>
              </>
            ) : null}
          </>
        ) : (
          <p className="mt-5 text-muted">
            {t("coursePlayer.noPublishedLesson")}
          </p>
        )}
      </div>
      <aside
        id="player-course-content"
        className={`card h-fit p-4 lg:sticky lg:top-24 ${sidebarOpen ? "block" : "hidden"}`}
      >
        <h2 className="flex items-center gap-2 font-black">
          <ListVideo size={18} className="text-primary" aria-hidden="true" />
          {t("coursePlayer.courseContent")}
        </h2>
        <div className="mt-3 space-y-4">
          {visibleModules.map((module) => (
            <div key={module.id}>
              <p className="text-sm font-bold">{module.title}</p>
              <div className="mt-2 grid gap-1">
                {module.lessons.map((item) =>
                  item.isLocked ? (
                    <button
                      key={item.id}
                      type="button"
                      disabled
                      title={lockedMessage(
                        item.lockReason,
                        item.availableAtUtc,
                      )}
                      className="focus-ring flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-start text-sm text-muted opacity-55 disabled:cursor-not-allowed"
                    >
                      <span>{item.title}</span>
                      <LockKeyhole size={14} aria-hidden="true" />
                    </button>
                  ) : (
                    <Link
                      key={item.id}
                      href={lessonHref(item.id)}
                      aria-current={lesson?.id === item.id ? "page" : undefined}
                      className={`focus-ring flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-start text-sm transition-colors motion-reduce:transition-none ${lesson?.id === item.id ? "bg-primary/15 font-bold text-primary" : "text-muted hover:bg-white/5 hover:text-foreground"}`}
                    >
                      <span>{item.title}</span>
                      {item.isCompleted ? (
                        <CircleCheckBig
                          size={15}
                          className="shrink-0 text-emerald-400"
                          aria-label={t("coursePlayer.completed")}
                        />
                      ) : null}
                    </Link>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}

function LessonVideo({
  lesson,
  savePending,
  onSave,
}: {
  lesson: StudentCoursePlayerLesson;
  savePending: boolean;
  onSave: (lastPositionSeconds: number, markCompleted: boolean) => void;
}) {
  const t = useTranslations("studentWorkspace");
  const lastSubmittedPosition = useRef(lesson.lastPositionSeconds);
  const lastSubmittedAt = useRef(0);
  const [playbackState, setPlaybackState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [retryCount, setRetryCount] = useState(0);

  const save = (
    video: HTMLVideoElement,
    options: { force?: boolean; complete?: boolean } = {},
  ) => {
    if (savePending) return;
    const position = Math.max(0, Math.floor(video.currentTime || 0));
    const now = Date.now();
    const completionReached =
      !lesson.isCompleted &&
      lesson.durationSeconds > 0 &&
      position >= Math.floor(lesson.durationSeconds * 0.8);
    const markCompleted = Boolean(options.complete || completionReached);
    if (markCompleted && lesson.isCompleted) return;
    if (!markCompleted && !options.force) {
      if (
        now - lastSubmittedAt.current < 15_000 ||
        Math.abs(position - lastSubmittedPosition.current) < 15
      )
        return;
    }
    if (
      !markCompleted &&
      options.force &&
      (now - lastSubmittedAt.current < 5_000 ||
        Math.abs(position - lastSubmittedPosition.current) < 5)
    )
      return;

    lastSubmittedPosition.current = position;
    lastSubmittedAt.current = now;
    onSave(position, markCompleted);
  };

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
      <video
        key={retryCount}
        controls
        preload="metadata"
        className="aspect-video w-full"
        aria-label={t("lessonVideo.accessibleLabel", { title: lesson.title })}
        src={`/api/v1/learning/lessons/${lesson.id}/video?retry=${retryCount}`}
        onCanPlay={() => setPlaybackState("ready")}
        onWaiting={() => setPlaybackState("loading")}
        onError={() => setPlaybackState("error")}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          const mediaDuration =
            Number.isFinite(video.duration) && video.duration > 0
              ? video.duration
              : lesson.durationSeconds;
          const safeMaximum = Math.max(0, mediaDuration - 1);
          video.currentTime = Math.min(
            Math.max(0, lesson.lastPositionSeconds),
            safeMaximum,
          );
        }}
        onTimeUpdate={(event) => save(event.currentTarget)}
        onPause={(event) => save(event.currentTarget, { force: true })}
        onEnded={(event) =>
          save(event.currentTarget, { force: true, complete: true })
        }
      >
        {t("lessonVideo.unsupported")}
      </video>
      {playbackState === "loading" ? (
        <p role="status" className="px-4 py-2 text-sm text-slate-300">
          {t("lessonVideo.loading")}
        </p>
      ) : null}
      {playbackState === "error" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm text-white"
        >
          <span>{t("lessonVideo.unavailable")}</span>
          <button
            type="button"
            className="focus-ring rounded-lg border border-white/40 px-3 py-1.5 font-bold"
            onClick={() => {
              setPlaybackState("loading");
              setRetryCount((count) => count + 1);
            }}
          >
            {t("lessonVideo.retry")}
          </button>
        </div>
      ) : null}
      <div className="border-t border-white/10 bg-[#0b1735] px-4 py-3 text-white">
        <p className="font-black">{lesson.title}</p>
        <p className="mt-1 flex items-center gap-2 text-xs text-slate-300">
          <Timer size={14} aria-hidden="true" />
          {lesson.video?.displayName} ·{" "}
          {Math.round(lesson.durationSeconds / 60)} {t("lessonVideo.minutes")}
        </p>
      </div>
    </div>
  );
}

function CourseAnnouncementsPanel({ courseId }: { courseId: string }) {
  const t = useTranslations("studentWorkspace");
  const locale = useLocale();
  const announcements = useQuery({
    queryKey: ["student-course-announcements", courseId, locale],
    queryFn: () =>
      api<
        {
          id: string;
          title: string;
          body: string;
          unitTitle?: string;
          publishedAtUtc?: string;
        }[]
      >(`/student-tools/courses/${courseId}/announcements?locale=${locale}`),
  });
  const items = announcements.data ?? [];
  if (announcements.isPending || (!announcements.isError && !items.length))
    return null;
  return (
    <section className="mt-5 rounded-2xl border border-primary/25 bg-primary/5 p-4">
      <h2 className="flex items-center gap-2 font-black">
        <MessageSquareText
          size={18}
          className="text-primary"
          aria-hidden="true"
        />
        {t("announcements.title")}
      </h2>
      {announcements.isError ? (
        <p className="mt-2 text-sm text-muted">
          {t("announcements.loadError")}
        </p>
      ) : (
        <div className="mt-3 grid gap-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-border bg-surface-solid/60 p-3"
            >
              <p className="font-black">{item.title}</p>
              {item.unitTitle ? (
                <p className="mt-1 text-xs font-bold text-primary">
                  {item.unitTitle}
                </p>
              ) : null}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
                {item.body}
              </p>
              {item.publishedAtUtc ? (
                <p className="mt-2 text-xs text-muted">
                  {formatLocalizedDateTime(item.publishedAtUtc, locale)}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CourseResourceCenter({ courseId }: { courseId: string }) {
  const t = useTranslations("studentWorkspace");
  const locale = useLocale();
  const [category, setCategory] = useState("All");
  const resources = useQuery({
    queryKey: ["course-resource-center", courseId, locale],
    queryFn: () =>
      api<
        {
          id: string;
          lessonId: string;
          lessonTitle: string;
          displayName: string;
          contentType: string;
          externalUrl?: string;
          category: string;
        }[]
      >(`/learning/courses/${courseId}/resources?locale=${locale}`),
  });
  const items = resources.data ?? [];
  const categoryLabels: Record<string, string> = {
    All: t("resources.categories.all"),
    PDF: t("resources.categories.pdf"),
    PowerPoint: t("resources.categories.powerPoint"),
    Word: t("resources.categories.word"),
    Excel: t("resources.categories.excel"),
    Code: t("resources.categories.code"),
    Video: t("resources.categories.video"),
    ZIP: t("resources.categories.zip"),
    Link: t("resources.categories.link"),
    Other: t("resources.categories.other"),
  };
  const categories = ["All", ...new Set(items.map((item) => item.category))];
  const visible =
    category === "All"
      ? items
      : items.filter((item) => item.category === category);
  if (resources.isPending || (!resources.isError && !items.length)) return null;
  return (
    <section className="mt-5 rounded-2xl border border-border bg-surface-solid/55 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-black">
            <FolderOpen size={18} className="text-primary" aria-hidden="true" />
            {t("resources.title")}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {t("resources.description")}
          </p>
        </div>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
          aria-label={t("resources.filter")}
        >
          {categories.map((item) => (
            <option key={item} value={item}>
              {resourceCategoryLabel(item, categoryLabels)}
            </option>
          ))}
        </select>
      </div>
      {resources.isError ? (
        <p className="mt-3 text-sm text-muted">{t("resources.loadError")}</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {visible.map((resource) => (
            <a
              key={resource.id}
              href={
                resource.externalUrl ||
                `/api/v1/learning/lessons/${resource.lessonId}/resources/${resource.id}`
              }
              target={resource.externalUrl ? "_blank" : undefined}
              rel={resource.externalUrl ? "noreferrer" : undefined}
              className="focus-ring rounded-xl border border-border px-3 py-3 text-sm hover:border-primary/45"
            >
              <span className="block font-black text-primary">
                {resource.displayName}
              </span>
              <span className="mt-1 block text-xs text-muted">
                {resourceCategoryLabel(resource.category, categoryLabels)} ·{" "}
                {resource.lessonTitle}
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function resourceCategoryLabel(
  category: string,
  labels: Record<string, string>,
) {
  return labels[category] ?? category;
}

function LessonWorkspace({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
  const t = useTranslations("studentWorkspace");
  const locale = useLocale();
  const client = useQueryClient();
  const [note, setNote] = useState<string>();
  const [question, setQuestion] = useState("");
  const overview = useQuery({
    queryKey: ["student-learning-overview", locale],
    queryFn: () =>
      api<LearningOverview>(`/student-tools/overview?locale=${locale}`),
  });
  const questions = useQuery({
    queryKey: ["course-questions", courseId, locale],
    queryFn: () =>
      api<
        {
          id: string;
          lessonId?: string;
          body: string;
          isResolved: boolean;
          replies: { id: string; body: string; authorName: string }[];
        }[]
      >(`/course-community/courses/${courseId}/questions?locale=${locale}`),
  });
  const currentNote = overview.data?.notes.find(
    (item) => item.lessonId === lessonId,
  );
  const bookmarked = overview.data?.bookmarks.some(
    (item) => item.lessonId === lessonId,
  );
  const noteValue = note ?? currentNote?.body ?? "";
  const invalidateOverview = () =>
    client.invalidateQueries({ queryKey: ["student-learning-overview"] });
  const saveNote = useMutation({
    mutationFn: () =>
      api("/student-tools/notes", {
        method: "POST",
        body: JSON.stringify({ lessonId, body: noteValue }),
      }),
    onSuccess: invalidateOverview,
  });
  const deleteNote = useMutation({
    mutationFn: () =>
      api(`/student-tools/notes/${lessonId}`, { method: "DELETE" }),
    onSuccess: () => {
      setNote(undefined);
      invalidateOverview();
    },
  });
  const toggleBookmark = useMutation({
    mutationFn: () =>
      api(`/student-tools/bookmarks/${lessonId}`, {
        method: bookmarked ? "DELETE" : "POST",
      }),
    onSuccess: invalidateOverview,
  });
  const ask = useMutation({
    mutationFn: () =>
      api(`/course-community/courses/${courseId}/questions`, {
        method: "POST",
        body: JSON.stringify({ body: question, lessonId }),
      }),
    onSuccess: () => {
      setQuestion("");
      client.invalidateQueries({ queryKey: ["course-questions", courseId] });
    },
  });
  return (
    <section className="mt-6 grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-border bg-surface-solid/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-black">
            <StickyNote size={18} className="text-primary" aria-hidden="true" />
            {t("lessonWorkspace.privateNote")}
          </h2>
          <button
            type="button"
            onClick={() => toggleBookmark.mutate()}
            disabled={toggleBookmark.isPending || overview.isPending}
            className="focus-ring rounded-lg border border-border p-2 text-primary"
            aria-label={
              bookmarked
                ? t("lessonWorkspace.removeBookmark")
                : t("lessonWorkspace.saveBookmark")
            }
          >
            <Bookmark
              size={17}
              fill={bookmarked ? "currentColor" : "none"}
              aria-hidden="true"
            />
          </button>
        </div>
        <textarea
          value={noteValue}
          onChange={(event) => setNote(event.target.value)}
          maxLength={5000}
          className="mt-3 min-h-28 w-full rounded-xl border border-border bg-page/40 p-3 text-sm"
          placeholder={t("lessonWorkspace.notePlaceholder")}
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => saveNote.mutate()}
            disabled={saveNote.isPending || !noteValue.trim()}
            className="focus-ring rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950"
          >
            {t("lessonWorkspace.saveNote")}
          </button>
          {currentNote ? (
            <button
              type="button"
              onClick={() => deleteNote.mutate()}
              disabled={deleteNote.isPending}
              className="focus-ring rounded-xl border border-red-500/40 px-4 py-2 text-sm font-black text-red-400"
            >
              {t("lessonWorkspace.delete")}
            </button>
          ) : null}
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-surface-solid/70 p-4">
        <h2 className="flex items-center gap-2 font-black">
          <MessageSquareText
            size={18}
            className="text-secondary"
            aria-hidden="true"
          />
          {t("lessonWorkspace.askTeacher")}
        </h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            ask.mutate();
          }}
        >
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            required
            maxLength={2000}
            className="mt-3 min-h-24 w-full rounded-xl border border-border bg-page/40 p-3 text-sm"
            placeholder={t("lessonWorkspace.questionPlaceholder")}
          />
          <button
            disabled={ask.isPending}
            className="focus-ring mt-3 rounded-xl border border-secondary/50 px-4 py-2 text-sm font-black text-secondary hover:bg-secondary/10"
          >
            {t("lessonWorkspace.sendQuestion")}
          </button>
        </form>
        <div className="mt-4 grid gap-3">
          {questions.data
            ?.filter((item) => item.lessonId === lessonId)
            .map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-border/70 p-3 text-sm"
              >
                <p>{item.body}</p>
                {item.replies.map((reply) => (
                  <p
                    key={reply.id}
                    className="mt-2 border-s-2 border-primary/50 ps-3 text-muted"
                  >
                    <strong className="text-foreground">
                      {reply.authorName}:{" "}
                    </strong>
                    {reply.body}
                  </p>
                ))}
                {item.isResolved ? (
                  <span className="mt-2 inline-block text-xs font-black text-primary">
                    {t("lessonWorkspace.answered")}
                  </span>
                ) : null}
              </article>
            ))}
        </div>
      </div>
    </section>
  );
}

function AiTutorPanel({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
  const t = useTranslations("studentWorkspace");
  const [mode, setMode] = useState("Explain");
  const [message, setMessage] = useState("");
  const chat = useMutation({
    mutationFn: () =>
      api<{ text: string; citations: string[] }>(
        `/ai/courses/${courseId}/chat`,
        {
          method: "POST",
          body: JSON.stringify({ lessonId, mode, message }),
        },
      ),
  });
  return (
    <section className="mt-5 rounded-2xl border border-accent/35 bg-accent/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-black">
          <Sparkles size={18} className="text-accent" aria-hidden="true" />
          {t("aiTutor.title")}
        </h2>
        <span className="text-xs font-bold text-muted">
          {t("aiTutor.description")}
        </span>
      </div>
      <form
        className="mt-3 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          chat.mutate();
        }}
      >
        <div className="flex flex-wrap gap-2">
          {[
            ["Explain", t("aiTutor.modes.explain")],
            ["Practice", t("aiTutor.modes.practice")],
            ["Plan", t("aiTutor.modes.plan")],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`focus-ring rounded-full border px-3 py-1.5 text-xs font-black ${mode === value ? "border-accent bg-accent/20 text-foreground" : "border-border text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          required
          maxLength={2000}
          className="min-h-24 rounded-xl border border-border bg-page/40 p-3 text-sm"
          placeholder={t("aiTutor.placeholder")}
        />
        <button
          disabled={chat.isPending || !message.trim()}
          className="focus-ring w-fit rounded-xl border border-accent/60 px-4 py-2 text-sm font-black text-foreground hover:bg-accent/15 disabled:opacity-50"
        >
          {chat.isPending ? t("loading") : t("aiTutor.askForHelp")}
        </button>
      </form>
      {chat.data ? (
        <div className="mt-4 rounded-xl border border-border/70 bg-page/40 p-4">
          <p className="whitespace-pre-line text-sm leading-7">
            {chat.data.text}
          </p>
          {chat.data.citations.length ? (
            <p className="mt-3 text-xs text-muted">
              {t("aiTutor.sourcesUsed")}{" "}
              {chat.data.citations
                .map((citation) => citation.split("\n")[0])
                .join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}
      {chat.isError ? (
        <p role="status" className="mt-3 text-sm text-muted">
          {chat.error instanceof Error
            ? chat.error.message
            : t("aiTutor.unavailable")}
        </p>
      ) : null}
    </section>
  );
}

type StudentCourseAssignment = {
  id: string;
  lessonId?: string;
  arabicTitle: string;
  englishTitle: string;
  arabicInstructions: string;
  englishInstructions: string;
  availableFromUtc?: string;
  dueAtUtc?: string;
  baseDueAtUtc?: string;
  effectiveDueAtUtc?: string;
  hasDeadlineExtension: boolean;
  maxSubmissionAttempts: number;
  allowResubmission: boolean;
  maxFileSizeBytes: number;
  allowedFileExtensions: string[];
  publicationStatus: string;
  resources: {
    id: string;
    displayName: string;
    contentType: string;
    scanStatus: string;
  }[];
  criteria: {
    id: string;
    code: string;
    band: string;
    arabicDescription: string;
    englishDescription: string;
  }[];
};

type StudentCourseAssignmentSubmission = {
  id: string;
  assignmentId: string;
  status: string;
  currentVersionNumber: number;
  calculatedGrade?: string;
  submittedAtUtc?: string;
  gradedAtUtc?: string;
  versions: {
    versionNumber: number;
    studentComment?: string;
    submittedAtUtc?: string;
    files: {
      id: string;
      originalFileName: string;
      contentType: string;
      lengthBytes: number;
      scanStatus: string;
    }[];
  }[];
  results: {
    code: string;
    band: string;
    achievement: string;
    feedback?: string;
  }[];
  feedback: {
    body: string;
    requestsResubmission: boolean;
    createdAtUtc: string;
  }[];
};

type BtecGradeSummary = {
  predictedGrade: string;
  passAchieved: number;
  passRequired: number;
  meritAchieved: number;
  meritRequired: number;
  distinctionAchieved: number;
  distinctionRequired: number;
};

type StudentCourseGradebook = {
  courseId: string;
  courseTitle: string;
  lessonProgressPercent: number;
  lessonsCompleted: number;
  lessonsTotal: number;
  assignmentsCompleted: number;
  assignmentsTotal: number;
  predictedGrade: BtecGradeSummary;
  units: {
    unitId: string;
    unitTitle: string;
    lessonProgressPercent: number;
    lessonsCompleted: number;
    lessonsTotal: number;
    predictedGrade: BtecGradeSummary;
    learningAims: {
      learningAimId: string;
      code: string;
      title: string;
      lessonProgressPercent: number;
      lessonsCompleted: number;
      lessonsTotal: number;
      predictedGrade: BtecGradeSummary;
    }[];
  }[];
  criteria: {
    assignmentId: string;
    unitId?: string;
    unitCode?: string;
    assignmentTitle: string;
    code: string;
    band: string;
    status: string;
    feedback?: string;
  }[];
};

function StudentCourseGradebookPanel({ courseId }: { courseId: string }) {
  const t = useTranslations("studentWorkspace");
  const locale = useLocale();
  const gradeLabels: Record<string, string> = {
    NotYetAchieved: t("gradebook.grades.notYetAchieved"),
    Pass: t("gradebook.grades.pass"),
    Merit: t("gradebook.grades.merit"),
    Distinction: t("gradebook.grades.distinction"),
  };
  const criterionStatusLabels: Record<string, string> = {
    NotStarted: t("gradebook.criterionStatuses.notStarted"),
    InReview: t("gradebook.criterionStatuses.inReview"),
    Achieved: t("gradebook.criterionStatuses.achieved"),
    NotAchieved: t("gradebook.criterionStatuses.notAchieved"),
    NeedsImprovement: t("gradebook.criterionStatuses.needsImprovement"),
    ResubmissionRequired: t("gradebook.criterionStatuses.resubmissionRequired"),
    NotApplicable: t("gradebook.criterionStatuses.notApplicable"),
  };
  const gradebook = useQuery({
    queryKey: ["student-course-gradebook", courseId, locale],
    queryFn: () =>
      api<StudentCourseGradebook>(
        `/gradebook/student/courses/${courseId}?locale=${locale}`,
      ),
  });
  if (gradebook.isPending) {
    return (
      <section
        className="mt-5 rounded-2xl border border-border bg-surface-solid/55 p-4"
        aria-busy
      >
        <p className="text-sm text-muted">{t("loading")}</p>
      </section>
    );
  }
  if (gradebook.isError || !gradebook.data) return null;
  const data = gradebook.data;
  const summary = data.predictedGrade;
  return (
    <section className="mt-5 rounded-2xl border border-secondary/30 bg-secondary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-secondary">
            {t("gradebook.eyebrow")}
          </p>
          <h2 className="mt-1 text-lg font-black">{t("gradebook.heading")}</h2>
          <p className="mt-1 text-sm text-muted">
            {t("gradebook.description")}
          </p>
        </div>
        <div className="rounded-xl border border-secondary/35 bg-page/50 px-4 py-3 text-center">
          <p className="text-xs font-bold text-muted">
            {t("gradebook.predictedGrade")}
          </p>
          <p className="mt-1 text-xl font-black text-secondary">
            {gradeLabel(summary.predictedGrade, gradeLabels)}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <GradeProgressStat
          label={t("gradebook.lessons")}
          value={`${data.lessonsCompleted} / ${data.lessonsTotal}`}
          detail={formatLocalizedPercentage(data.lessonProgressPercent, locale)}
        />

        <GradeProgressStat
          label={t("gradebook.courseworkAssessed")}
          value={`${data.assignmentsCompleted} / ${data.assignmentsTotal}`}
          detail={t("gradebook.assignments")}
        />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {[
          ["P", summary.passAchieved, summary.passRequired, "text-primary"],
          ["M", summary.meritAchieved, summary.meritRequired, "text-secondary"],
          [
            "D",
            summary.distinctionAchieved,
            summary.distinctionRequired,
            "text-accent",
          ],
        ].map(([band, achieved, required, tone]) => (
          <p
            key={String(band)}
            className="rounded-xl border border-border/70 bg-page/40 px-3 py-2 text-sm"
          >
            <strong className={String(tone)}>{band}</strong>{" "}
            {t("gradebook.achieved")}:{" "}
            {formatLocalizedNumber(Number(achieved), locale)} /{" "}
            {formatLocalizedNumber(Number(required), locale)}
          </p>
        ))}
      </div>
      {data.units.length ? (
        <div className="mt-4 grid gap-2">
          {data.units.map((unit) => (
            <div
              key={unit.unitId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-page/35 px-3 py-2 text-sm"
            >
              <strong>{unit.unitTitle}</strong>
              <span className="text-muted">
                {formatLocalizedNumber(unit.lessonsCompleted, locale)}/
                {formatLocalizedNumber(unit.lessonsTotal, locale)} ·{" "}
                {formatLocalizedPercentage(unit.lessonProgressPercent, locale)}{" "}
                · {gradeLabel(unit.predictedGrade.predictedGrade, gradeLabels)}
              </span>
              {unit.learningAims.length ? (
                <div className="basis-full grid gap-2 border-t border-border/60 pt-2 sm:grid-cols-2">
                  {unit.learningAims.map((aim) => (
                    <div
                      key={aim.learningAimId}
                      className="rounded-lg bg-surface-solid/45 px-2.5 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-secondary">
                          {aim.code} · {aim.title}
                        </strong>
                        <span className="text-muted">
                          {formatLocalizedPercentage(
                            aim.lessonProgressPercent,
                            locale,
                          )}
                        </span>
                      </div>
                      <p className="mt-1 text-muted">
                        {formatLocalizedNumber(aim.lessonsCompleted, locale)}/
                        {formatLocalizedNumber(aim.lessonsTotal, locale)} ·{" "}
                        {gradeLabel(
                          aim.predictedGrade.predictedGrade,
                          gradeLabels,
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {data.criteria.length ? (
        <details className="mt-4 rounded-xl border border-border/70 bg-page/35 p-3">
          <summary className="cursor-pointer font-black">
            {t("gradebook.criterionStatus")}
          </summary>
          <ul className="mt-3 grid gap-2 text-sm">
            {data.criteria.map((criterion) => (
              <li
                key={`${criterion.assignmentId}-${criterion.code}`}
                className="rounded-lg border border-border/60 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{criterion.code}</strong>
                  <span className="font-bold text-primary">
                    {criterionStatusLabel(
                      criterion.status,
                      criterionStatusLabels,
                    )}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {criterion.assignmentTitle}
                </p>
                {criterion.feedback ? (
                  <p className="mt-2 text-sm text-muted">
                    {criterion.feedback}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function GradeProgressStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-page/40 p-3">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className="mt-1 font-black">{value}</p>
      <p className="mt-1 text-xs text-primary">{detail}</p>
    </div>
  );
}

function gradeLabel(grade: string, labels: Record<string, string>) {
  return labels[grade] ?? grade;
}

function criterionStatusLabel(status: string, labels: Record<string, string>) {
  return labels[status] ?? status;
}

export function CourseAssignmentPanel({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
  const t = useTranslations("studentWorkspace");
  const locale = useLocale();
  const client = useQueryClient();
  const [active, setActive] = useState<{
    assignmentId: string;
    submissionId: string;
  }>();
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const assignments = useQuery({
    queryKey: ["student-course-assignments", courseId],
    queryFn: () =>
      api<StudentCourseAssignment[]>(
        `/student/courses/${courseId}/assignments`,
      ),
  });
  const mine = useQuery({
    queryKey: ["student-course-assignment-submissions"],
    queryFn: () =>
      api<StudentCourseAssignmentSubmission[]>("/student/assignments/mine"),
  });
  const refresh = () => {
    client.invalidateQueries({
      queryKey: ["student-course-assignments", courseId],
    });
    client.invalidateQueries({
      queryKey: ["student-course-assignment-submissions"],
    });
  };
  const start = useMutation({
    mutationFn: (assignmentId: string) =>
      api<{ submissionId: string }>(
        `/student/assignments/${assignmentId}/submissions`,
        { method: "POST", body: JSON.stringify({ comment }) },
      ),
    onSuccess: (response, assignmentId) => {
      setActive({ assignmentId, submissionId: response.submissionId });
      setFiles([]);
      refresh();
    },
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!active)
        throw new Error("Start the submission before uploading files.");
      for (const file of files) {
        const body = new FormData();
        body.set("file", file);
        await api(
          `/student/assignments/submissions/${active.submissionId}/files`,
          {
            method: "POST",
            body,
          },
        );
      }
    },
    onSuccess: () => {
      setFiles([]);
      refresh();
    },
  });
  const submit = useMutation({
    mutationFn: () => {
      if (!active) throw new Error("Start the submission before submitting.");
      return api(
        `/student/assignments/submissions/${active.submissionId}/submit`,
        {
          method: "POST",
        },
      );
    },
    onSuccess: () => {
      setActive(undefined);
      setFiles([]);
      setComment("");
      refresh();
    },
  });
  const visible = (assignments.data ?? []).filter(
    (assignment) => !assignment.lessonId || assignment.lessonId === lessonId,
  );
  if (assignments.isPending || !visible.length) return null;
  return (
    <section className="mt-6 grid gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-black">
          <ClipboardCheck
            size={19}
            className="text-primary"
            aria-hidden="true"
          />
          {t("coursework.title")}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("coursework.description")}</p>
      </div>
      {visible.map((assignment) => {
        const submission = mine.data?.find(
          (item) => item.assignmentId === assignment.id,
        );
        const activeHere = active?.assignmentId === assignment.id;
        const opensInFuture = Boolean(
          assignment.availableFromUtc &&
          new Date(assignment.availableFromUtc) > new Date(),
        );
        const deadlinePassed = Boolean(
          assignment.effectiveDueAtUtc &&
          new Date(assignment.effectiveDueAtUtc) < new Date(),
        );
        return (
          <article
            key={assignment.id}
            className="rounded-xl border border-border bg-surface-solid/55 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-black">
                  {locale === "ar"
                    ? assignment.arabicTitle
                    : assignment.englishTitle}
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
                  {locale === "ar"
                    ? assignment.arabicInstructions
                    : assignment.englishInstructions}
                </p>
                {assignment.effectiveDueAtUtc ? (
                  <p className="mt-2 text-xs text-muted">
                    {t("coursework.due")}{" "}
                    {formatLocalizedDateTime(
                      assignment.effectiveDueAtUtc,
                      locale,
                    )}
                  </p>
                ) : null}
                {assignment.hasDeadlineExtension ? (
                  <p className="mt-1 text-xs font-bold text-primary">
                    {t("coursework.deadlineAdjustment")}
                  </p>
                ) : null}
                {assignment.availableFromUtc ? (
                  <p className="mt-2 text-xs text-muted">
                    {t("coursework.opens")}{" "}
                    {formatLocalizedDateTime(
                      assignment.availableFromUtc,
                      locale,
                    )}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted">
                  {t("coursework.files")}{" "}
                  {assignment.allowedFileExtensions.join(", ").toUpperCase()} ·{" "}
                  {Math.round(assignment.maxFileSizeBytes / 1024 / 1024)}MB
                </p>
                {assignment.resources.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {assignment.resources.map((resource) => (
                      <a
                        key={resource.id}
                        href={`/api/v1/assignments/${assignment.id}/resources/${resource.id}`}
                        className="focus-ring rounded-lg border border-primary/35 px-2.5 py-2 text-xs font-bold text-primary"
                      >
                        <FileBadge
                          size={14}
                          className="me-1 inline"
                          aria-hidden="true"
                        />
                        {resource.displayName}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
              {submission?.calculatedGrade ? (
                <span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-black text-primary">
                  {submission.calculatedGrade}
                </span>
              ) : submission ? (
                <span className="rounded-full border border-border px-3 py-1 text-xs font-bold text-muted">
                  {submission.status}
                </span>
              ) : null}
            </div>
            <ul className="mt-3 grid gap-1 text-sm">
              {assignment.criteria.map((criterion) => (
                <li
                  key={criterion.id}
                  className="rounded-lg border border-border/70 p-2"
                >
                  <strong className="text-primary">{criterion.code}</strong> —{" "}
                  {locale === "ar"
                    ? criterion.arabicDescription
                    : criterion.englishDescription}
                </li>
              ))}
            </ul>
            {submission?.results.length ? (
              <div className="mt-3 grid gap-2 border-t border-border pt-3">
                <p className="font-bold">{t("coursework.criterionResult")}</p>
                {submission.results.map((result) => (
                  <p key={result.code} className="text-sm text-muted">
                    <strong className="text-primary">{result.code}</strong> —{" "}
                    {result.achievement}
                    {result.feedback ? ` · ${result.feedback}` : ""}
                  </p>
                ))}
              </div>
            ) : null}
            {submission?.feedback.length ? (
              <div className="mt-3 grid gap-2 border-t border-border pt-3">
                {submission.feedback.map((item) => (
                  <p
                    key={`${item.createdAtUtc}-${item.body}`}
                    className="rounded-lg bg-black/5 p-2.5 text-sm text-muted"
                  >
                    {item.requestsResubmission ? "↻ " : ""}
                    {item.body}
                  </p>
                ))}
              </div>
            ) : null}
            {submission?.versions.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {submission.versions
                  .flatMap((version) => version.files)
                  .map((file) => (
                    <a
                      key={file.id}
                      href={`/api/v1/assignments/submissions/${submission.id}/files/${file.id}`}
                      className="focus-ring rounded-lg border border-primary/35 px-2.5 py-2 text-xs font-bold text-primary"
                    >
                      <FileBadge
                        size={14}
                        className="me-1 inline"
                        aria-hidden="true"
                      />
                      {file.originalFileName}
                    </a>
                  ))}
              </div>
            ) : null}
            {submission?.status !== "Graded" &&
            submission?.status !== "Finalized" ? (
              <div className="mt-4 border-t border-border pt-4">
                {!activeHere ? (
                  <button
                    type="button"
                    onClick={() => start.mutate(assignment.id)}
                    disabled={
                      start.isPending ||
                      opensInFuture ||
                      deadlinePassed ||
                      (submission?.status === "NeedsRevision" &&
                        !assignment.allowResubmission)
                    }
                    className="focus-ring rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
                  >
                    {deadlinePassed
                      ? t("coursework.actions.deadlinePassed")
                      : opensInFuture
                        ? t("coursework.actions.notOpenYet")
                        : submission?.status === "NeedsRevision" &&
                            !assignment.allowResubmission
                          ? t("coursework.actions.resubmissionUnavailable")
                          : submission?.status === "NeedsRevision"
                            ? t("coursework.actions.startResubmission")
                            : submission?.status === "Draft"
                              ? t("coursework.actions.continueDraft")
                              : t("coursework.actions.startSubmission")}
                  </button>
                ) : (
                  <div className="grid gap-3">
                    <textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      maxLength={4000}
                      placeholder={t("coursework.submission.notePlaceholder")}
                      className="min-h-20 rounded-xl border border-border bg-transparent p-2.5 text-sm"
                    />
                    <FilePicker
                      label={t("coursework.submission.workFiles")}
                      files={files}
                      onFilesChange={setFiles}
                      locale={locale}
                      multiple
                      accept={assignment.allowedFileExtensions.join(",")}
                      maxFileBytes={assignment.maxFileSizeBytes}
                      chooseLabel={t("coursework.submission.chooseFiles")}
                      helpText={t("coursework.submission.fileHelp", {
                        size: String(
                          Math.round(assignment.maxFileSizeBytes / 1024 / 1024),
                        ),
                      })}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => start.mutate(assignment.id)}
                        disabled={start.isPending || deadlinePassed}
                        className="focus-ring rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-muted disabled:opacity-50"
                      >
                        {t("coursework.submission.saveNote")}
                      </button>
                      <button
                        type="button"
                        onClick={() => upload.mutate()}
                        disabled={
                          !files.length || upload.isPending || deadlinePassed
                        }
                        className="focus-ring rounded-xl border border-primary/40 px-4 py-2.5 text-sm font-bold text-primary disabled:opacity-50"
                      >
                        {t("coursework.submission.uploadFiles")}
                      </button>
                      <button
                        type="button"
                        onClick={() => submit.mutate()}
                        disabled={submit.isPending || deadlinePassed}
                        className="focus-ring rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
                      >
                        {t("coursework.submission.submit")}
                      </button>
                    </div>
                    {upload.isError || submit.isError ? (
                      <p role="alert" className="text-sm text-red-400">
                        {(upload.error ?? submit.error) instanceof Error
                          ? (upload.error ?? submit.error)?.message
                          : t("coursework.errors.action")}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </article>
        );
      })}
      {start.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {start.error instanceof Error
            ? start.error.message
            : t("coursework.errors.start")}
        </p>
      ) : null}
      {assignments.isError || mine.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {t("coursework.errors.load")}
        </p>
      ) : null}
    </section>
  );
}

function EvaluationWizard() {
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeRequested = searchParams.has("resume");
  const resumeId = searchParams.get("resume");
  const [selected, setSelected] = useState({
    qualification: "",
    grade: "",
    specialization: "",
    unit: "",
    assessmentScopeId: "",
    comment: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [evaluationId, setEvaluationId] = useState<string>();
  const [evaluationCriteria, setEvaluationCriteria] = useState<string[]>([]);
  const [evaluationPrice, setEvaluationPrice] = useState<{
    price: number;
    currency: string;
  } | null>(null);
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, string>>(
    {},
  );
  const [uploadedFileKeys, setUploadedFileKeys] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("Card");
  const [authenticityConfirmed, setAuthenticityConfirmed] = useState(false);
  const [fileUploadFailed, setFileUploadFailed] = useState(false);
  const [paymentSession, setPaymentSession] =
    useState<EvaluationCheckoutResponse | null>(null);
  const hydratedResumeId = useRef<string | null>(null);
  const resumeDetail = useQuery({
    queryKey: ["evaluation-detail", resumeId],
    queryFn: () =>
      api<EvaluationDetail>(`/evaluations/${encodeURIComponent(resumeId!)}`),
    enabled: Boolean(resumeId),
  });
  const authenticityAlreadyDeclared =
    resumeRequested && resumeDetail.data?.hasAuthenticityDeclaration === true;
  useEffect(() => {
    const detail = resumeDetail.data;
    if (
      !detail ||
      detail.id !== resumeId ||
      detail.status !== "Draft" ||
      detail.isRetake !== false ||
      detail.isResit !== false ||
      !detail.assessmentScopeId ||
      hydratedResumeId.current === detail.id
    )
      return;

    hydratedResumeId.current = detail.id;
    setEvaluationId(detail.id);
    setEvaluationCriteria(detail.criteria);
    setEvaluationPrice({ price: detail.price, currency: detail.currency });
    setSelected((current) => ({
      ...current,
      assessmentScopeId: detail.assessmentScopeId ?? "",
      comment: detail.studentComment ?? "",
    }));
    setEvidenceDrafts(
      Object.fromEntries(
        detail.evidence.map(({ criterionCode, narrative }) => [
          criterionCode,
          narrative,
        ]),
      ),
    );
    setAuthenticityConfirmed(detail.hasAuthenticityDeclaration === true);
  }, [resumeDetail.data, resumeId]);
  const maxFileBytes = 100 * 1024 * 1024;
  const fileKey = (item: File) =>
    `${item.name}:${item.size}:${item.lastModified}`;
  const uploadFiles = async (requestId: string, pendingFiles: File[]) => {
    if (pendingFiles.length === 0) return;

    try {
      for (const item of pendingFiles) {
        const form = new FormData();
        form.set("file", item);
        await api(`/evaluations/${requestId}/files`, {
          method: "POST",
          body: form,
        });
        const key = fileKey(item);
        setUploadedFileKeys((current) =>
          current.includes(key) ? current : [...current, key],
        );
      }
      setFileUploadFailed(false);
    } catch (error) {
      setFileUploadFailed(true);
      throw error;
    }
  };
  const options = useQuery({
    queryKey: ["assessment-scopes"],
    queryFn: () =>
      api<AssessmentScopeOption[]>("/evaluations/assessment-scopes"),
    enabled: !resumeRequested,
  });
  const includedCredit = useQuery({
    queryKey: ["included-evaluation-credit", selected.assessmentScopeId],
    queryFn: () =>
      api<{ available: boolean }>(
        `/evaluations/assessment-scopes/${selected.assessmentScopeId}/included-credit`,
      ),
    enabled: Boolean(selected.assessmentScopeId),
  });
  const hasIncludedCredit = includedCredit.data?.available === true;
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string; criteria: string[]; price: number; currency: string }>(
        "/evaluations/scoped",
        {
          method: "POST",
          body: JSON.stringify({
            assessmentScopeId: selected.assessmentScopeId,
            studentComment: selected.comment,
          }),
        },
      ),
    onSuccess: async (response) => {
      setEvaluationId(response.id);
      setEvaluationCriteria(response.criteria);
      setEvaluationPrice({
        price: response.price,
        currency: response.currency,
      });
      await uploadFiles(response.id, files);
    },
  });
  const checkout = useMutation({
    mutationFn: async () => {
      const hasCleanServerFile =
        resumeDetail.data?.files.some((item) => item.scanStatus === "Clean") ??
        false;
      if (!evaluationId || (!hasCleanServerFile && files.length === 0))
        throw new Error(
          locale === "ar"
            ? "اختر ملف مهمة واحدًا على الأقل قبل إرسال طلب المراجعة."
            : "Choose at least one assignment file before submitting the review request.",
        );
      if (!authenticityConfirmed)
        throw new Error(
          locale === "ar"
            ? "يجب تأكيد إقرار أصالة العمل قبل إرسال طلب المراجعة."
            : "Confirm the originality declaration before submitting the review request.",
        );
      const pendingFiles = files.filter(
        (item) => !uploadedFileKeys.includes(fileKey(item)),
      );
      await uploadFiles(evaluationId, pendingFiles);
      await Promise.all(
        Object.entries(evidenceDrafts)
          .filter(([, narrative]) => narrative.trim())
          .map(([criterionCode, narrative]) =>
            api(`/evaluations/${evaluationId}/evidence`, {
              method: "POST",
              body: JSON.stringify({ criterionCode, narrative }),
            }),
          ),
      );
      if (!authenticityAlreadyDeclared)
        await api(`/evaluations/${evaluationId}/authenticity-declaration`, {
          method: "POST",
        });
      return api<EvaluationCheckoutResponse>(
        `/evaluations/${evaluationId}/checkout`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            paymentMethod,
            expectIncludedCredit: hasIncludedCredit,
          }),
        },
      );
    },
    onSuccess: (result) => {
      setPaymentSession(null);
      if (result.includedCreditApplied) {
        router.push(`/${locale}/student/evaluations`);
        return;
      }
      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return;
      }
      setPaymentSession(result);
    },
  });
  const confirmDevelopmentPayment = useMutation({
    mutationFn: async () => {
      if (
        !paymentSession?.paymentId ||
        !paymentSession.provider?.startsWith("Fake")
      )
        throw new Error(
          locale === "ar"
            ? "لا توجد دفعة اختبارية صالحة لإتمامها."
            : "There is no valid development test payment to complete.",
        );
      return api("/payments/fake/confirm", {
        method: "POST",
        body: JSON.stringify({
          paymentId: paymentSession.paymentId,
          providerEventId: `evaluation_test_${crypto.randomUUID()}`,
        }),
      });
    },
    onSuccess: () => router.push(`/${locale}/student/evaluations`),
  });
  if (resumeRequested && !resumeId)
    return (
      <EvaluationResumeMessage
        locale={locale}
        textEn="This evaluation draft link is incomplete. Return to My Evaluations and choose a draft to continue."
        textAr="رابط استئناف التقييم غير مكتمل. عُد إلى طلباتي واختر مسودة للمتابعة."
      />
    );
  if (resumeRequested && resumeDetail.isPending)
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          {locale === "ar" ? "جارٍ تحميل المسودة…" : "Loading your draft…"}
        </div>
      </section>
    );
  if (resumeRequested && (resumeDetail.isError || !resumeDetail.data))
    return (
      <section className="shell py-10">
        <div className="card grid justify-items-start gap-3 p-6">
          <p role="alert">
            {locale === "ar"
              ? "تعذر تحميل مسودة التقييم. تحقق من اتصالك ثم أعد المحاولة."
              : "Unable to load this evaluation draft. Check your connection and try again."}
          </p>
          <button
            type="button"
            onClick={() => void resumeDetail.refetch()}
            className="focus-ring rounded-lg border border-primary px-3 py-2 font-semibold text-primary"
          >
            {locale === "ar" ? "إعادة المحاولة" : "Retry"}
          </button>
          <Link
            className="focus-ring font-bold text-primary underline"
            href={`/${locale}/student/evaluations`}
          >
            {locale === "ar" ? "العودة إلى طلباتي" : "Back to My Evaluations"}
          </Link>
        </div>
      </section>
    );
  if (
    resumeRequested &&
    resumeDetail.data &&
    (resumeDetail.data.status !== "Draft" ||
      resumeDetail.data.isRetake !== false ||
      resumeDetail.data.isResit !== false ||
      !resumeDetail.data.assessmentScopeId)
  )
    return (
      <EvaluationResumeMessage
        locale={locale}
        textEn="This request is not an active standard evaluation draft. Return to My Evaluations to choose an available action."
        textAr="هذا الطلب ليس مسودة تقييم عادية قابلة للمتابعة. عُد إلى طلباتي لاختيار الإجراء المتاح."
      />
    );
  if (resumeRequested && resumeDetail.data && !evaluationId)
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          {locale === "ar" ? "جارٍ استعادة المسودة…" : "Restoring your draft…"}
        </div>
      </section>
    );
  if (!resumeRequested && options.isPending)
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          …
        </div>
      </section>
    );
  if (!resumeRequested && (options.isError || !options.data))
    return (
      <section className="shell py-10">
        <p className="card p-6">
          {locale === "ar"
            ? "تعذر تحميل التقييمات المتاحة. حاول مجددًا."
            : "Unable to load available assessments. Please try again."}
        </p>
      </section>
    );
  const scopes = options.data ?? [];
  const qualificationKey = (item: AssessmentScopeOption) =>
    `${item.qualificationCode}:${item.qualificationVersionCode}`;
  const unique = (
    rows: AssessmentScopeOption[],
    key: (item: AssessmentScopeOption) => string,
    label: (item: AssessmentScopeOption) => string,
  ) => [
    ...new Map(
      rows.map((item) => [key(item), { id: key(item), label: label(item) }]),
    ).values(),
  ];
  const qualifications = unique(
    scopes,
    qualificationKey,
    (item) =>
      `${item.qualificationCode} · ${locale === "ar" ? item.qualificationArabicName : item.qualificationEnglishName} (${item.qualificationVersionCode})`,
  );
  const forQualification = scopes.filter(
    (item) => qualificationKey(item) === selected.qualification,
  );
  const grades = unique(
    forQualification,
    (item) => item.gradeCode,
    (item) => (locale === "ar" ? item.gradeArabicName : item.gradeEnglishName),
  );
  const forGrade = forQualification.filter(
    (item) => item.gradeCode === selected.grade,
  );
  const specializations = unique(
    forGrade,
    (item) => item.specializationCode,
    (item) =>
      locale === "ar"
        ? item.specializationArabicName
        : item.specializationEnglishName,
  );
  const forSpecialization = forGrade.filter(
    (item) => item.specializationCode === selected.specialization,
  );
  const units = unique(
    forSpecialization,
    (item) => item.unitCode,
    (item) =>
      `${item.unitCode} · ${academicText(locale, item.unitArabicTitle, item.unitEnglishTitle)}`,
  );
  const forUnit = forSpecialization.filter(
    (item) => item.unitCode === selected.unit,
  );
  const currentScope = scopes.find(
    (item) => item.assessmentScopeId === selected.assessmentScopeId,
  );
  return (
    <section className="shell py-10">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !resumeRequested &&
            !create.isPending &&
            selected.assessmentScopeId
          )
            create.mutate();
        }}
        className="card mx-auto grid min-w-0 max-w-2xl grid-cols-[minmax(0,1fr)] gap-4 p-6"
      >
        <p className="font-bold text-primary">
          {locale === "ar"
            ? "BETCCO · قيّم مهمتك"
            : "BETCCO · Evaluate my assignment"}
        </p>
        <h1 className="text-3xl font-black">
          {locale === "ar"
            ? "اعرف مستوى مهمتك قبل التسليم الرسمي"
            : "Understand your assignment before official submission"}
        </h1>
        <p className="text-sm leading-7 text-muted">
          {locale === "ar"
            ? "اختر الوحدة والمهمة، ارفع عملك وأدلته، ثم استخدم تقييم الوحدة المشمول إن كان متاحًا. إذا لم يكن لديك رصيد مشمول، يمكنك طلب مراجعة BETCCO مدفوعة مرة واحدة. النتيجة إرشادية وليست علامة رسمية من Pearson."
            : "Choose the Unit and assignment, upload your work and evidence, then use an included Unit evaluation when available. If no included credit is available, you can request a one-time paid BETCCO review. The result is guidance, not an official Pearson grade."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <p className="font-black text-primary">
              {locale === "ar"
                ? "لديك تقييم مشمول؟"
                : "Have an included evaluation?"}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {locale === "ar"
                ? "إذا كانت وحدتك المدفوعة تحتوي على رصيد غير مستخدم، سيُطبّق تلقائيًا بدون إنشاء دفعة جديدة."
                : "If your paid Unit has an unused included credit, it is applied automatically without creating a new payment."}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-solid/60 p-4">
            <p className="font-black">
              {locale === "ar" ? "بدون رصيد مشمول" : "No included credit"}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {locale === "ar"
                ? "يُستخدم مسار الدفع العادي مرة واحدة للمراجعة كاملة، مع انتظار تأكيد مزود الدفع من الخادم."
                : "The standard one-time payment flow is used for the full review, with server-side provider confirmation required."}
            </p>
          </div>
        </div>
        {resumeRequested && resumeDetail.data ? (
          <section className="grid gap-3 rounded-xl border border-border bg-surface-solid/60 p-4">
            <h2 className="font-black">
              {locale === "ar" ? "مسودة التقييم" : "Evaluation draft"}
            </h2>
            <AcademicIdentity
              academic={resumeDetail.data.academic}
              locale={locale}
            />
            <p className="text-sm">
              {locale === "ar" ? "المعايير المحفوظة" : "Saved criteria"}:{" "}
              {evaluationCriteria.join(", ") || "—"}
            </p>
            <p className="text-sm font-semibold">
              {locale === "ar" ? "السعر المحفوظ" : "Saved price"}:{" "}
              {evaluationPrice
                ? formatLocalizedCurrency(
                    evaluationPrice.price,
                    evaluationPrice.currency,
                    locale,
                  )
                : "—"}
            </p>
            <div className="grid gap-2 text-sm">
              <strong>
                {locale === "ar" ? "الملفات المرفوعة" : "Uploaded files"}
              </strong>
              {resumeDetail.data.files.length ? (
                <ul className="grid gap-2">
                  {resumeDetail.data.files.map((file) => (
                    <li
                      key={file.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
                    >
                      <a
                        className="focus-ring font-semibold text-primary underline"
                        href={`/api/v1/evaluations/${encodeURIComponent(resumeDetail.data.id)}/files/${encodeURIComponent(file.id)}`}
                      >
                        {file.originalFileName}
                      </a>
                      <span className="text-xs text-muted">
                        {locale === "ar" ? "حالة الفحص" : "Scan status"}:{" "}
                        {file.scanStatus}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">
                  {locale === "ar"
                    ? "لا توجد ملفات مرفوعة في هذه المسودة بعد. أضف ملفًا للمتابعة."
                    : "No files have been uploaded to this draft yet. Add a file to continue."}
                </p>
              )}
            </div>
          </section>
        ) : null}
        {!resumeRequested ? (
          <>
            {scopes.length === 0 ? (
              <p role="status" className="text-muted">
                {locale === "ar"
                  ? "لا توجد تقييمات منشورة متاحة الآن. يُرجى المحاولة لاحقًا."
                  : "No published assessments are available right now. Please check back later."}
              </p>
            ) : null}
            <Select
              label={
                locale === "ar"
                  ? "المؤهل والإصدار"
                  : "Qualification and version"
              }
              value={selected.qualification}
              setValue={(value) =>
                setSelected({
                  ...selected,
                  qualification: value,
                  grade: "",
                  specialization: "",
                  unit: "",
                  assessmentScopeId: "",
                })
              }
              items={qualifications}
              disabled={Boolean(evaluationId)}
            />
            <Select
              label={locale === "ar" ? "الصف" : "Grade"}
              value={selected.grade}
              setValue={(value) =>
                setSelected({
                  ...selected,
                  grade: value,
                  specialization: "",
                  unit: "",
                  assessmentScopeId: "",
                })
              }
              items={grades}
              disabled={!selected.qualification || Boolean(evaluationId)}
            />
            <Select
              label={locale === "ar" ? "التخصص" : "Specialization"}
              value={selected.specialization}
              setValue={(value) =>
                setSelected({
                  ...selected,
                  specialization: value,
                  unit: "",
                  assessmentScopeId: "",
                })
              }
              items={specializations}
              disabled={!selected.grade || Boolean(evaluationId)}
            />
            <Select
              label={locale === "ar" ? "الوحدة" : "Unit"}
              value={selected.unit}
              setValue={(value) =>
                setSelected({ ...selected, unit: value, assessmentScopeId: "" })
              }
              items={units}
              disabled={!selected.specialization || Boolean(evaluationId)}
            />
            <Select
              label={
                locale === "ar"
                  ? "التقييم أو المهمة"
                  : "Assessment or assignment"
              }
              value={selected.assessmentScopeId}
              setValue={(value) =>
                setSelected({ ...selected, assessmentScopeId: value })
              }
              items={forUnit.map((item) => ({
                id: item.assessmentScopeId,
                label: `${item.assessmentCode} · ${locale === "ar" ? item.assessmentArabicTitle : item.assessmentEnglishTitle} (v${item.assessmentVersion}${forUnit.length > 1 ? ` · ${locale === "ar" ? "النطاق" : "scope"} ${item.scopeVersion}` : ""})`,
              }))}
              disabled={!selected.unit || Boolean(evaluationId)}
            />
            {currentScope ? (
              <div
                className="rounded-xl border border-border bg-surface-solid/60 p-4 text-sm"
                role="status"
              >
                <p className="font-bold">
                  {locale === "ar" ? "نطاق التقييم" : "Assessment coverage"}
                </p>
                <p className="mt-2">
                  {locale === "ar" ? "أهداف التعلم" : "Learning aims"}:{" "}
                  {currentScope.learningAimCodes.join(", ")}
                </p>
                <p className="mt-1">
                  {locale === "ar" ? "المعايير" : "Criteria"}:{" "}
                  {currentScope.criteria
                    .map((item) => `${item.code} (${item.band})`)
                    .join(", ")}
                </p>
                <p className="mt-2 text-muted">
                  {locale === "ar"
                    ? "تقييم ومراجعة BETCCO؛ ليس درجة رسمية من Pearson."
                    : "BETCCO evaluation and review; not an official Pearson grade."}
                </p>
              </div>
            ) : null}
          </>
        ) : null}
        {selected.assessmentScopeId ? (
          <div
            className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm"
            role="status"
          >
            {includedCredit.isPending ||
            (includedCredit.isError && includedCredit.isFetching) ? (
              <p className="text-muted">
                {locale === "ar"
                  ? "جارٍ التحقق من رصيد تقييم المهمة لهذه الوحدة…"
                  : "Checking your included evaluation credit for this Unit…"}
              </p>
            ) : includedCredit.isError ? (
              <div className="grid justify-items-start gap-2">
                <p className="text-red-500">
                  {locale === "ar"
                    ? "تعذر التحقق من رصيد التقييم الآن. أعد المحاولة قبل إرسال الطلب."
                    : "We could not verify your evaluation credit. Retry before submitting."}
                </p>
                <button
                  type="button"
                  onClick={() => void includedCredit.refetch()}
                  className="focus-ring rounded-lg border border-primary px-3 py-2 font-semibold text-primary"
                >
                  {locale === "ar"
                    ? "إعادة التحقق من الرصيد"
                    : "Retry credit check"}
                </button>
              </div>
            ) : hasIncludedCredit ? (
              <>
                <p className="font-black text-primary">
                  {locale === "ar"
                    ? "لديك تقييم مهمة واحد مشمول مع هذه الوحدة"
                    : "You have 1 assignment evaluation included with this Unit"}
                </p>
                <p className="mt-1 text-muted">
                  {locale === "ar"
                    ? "يشمل المراجعة الأولى، ملاحظات المعلم، وفحص نسخة معدلة واحدة. لن يتم إنشاء دفعة منفصلة."
                    : "It includes the initial review, teacher feedback, and one revised-work check. No separate payment will be created."}
                </p>
              </>
            ) : (
              <p className="text-muted">
                {locale === "ar"
                  ? "لا يوجد رصيد تقييم مشمول لهذه الوحدة؛ سيُستخدم مسار الدفع العادي مرة واحدة للخدمة كاملة."
                  : "No included evaluation credit is available for this Unit; the standard one-time paid review applies."}
              </p>
            )}
          </div>
        ) : null}
        <FilePicker
          label={locale === "ar" ? "ملفات المهمة" : "Assignment files"}
          files={files}
          onFilesChange={setFiles}
          locale={locale}
          accept=".pdf,.docx,.xlsx,.txt,.jpg,.jpeg,.png,.webp"
          multiple
          maxFileBytes={maxFileBytes}
          chooseLabel={
            locale === "ar" ? "اختيار ملفات المهمة" : "Choose assignment files"
          }
          helpText={
            locale === "ar"
              ? "يمكنك إضافة أكثر من ملف. الحد الأقصى 100MB لكل ملف، وتُرفع الملفات بشكل آمن واحدًا تلو الآخر."
              : "You can add multiple files. Each file is limited to 100MB and uploads securely one at a time."
          }
        />
        <label className="grid gap-1 text-sm font-semibold">
          {locale === "ar"
            ? "ماذا تريد من المقيّم؟"
            : "What do you need from the evaluator?"}
          <textarea
            value={selected.comment}
            readOnly={resumeRequested}
            onChange={(event) =>
              setSelected({
                ...selected,
                comment: event.target.value.slice(0, 1000),
              })
            }
            className="min-h-24 rounded-lg border bg-transparent p-3"
          />
        </label>
        {evaluationId && (
          <section className="grid gap-3 rounded-xl border border-border bg-surface-solid/60 p-4">
            <div>
              <h2 className="font-black">
                {locale === "ar"
                  ? "ملف أدلة المعايير"
                  : "Criterion evidence portfolio"}
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                {locale === "ar"
                  ? "اربط شرحًا مختصرًا بما يوضّح كل معيار. تبقى ملفات المهمة خاصة ولا يراها سوى الطالب والمقيّم المعيّن والإدارة."
                  : "Link a short explanation to each criterion. Assignment files remain private to you, the assigned evaluator, and the platform administration."}
              </p>
            </div>
            {evaluationCriteria.map((criterion) => (
              <label key={criterion} className="grid gap-1 text-sm font-bold">
                {criterion}
                <textarea
                  value={evidenceDrafts[criterion] ?? ""}
                  onChange={(event) =>
                    setEvidenceDrafts((current) => ({
                      ...current,
                      [criterion]: event.target.value,
                    }))
                  }
                  maxLength={4000}
                  className="min-h-20 rounded-lg border bg-transparent p-3"
                  placeholder={
                    locale === "ar"
                      ? "ما الدليل الذي يوضح عملك لهذا المعيار؟"
                      : "What evidence demonstrates your work for this criterion?"
                  }
                />
              </label>
            ))}
          </section>
        )}
        {evaluationId &&
        !includedCredit.isPending &&
        !includedCredit.isError &&
        !hasIncludedCredit ? (
          <section className="grid gap-3 rounded-xl border border-border bg-surface-solid/60 p-4">
            <div>
              <p className="font-black">
                {locale === "ar"
                  ? "مراجعة مدفوعة مرة واحدة"
                  : "One-time paid review"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {evaluationPrice
                  ? locale === "ar"
                    ? `السعر المحدد من الخادم: ${formatLocalizedCurrency(evaluationPrice.price, evaluationPrice.currency, locale)}. تُحسب أي ضريبة مطبقة عند الدفع.`
                    : `Server-owned review price: ${formatLocalizedCurrency(evaluationPrice.price, evaluationPrice.currency, locale)}. Any applicable tax is calculated at checkout.`
                  : locale === "ar"
                    ? "سيتم تأكيد السعر من الخادم قبل إنشاء الدفع."
                    : "The price will be confirmed by the server before payment is created."}
              </p>
            </div>
            <label className="grid gap-1 text-sm font-semibold">
              {locale === "ar" ? "طريقة الدفع" : "Payment method"}
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                className="rounded-lg border bg-transparent p-3"
              >
                <option value="Card">
                  {locale === "ar" ? "بطاقة بنكية" : "Bank card"}
                </option>
                <option value="BankTransfer">
                  {locale === "ar" ? "تحويل بنكي" : "Bank transfer"}
                </option>
                <option value="EWallet">
                  {locale === "ar" ? "محفظة إلكترونية" : "E-wallet"}
                </option>
              </select>
            </label>
          </section>
        ) : null}
        {evaluationId && (
          <label className="flex items-start gap-3 rounded-xl border border-border bg-surface-solid/60 p-3 text-sm leading-6">
            <input
              type="checkbox"
              checked={authenticityConfirmed}
              disabled={authenticityAlreadyDeclared}
              onChange={(event) =>
                setAuthenticityConfirmed(event.target.checked)
              }
              className="mt-1 size-4 accent-primary"
            />
            <span>
              <strong>
                {locale === "ar"
                  ? "إقرار أصالة العمل"
                  : "Originality declaration"}
              </strong>
              <span className="mt-1 block text-muted">
                {locale === "ar"
                  ? "أقر بأن الملفات والأدلة المقدمة تخصني، وأنني ذكرت أي مصادر أو مساعدة مسموح بها."
                  : "I declare that the submitted files and evidence are my own and that I have acknowledged any permitted sources or assistance."}
              </span>
            </span>
          </label>
        )}
        {!evaluationId ? (
          <button
            disabled={
              resumeRequested ||
              create.isPending ||
              !selected.assessmentScopeId ||
              scopes.length === 0
            }
            className="focus-ring rounded-xl bg-primary px-4 py-3 font-bold text-white"
          >
            {locale === "ar" ? "حفظ ومراجعة الطلب" : "Save and review"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => checkout.mutate()}
            disabled={
              checkout.isPending ||
              Boolean(paymentSession) ||
              !authenticityConfirmed ||
              includedCredit.isPending ||
              includedCredit.isError
            }
            className="focus-ring rounded-xl bg-primary px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checkout.isPending
              ? "…"
              : hasIncludedCredit
                ? locale === "ar"
                  ? "استخدام تقييم المهمة المشمول مع الوحدة"
                  : "Use included assignment evaluation"
                : locale === "ar"
                  ? "متابعة إلى الدفع"
                  : "Continue to payment"}
          </button>
        )}
        {paymentSession ? (
          <section
            className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm"
            aria-live="polite"
          >
            {paymentSession.provider?.startsWith("Fake") ? (
              <>
                <p className="font-black text-primary">
                  {locale === "ar"
                    ? "دفعة اختبارية — بيئة التطوير فقط"
                    : "Development test payment only"}
                </p>
                <p className="mt-1 leading-6 text-muted">
                  {locale === "ar"
                    ? "تم إنشاء جلسة دفع تجريبية. أكملها يدويًا أدناه؛ هذا الزر لا يظهر كبديل عن تأكيد مزود الدفع الحقيقي في الإنتاج."
                    : "A fake development payment session was created. Complete it explicitly below; this is not a substitute for real provider confirmation in production."}
                </p>
                {typeof paymentSession.total === "number" &&
                paymentSession.currency ? (
                  <p className="mt-2 font-black">
                    {locale === "ar" ? "المجموع:" : "Total:"}{" "}
                    {formatLocalizedCurrency(
                      paymentSession.total,
                      paymentSession.currency,
                      locale,
                    )}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={confirmDevelopmentPayment.isPending}
                  onClick={() => confirmDevelopmentPayment.mutate()}
                  className="focus-ring mt-3 rounded-lg border border-primary px-3 py-2 font-black text-primary disabled:opacity-50"
                >
                  {confirmDevelopmentPayment.isPending
                    ? "…"
                    : locale === "ar"
                      ? "إتمام الدفع الاختباري"
                      : "Complete test payment"}
                </button>
              </>
            ) : (
              <>
                <p className="font-black">
                  {locale === "ar"
                    ? "تم إنشاء جلسة الدفع"
                    : "Payment session created"}
                </p>
                <p className="mt-1 leading-6 text-muted">
                  {locale === "ar"
                    ? "لم يُرجع مزود الدفع رابط تحويل. لا تعِد إرسال الطلب؛ تابع حالة الدفع من سجل دفعاتك أو تواصل مع الدعم إذا بقيت الحالة معلقة."
                    : "The payment provider did not return a redirect URL. Do not resubmit the request; check your payment history or contact support if the payment remains pending."}
                </p>
              </>
            )}
          </section>
        ) : null}
        {fileUploadFailed ? (
          <p role="alert" className="text-sm text-red-600">
            {locale === "ar"
              ? "تعذر رفع أحد الملفات. بقيت المسودة محفوظة؛ أعد المحاولة لمتابعة الرفع."
              : "A file could not be uploaded. Your draft is saved; retry to continue the upload."}
          </p>
        ) : null}
        {checkout.isError ? (
          <p role="alert" className="text-sm text-red-600">
            {locale === "ar"
              ? "تعذر إكمال طلب التقييم. لم يُنشأ طلب بديل؛ تحقق من البيانات وأعد المحاولة."
              : "Unable to complete this evaluation request. No replacement request was created; check the details and retry."}
          </p>
        ) : null}
        {(create.isError || confirmDevelopmentPayment.isError) && (
          <p role="alert" className="text-sm text-red-600">
            {(create.error ?? confirmDevelopmentPayment.error) instanceof Error
              ? (create.error ?? confirmDevelopmentPayment.error)?.message
              : "Request failed."}
          </p>
        )}
      </form>
    </section>
  );
}

function Select({
  label,
  value,
  setValue,
  items,
  disabled = false,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  items: { id: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-semibold">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        required
        className="focus-ring min-w-0 w-full max-w-full rounded-lg border bg-transparent p-3"
      >
        <option value="">—</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function EvaluationResumeMessage({
  locale,
  textEn,
  textAr,
}: {
  locale: string;
  textEn: string;
  textAr: string;
}) {
  return (
    <section className="shell py-10">
      <div className="card grid justify-items-start gap-3 p-6">
        <p role="alert">{locale === "ar" ? textAr : textEn}</p>
        <Link
          className="focus-ring font-bold text-primary underline"
          href={`/${locale}/student/evaluations`}
        >
          {locale === "ar" ? "العودة إلى طلباتي" : "Back to My Evaluations"}
        </Link>
      </div>
    </section>
  );
}

function MyEvaluations() {
  const locale = useLocale();
  const result = useStudentEvaluations<{
    id: string;
    status: string;
    price: number;
    currency: string;
    isRetake: boolean;
    isResit: boolean;
    resitOfEvaluationRequestId: string | null;
    retakeOfEvaluationRequestId: string | null;
    criteria: string[];
    academic: AssessmentAcademicSummary | null;
    selectedCriteria: string[];
    submissionAttemptNumber: number;
    revisionDueAtUtc: string | null;
    effectiveRevisionDueAtUtc: string | null;
    calculatedGrade: string | null;
    sectionResults: { section: string; grade: string }[];
    results: {
      criterionCode: string;
      achievement: string;
      evidence: string | null;
      comment: string | null;
    }[];
    evidence: { criterionCode: string; narrative: string }[];
    feedback: {
      body: string;
      requestsResubmission: boolean;
      createdAtUtc: string;
    }[];
  }>();
  const items = result.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <section className="shell py-10">
      <h1 className="text-3xl font-black">
        {locale === "ar" ? "طلبات التقييم" : "Evaluation requests"}
      </h1>
      <StudentResitOpportunities />
      {result.isPending ? (
        <div className="card mt-6 p-5" aria-busy>
          …
        </div>
      ) : null}
      {result.isError && !result.data ? (
        <p role="alert" className="card mt-6 p-5">
          {locale === "ar" ? "تعذر تحميل الطلبات." : "Unable to load requests."}
        </p>
      ) : null}
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <article key={item.id} className="card grid gap-4 p-4">
            {item.isResit ? (
              <div className="grid gap-1 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
                <strong className="text-primary">
                  {locale === "ar"
                    ? "مراجعة Resit نهائية"
                    : "Resit final review"}
                </strong>
                {item.resitOfEvaluationRequestId ? (
                  <span className="text-xs text-muted">
                    {locale === "ar" ? "الطلب الأصلي" : "Original request"}:{" "}
                    {item.resitOfEvaluationRequestId.slice(0, 8)}
                  </span>
                ) : null}
              </div>
            ) : null}
            {item.isRetake && !item.isResit ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
                <strong className="text-primary">
                  {locale === "ar" ? "طلب Retake" : "Retake evaluation"}
                </strong>
                <span className="text-xs text-muted">
                  {locale === "ar"
                    ? "النتيجة محدودة بـ Pass"
                    : "Pass-only outcome"}
                </span>
              </div>
            ) : null}
            <AcademicIdentity academic={item.academic} locale={locale} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-bold">{item.status}</span>
              <span>
                {formatLocalizedCurrency(item.price, item.currency, locale)}
              </span>
            </div>
            {(item.status === "NeedsRevision" || item.status === "Completed") &&
            item.results.length > 0 ? (
              <div className="rounded-xl border border-border/70 bg-surface-solid/70 p-4">
                <h2 className="font-bold">
                  {locale === "ar"
                    ? "المعايير التي حققتها في المهمة"
                    : "Criteria achieved in this task"}
                </h2>
                <div className="mt-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-primary">
                    {item.status === "NeedsRevision"
                      ? locale === "ar"
                        ? "النتيجة التقديرية الحالية من BETCCO"
                        : "Current BETCCO estimated result"
                      : item.isResit
                        ? locale === "ar"
                          ? "النتيجة الاستشارية النهائية للـ Resit"
                          : "Final Resit advisory result"
                        : locale === "ar"
                          ? "النتيجة التقديرية النهائية من BETCCO"
                          : "Final BETCCO estimated result"}
                  </p>
                  <p className="mt-1 text-2xl font-black text-foreground">
                    {item.calculatedGrade ?? "—"}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {item.sectionResults.map((section) => (
                      <p
                        key={section.section}
                        className="rounded-lg border border-border/70 bg-page/40 px-3 py-2 text-xs text-muted"
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
                <p className="mt-3 text-xs leading-5 text-muted">
                  {locale === "ar"
                    ? "هذه نتيجة إرشادية من BETCCO لمساعدتك قبل التسليم الرسمي في المدرسة، وليست علامة رسمية."
                    : "This is BETCCO guidance to help before your official school submission; it is not an official grade."}
                </p>
                <ul
                  className="mt-3 grid gap-2"
                  aria-label={
                    locale === "ar" ? "نتائج المعايير" : "Criterion results"
                  }
                >
                  {item.results.map((criterion) => (
                    <li
                      key={criterion.criterionCode}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-page/40 px-3 py-2"
                    >
                      <span className="font-semibold">
                        {criterion.criterionCode}
                      </span>
                      <span>
                        {criterion.achievement === "Achieved"
                          ? locale === "ar"
                            ? "مُحقَّق"
                            : "Achieved"
                          : locale === "ar"
                            ? "غير مُحقَّق بعد"
                            : "Not achieved yet"}
                      </span>
                      {criterion.comment && (
                        <span className="w-full text-sm text-muted">
                          {criterion.comment}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : item.status !== "Completed" &&
              item.status !== "NeedsRevision" ? (
              <p className="text-sm text-muted">
                {locale === "ar"
                  ? "ستظهر النتيجة التقديرية وملاحظات المعلم بعد انتهاء مراجعة BETCCO."
                  : "Your estimated result and teacher feedback will appear after the BETCCO review."}
              </p>
            ) : null}
            {item.evidence.length ? (
              <div className="rounded-xl border border-border/70 bg-page/40 p-4">
                <h2 className="font-bold">
                  {locale === "ar" ? "ملف الأدلة" : "Evidence portfolio"}
                </h2>
                <ul className="mt-3 grid gap-2 text-sm">
                  {item.evidence.map((evidence) => (
                    <li key={evidence.criterionCode}>
                      <strong>{evidence.criterionCode}: </strong>
                      {evidence.narrative}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {item.feedback.length ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <h2 className="font-bold">
                  {locale === "ar" ? "ملاحظات المعلم" : "Teacher feedback"}
                </h2>
                {item.feedback.map((feedback) => (
                  <p
                    key={feedback.createdAtUtc}
                    className="mt-2 text-sm text-muted"
                  >
                    {feedback.body}
                  </p>
                ))}
              </div>
            ) : null}
            {item.status === "NeedsRevision" && !item.isResit ? (
              <>
                {item.effectiveRevisionDueAtUtc && (
                  <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm font-semibold">
                    {locale === "ar"
                      ? "آخر موعد للمراجعة الثانية: "
                      : "Revision check deadline: "}
                    {formatLocalizedDateTime(
                      item.effectiveRevisionDueAtUtc,
                      locale,
                    )}
                  </p>
                )}
                <EvaluationRevisionSubmission requestId={item.id} />
              </>
            ) : null}
            {item.isRetake && !item.isResit && item.status === "Draft" ? (
              <RetakePayment requestId={item.id} criteria={item.criteria} />
            ) : null}
            {item.isResit && item.status === "Draft" ? (
              <Link
                className="focus-ring w-fit font-bold text-primary underline"
                href={`/${locale}/student/evaluations/${item.id}`}
              >
                {locale === "ar"
                  ? "متابعة تجهيز إعادة التقييم"
                  : "Continue Resit preparation"}
              </Link>
            ) : null}
            {item.status === "Draft" && !item.isRetake && !item.isResit ? (
              <Link
                className="focus-ring w-fit font-bold text-primary underline"
                href={`/${locale}/student/evaluations/new?resume=${encodeURIComponent(item.id)}`}
              >
                {locale === "ar"
                  ? "متابعة تجهيز التقييم"
                  : "Continue evaluation"}
              </Link>
            ) : null}
          </article>
        ))}
      </div>
      {result.isFetchNextPageError ? (
        <p role="alert" className="mt-4 text-sm text-red-500">
          {locale === "ar"
            ? "تعذر تحميل المزيد من الطلبات."
            : "Unable to load more requests."}
        </p>
      ) : null}
      {result.hasNextPage || result.isFetchNextPageError ? (
        <button
          type="button"
          className="focus-ring mt-5 rounded-xl border border-border px-4 py-2 font-semibold disabled:opacity-50"
          disabled={result.isFetchingNextPage}
          onClick={() => void result.fetchNextPage()}
        >
          {result.isFetchingNextPage
            ? locale === "ar"
              ? "جارٍ التحميل…"
              : "Loading…"
            : locale === "ar"
              ? "عرض المزيد من الطلبات"
              : "Load more requests"}
        </button>
      ) : null}
    </section>
  );
}

function RetakePayment({
  requestId,
  criteria,
}: {
  requestId: string;
  criteria: string[];
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("Card");
  const [authenticityConfirmed, setAuthenticityConfirmed] = useState(false);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const checkout = useMutation({
    mutationFn: async () => {
      if (!files.length)
        throw new Error(
          locale === "ar"
            ? "اختر ملف Retake واحدًا على الأقل."
            : "Choose at least one Retake file.",
        );
      if (!authenticityConfirmed)
        throw new Error(
          locale === "ar"
            ? "أكد إقرار أصالة العمل قبل الدفع."
            : "Confirm the originality declaration before payment.",
        );
      for (const file of files) {
        const form = new FormData();
        form.set("file", file);
        await api(`/evaluations/${requestId}/files`, {
          method: "POST",
          body: form,
        });
      }
      await Promise.all(
        Object.entries(evidence)
          .filter(([, narrative]) => narrative.trim())
          .map(([criterionCode, narrative]) =>
            api(`/evaluations/${requestId}/evidence`, {
              method: "POST",
              body: JSON.stringify({ criterionCode, narrative }),
            }),
          ),
      );
      await api(`/evaluations/${requestId}/authenticity-declaration`, {
        method: "POST",
      });
      return api<{ paymentId: string }>(`/evaluations/${requestId}/checkout`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ paymentMethod }),
      });
    },
    onSuccess: async (payment) => {
      await api("/payments/fake/confirm", {
        method: "POST",
        body: JSON.stringify({
          paymentId: payment.paymentId,
          providerEventId: `test_${crypto.randomUUID()}`,
        }),
      });
      await client.invalidateQueries({ queryKey: ["evaluations"] });
    },
  });
  return (
    <section className="grid min-w-0 gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div>
        <h2 className="font-black">
          {locale === "ar" ? "تسليم ودفع Retake" : "Submit and pay for Retake"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {locale === "ar"
            ? "هذا طلب مستقل بملفاته وأدلته وإقرار الأصالة والدفع الخاص به."
            : "This request has its own files, evidence, authenticity declaration, and payment."}
        </p>
      </div>
      <FilePicker
        label={locale === "ar" ? "ملفات Retake" : "Retake files"}
        files={files}
        onFilesChange={setFiles}
        locale={locale}
        accept=".pdf,.docx,.xlsx,.txt,.jpg,.jpeg,.png,.webp"
        multiple
        maxFileBytes={100 * 1024 * 1024}
        chooseLabel={locale === "ar" ? "اختيار الملفات" : "Choose files"}
      />
      {criteria.map((criterion) => (
        <label
          key={criterion}
          className="grid min-w-0 gap-1 text-sm font-semibold"
        >
          {locale === "ar" ? `دليل ${criterion}` : `Evidence for ${criterion}`}
          <textarea
            className="min-h-20 min-w-0 rounded-xl border border-border bg-transparent p-3"
            maxLength={4000}
            value={evidence[criterion] ?? ""}
            onChange={(event) =>
              setEvidence((current) => ({
                ...current,
                [criterion]: event.target.value,
              }))
            }
          />
        </label>
      ))}
      <label className="grid gap-1 text-sm font-semibold">
        {locale === "ar" ? "طريقة الدفع" : "Payment method"}
        <select
          className="min-w-0 rounded-xl border border-border bg-transparent p-3"
          value={paymentMethod}
          onChange={(event) => setPaymentMethod(event.target.value)}
        >
          <option value="Card">
            {locale === "ar" ? "بطاقة بنكية" : "Bank card"}
          </option>
          <option value="BankTransfer">
            {locale === "ar" ? "تحويل بنكي" : "Bank transfer"}
          </option>
          <option value="EWallet">
            {locale === "ar" ? "محفظة إلكترونية" : "E-wallet"}
          </option>
        </select>
      </label>
      <label className="flex items-start gap-3 text-sm leading-6">
        <input
          type="checkbox"
          className="focus-ring mt-1 size-4 accent-primary"
          checked={authenticityConfirmed}
          onChange={(event) => setAuthenticityConfirmed(event.target.checked)}
        />
        <span>
          {locale === "ar"
            ? "أقر بأن ملفات وأدلة Retake المقدمة تخصني."
            : "I declare that the submitted Retake files and evidence are my own."}
        </span>
      </label>
      <button
        type="button"
        className="focus-ring rounded-xl bg-primary px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={checkout.isPending || !files.length || !authenticityConfirmed}
        onClick={() => checkout.mutate()}
      >
        {checkout.isPending
          ? "…"
          : locale === "ar"
            ? "رفع الملفات والدفع"
            : "Upload files and pay"}
      </button>
      {checkout.isError ? (
        <p className="text-sm text-red-500" role="alert">
          {checkout.error instanceof Error
            ? checkout.error.message
            : "Request failed."}
        </p>
      ) : null}
    </section>
  );
}

function EvaluationRevisionSubmission({ requestId }: { requestId: string }) {
  const locale = useLocale();
  const client = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [authenticityConfirmed, setAuthenticityConfirmed] = useState(false);
  const resubmit = useMutation({
    mutationFn: async () => {
      if (!files.length)
        throw new Error(
          locale === "ar"
            ? "اختر ملفًا محدثًا واحدًا على الأقل."
            : "Choose at least one updated file.",
        );
      if (!authenticityConfirmed)
        throw new Error(
          locale === "ar"
            ? "يجب تأكيد إقرار أصالة النسخة المعدلة قبل إرسالها."
            : "Confirm the revised-work originality declaration before submitting.",
        );
      for (const file of files) {
        if (file.size > 100 * 1024 * 1024)
          throw new Error(
            locale === "ar"
              ? "الحد الأقصى 100MB لكل ملف."
              : "Each file is limited to 100MB.",
          );
        const body = new FormData();
        body.set("file", file);
        await api(`/evaluations/${requestId}/files`, { method: "POST", body });
      }
      await api(`/evaluations/${requestId}/authenticity-declaration`, {
        method: "POST",
      });
      return api(`/evaluations/${requestId}/resubmit`, { method: "POST" });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["evaluations"] }),
  });
  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <h2 className="font-black">
        {locale === "ar"
          ? "إرسال النسخة المعدلة للفحص"
          : "Submit revised assignment for checking"}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {locale === "ar"
          ? "عدّل المهمة بناءً على ملاحظات المعلم، ثم أرسل النسخة الجديدة لاستخدام فرصة الفحص الثانية والأخيرة."
          : "Revise the assignment using the teacher feedback, then send the updated version for your second and final review check."}
      </p>
      <div className="mt-3">
        <FilePicker
          label={locale === "ar" ? "النسخة المعدلة" : "Updated files"}
          files={files}
          onFilesChange={setFiles}
          locale={locale}
          accept=".pdf,.docx,.xlsx,.txt,.jpg,.jpeg,.png,.webp"
          multiple
          maxFileBytes={100 * 1024 * 1024}
          chooseLabel={
            locale === "ar" ? "اختيار ملفات محدثة" : "Choose updated files"
          }
          helpText={
            locale === "ar"
              ? "يمكنك اختيار أكثر من ملف، بحد أقصى 100MB لكل ملف."
              : "You can select multiple files, up to 100MB per file."
          }
        />
      </div>
      <label className="mt-3 flex items-start gap-3 rounded-lg border border-border bg-surface-solid/60 p-3 text-sm leading-6">
        <input
          type="checkbox"
          checked={authenticityConfirmed}
          onChange={(event) => setAuthenticityConfirmed(event.target.checked)}
          className="mt-1 size-4 accent-primary"
        />
        <span>
          <strong>
            {locale === "ar"
              ? "إقرار أصالة النسخة المعدلة"
              : "Updated-work originality declaration"}
          </strong>
          <span className="mt-1 block text-muted">
            {locale === "ar"
              ? "أقر بأن النسخة المعدلة والأدلة المرفقة تخصني وأنني أوضحت أي مصادر أو مساعدة مسموح بها."
              : "I declare that this revised work and its evidence are my own and that I have acknowledged any permitted sources or assistance."}
          </span>
        </span>
      </label>
      <button
        type="button"
        onClick={() => resubmit.mutate()}
        disabled={resubmit.isPending || !files.length || !authenticityConfirmed}
        className="focus-ring mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60"
      >
        {locale === "ar" ? "إرسال النسخة المعدلة" : "Submit revised assignment"}
      </button>
      {resubmit.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {resubmit.error instanceof Error
            ? resubmit.error.message
            : "Request failed."}
        </p>
      ) : null}
    </section>
  );
}
