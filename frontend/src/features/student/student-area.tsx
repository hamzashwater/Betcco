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
import styles from "./student-learning-presentation.module.css";
import playerStyles from "./student-course-player.module.css";
import wizardStyles from "./student-evaluation-wizard.module.css";
import { useDialogFocus } from "@/components/navigation/use-dialog-focus";
import { createPortal } from "react-dom";
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
  CourseCard,
  StudentCoursesLearningHub,
} from "@/features/student/student-courses-learning-hub";
import {
  ArrowLeft,
  ArrowUpRight,
  X,
  ArrowRight,
  Bookmark,
  BookOpenCheck,
  CalendarDays,
  CircleCheckBig,
  ClipboardCheck,
  CreditCard,
  FileBadge,
  FolderOpen,
  LockKeyhole,
  ListVideo,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  StickyNote,
  Timer,
  Trophy,
  UserRound,
} from "lucide-react";
import {
  Action,
  actionClassName,
  QueryState,
  DashboardHeader,
} from "@/components/dashboard/dashboard-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

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
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
      {content}
    </div>
  );
}

function StudentDashboard() {
  const t = useTranslations("studentWorkspace");
  const locale = useLocale();
  const hub = useTranslations("studentCoursesLearningHub");
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
  // Presentation only: the first usable item in the server's existing Recent order.
  const currentCourse =
    courses.data?.items.find((course) => course.accessAvailable) ??
    courses.data?.items[0];
  return (
    <section
      className="shell min-w-0 py-6 sm:py-8"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold sm:text-3xl">
          {t("dashboard.title")}
        </h1>
      </header>
      <div className={styles.todayGrid}>
        <section
          className={styles.currentLearning}
          aria-label={t("dashboard.continueLearning")}
        >
          {courses.isPending ? (
            <>
              <h2 className="mb-3 text-lg font-bold">
                {t("dashboard.continueLearning")}
              </h2>
              <QueryState kind="loading" title={courseLoadingCopy} />
            </>
          ) : courseUnavailable ? (
            <>
              <h2 className="mb-3 text-lg font-bold">
                {t("dashboard.continueLearning")}
              </h2>
              <QueryState
                kind="error"
                title={courseErrorCopy}
                action={
                  <Action
                    variant="secondary"
                    onClick={() => void courses.refetch()}
                    pending={courses.isFetching}
                    pendingLabel={t("dashboard.retrying")}
                  >
                    {t("dashboard.retryCourses")}
                  </Action>
                }
              />
            </>
          ) : currentCourse ? (
            <CourseCard
              key={currentCourse.courseId}
              course={currentCourse}
              featured
            />
          ) : (
            <>
              <h2 className="mb-3 text-lg font-bold">
                {t("dashboard.continueLearning")}
              </h2>
              {courseSummary?.totalCourses === 0 ? (
                <QueryState kind="empty" title={hub("empty.noCourses")} />
              ) : null}
              <Link
                href={`/${locale}/student/courses`}
                className={actionClassName("secondary", "mt-3")}
              >
                {hub("viewAll")}
              </Link>
            </>
          )}
          {courses.isError && courses.data ? (
            <QueryState
              kind="error"
              title={courseErrorCopy}
              className="mt-3"
              action={
                <Action
                  variant="secondary"
                  onClick={() => void courses.refetch()}
                  pending={courses.isFetching}
                  pendingLabel={t("dashboard.retrying")}
                >
                  {t("dashboard.retryCourses")}
                </Action>
              }
            />
          ) : null}
          {currentCourse && (
            <Link
              href={`/${locale}/student/courses`}
              className={actionClassName("quiet", "mt-2 px-0!")}
            >
              {hub("viewAll")}
              <ArrowRight
                size={17}
                className="rtl:rotate-180"
                aria-hidden="true"
              />
            </Link>
          )}
        </section>
        <div className={styles.attention}>
          {overview.isError ? (
            <QueryState
              kind="error"
              title={overviewErrorCopy}
              action={
                <Action
                  variant="secondary"
                  onClick={() => void overview.refetch()}
                  pending={overview.isFetching}
                  pendingLabel={t("dashboard.retrying")}
                >
                  {t("dashboard.retryOverview")}
                </Action>
              }
            />
          ) : null}
          <section
            className="min-w-0"
            aria-labelledby="student-pending-actions-heading"
          >
            <h2
              id="student-pending-actions-heading"
              className="text-xl font-black"
            >
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
              <div className="mt-3">
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
                      className={styles.attentionRow}
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold leading-6">{title}</h3>
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
                          <p className="mt-2 text-sm font-semibold text-text-secondary">
                            {t("dashboard.pendingActions.revisionDeadline")}{" "}
                            {formatLocalizedDateTime(
                              action.effectiveDueAtUtc,
                              locale,
                            )}
                          </p>
                        ) : null}
                      </div>
                      <Link
                        className={actionClassName(
                          "quiet",
                          "justify-start! px-0! underline",
                        )}
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
        </div>
        <section
          className={styles.upcoming}
          aria-label={t("dashboard.deadlines.heading")}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
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
            <div className="mt-4">
              {upcomingAssignments.map((assignment) => (
                <Link
                  key={assignment.id}
                  href={`/${locale}/student/learn/${assignment.courseId}`}
                  className="focus-ring block border-b border-border-subtle! py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black">{assignment.title}</h3>
                      <p className="mt-1 text-xs text-muted">
                        {assignment.courseTitle}
                      </p>
                    </div>
                    <ClipboardCheck
                      className="shrink-0 text-primary"
                      size={18}
                    />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-text-secondary">
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
      </div>
      <div
        className={styles.overviewBand}
        aria-busy={courses.isPending || overview.isPending}
      >
        <StudentOverviewMetric
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
        <StudentOverviewMetric
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
        <StudentOverviewMetric
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
        <StudentOverviewMetric
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
        <StudentOverviewMetric
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
        <StudentOverviewMetric
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

      <section className={styles.openSection}>
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
                className="min-w-0 border-s-2 border-border-default! ps-4"
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

      <div className={styles.utilityLinks}>
        <Link
          href={`/${locale}/student/evaluations/new`}
          className={actionClassName("secondary")}
        >
          {t("dashboard.quickLinks.evaluateTitle")}
        </Link>
        <Link
          href={`/${locale}/student/planner`}
          className={actionClassName("quiet")}
        >
          {t("dashboard.quickLinks.plannerTitle")}
        </Link>
        <Link
          href={`/${locale}/student/support`}
          className={actionClassName("quiet")}
        >
          {t("navigation.support")}
        </Link>
      </div>
      <MotivationCard variant="dashboard" className="mt-6" />
    </section>
  );
}

function StudentOverviewMetric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: typeof BookOpenCheck;
  tone?: string;
}) {
  return (
    <article className={styles.metric}>
      <div className="flex items-start gap-2 text-xs leading-5 text-text-secondary">
        <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>{label}</p>
      </div>
      <p className={styles.metricValue}>{value}</p>
      {detail && <p className="text-xs leading-5 text-text-muted">{detail}</p>}
    </article>
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
  const t = useTranslations("studentWorkspace.certificateDocument");
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
          {t("errors.notFound")}
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
          {t("actions.back")}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="focus-ring inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950"
        >
          <FileBadge size={17} aria-hidden="true" />
          {t("actions.print")}
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
            {t("content.type")}
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">
            {certificate.data.studentName}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-8 text-[#31596f] sm:text-lg">
            {t("content.completionStatement")}
          </p>
          <h2 className="mt-5 text-2xl font-black text-[#1b4f72] sm:text-3xl">
            {certificate.data.courseTitle}
          </h2>
          <div className="mx-auto mt-9 grid max-w-lg gap-4 border-y border-[#1b4f72]/20 py-5 text-sm sm:grid-cols-2">
            <div>
              <p className="font-bold text-[#31596f]">
                {t("content.issueDate")}
              </p>
              <p className="mt-1 font-black">{issuedOn}</p>
            </div>
            <div>
              <p className="font-bold text-[#31596f]">
                {t("content.certificateId")}
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
              alt={t("qr.alt")}
              width={120}
              height={120}
              className="size-28"
            />
            <p className="max-w-36 text-center text-[10px] font-bold text-[#31596f]">
              {t("qr.help")}
            </p>
          </div>
          <p className="mt-7 text-xs leading-5 text-[#496679]">
            {t("disclaimer")}
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
  const [mobileOutlineOpen, setMobileOutlineOpen] = useState(false);
  const outlineDialog = useRef<HTMLDivElement>(null);
  const currentOutlineLink = useRef<HTMLAnchorElement>(null);
  useDialogFocus(
    mobileOutlineOpen,
    outlineDialog,
    () => setMobileOutlineOpen(false),
    currentOutlineLink,
  );
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileOutlineOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

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
      <section className="shell py-8">
        <QueryState kind="loading" title={t("loading")} />
      </section>
    );
  if (result.isError || !result.data) {
    const denied =
      result.error &&
      "status" in result.error &&
      [401, 403].includes(Number(result.error.status));
    return (
      <section className="shell py-8">
        <QueryState
          kind={denied ? "restricted" : "error"}
          title={
            denied ? t("coursePlayer.noAccess") : t("dashboard.courseLoadError")
          }
          action={
            !denied ? (
              <Action
                variant="secondary"
                pending={result.isFetching}
                pendingLabel={t("loading")}
                onClick={() => void result.refetch()}
              >
                {t("dashboard.retryCourses")}
              </Action>
            ) : undefined
          }
        />
      </section>
    );
  }
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
  const outline = (headingId: string, mobile = false) => (
    <PlayerOutline
      modules={visibleModules}
      currentLessonId={lesson?.id}
      headingId={headingId}
      lessonHref={lessonHref}
      lockedMessage={lockedMessage}
      currentLinkRef={mobile ? currentOutlineLink : undefined}
      onNavigate={mobile ? () => setMobileOutlineOpen(false) : undefined}
    />
  );
  return (
    <section
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={`shell ${playerStyles.workspace}`}
    >
      <header className={playerStyles.courseContext}>
        <div className="min-w-0">
          <Link
            href={`/${locale}/student/courses`}
            className="focus-ring inline-flex min-h-11 items-center gap-2 text-sm font-bold text-text-link"
          >
            <ArrowLeft
              size={17}
              className="rtl:rotate-180"
              aria-hidden="true"
            />
            {t("navigation.courses")}
          </Link>
          <p className="mt-1 text-sm font-semibold text-text-secondary break-words">
            {result.data.title}
          </p>
        </div>
        <Action
          variant="secondary"
          className={playerStyles.desktopControl}
          onClick={() => setSidebarOpen((value) => !value)}
          aria-expanded={sidebarOpen}
          aria-controls="player-course-content"
        >
          {sidebarOpen ? (
            <PanelRightClose size={18} aria-hidden="true" />
          ) : (
            <PanelRightOpen size={18} aria-hidden="true" />
          )}
          {sidebarOpen
            ? t("coursePlayer.hideContent")
            : t("coursePlayer.showContent")}
        </Action>
        <Action
          variant="secondary"
          className={playerStyles.mobileControl}
          onClick={() => setMobileOutlineOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={mobileOutlineOpen}
          aria-controls="player-mobile-content"
        >
          <ListVideo size={18} aria-hidden="true" />
          {t("coursePlayer.courseContent")}
        </Action>
      </header>
      {result.data.requestedLessonRejected ? (
        <div role="alert" className="mb-5">
          <QueryState
            kind="unavailable"
            title={t("coursePlayer.requestedLessonUnavailable")}
          />
        </div>
      ) : null}
      <div className={playerStyles.layout} data-outline-open={sidebarOpen}>
        <div className="min-w-0">
          {lesson ? (
            <section
              aria-labelledby="player-current-lesson"
              className={playerStyles.lesson}
            >
              <header className={playerStyles.lessonHeader}>
                <h1
                  id="player-current-lesson"
                  className={playerStyles.lessonTitle}
                >
                  {lesson.title}
                </h1>
                <div className={playerStyles.lessonMeta}>
                  <span>{lesson.type}</span>
                  {Math.round(lesson.durationSeconds / 60) > 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Timer size={15} aria-hidden="true" />
                      {formatLocalizedNumber(
                        Math.round(lesson.durationSeconds / 60),
                        locale,
                      )}{" "}
                      {t("coursePlayer.minutes")}
                    </span>
                  ) : null}
                  {lesson.isCompleted ? (
                    <span className="inline-flex items-center gap-1.5 font-bold">
                      <CircleCheckBig size={16} aria-hidden="true" />
                      {t("coursePlayer.completed")}
                    </span>
                  ) : null}
                </div>
              </header>
              {lesson.isLocked ? (
                <QueryState
                  kind="restricted"
                  title={lockedMessage(
                    lesson.lockReason,
                    lesson.availableAtUtc,
                  )}
                />
              ) : lesson.video ? (
                <>
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
                  {lesson.body ? (
                    <div className={playerStyles.lessonBody}>{lesson.body}</div>
                  ) : null}
                </>
              ) : (
                <div className={playerStyles.readingCanvas}>
                  <BookOpenCheck
                    size={25}
                    className="text-text-link"
                    aria-hidden="true"
                  />
                  <div className={playerStyles.lessonBody}>
                    {lesson.body || t("coursePlayer.noLessonText")}
                  </div>
                </div>
              )}
              <div className={playerStyles.lessonNavigation}>
                {previousLesson ? (
                  <Link
                    href={lessonHref(previousLesson.id)}
                    className={actionClassName("secondary")}
                  >
                    <ArrowLeft
                      size={17}
                      className="rtl:rotate-180"
                      aria-hidden="true"
                    />
                    {t("coursePlayer.previousLesson")}
                  </Link>
                ) : (
                  <Action variant="secondary" disabled>
                    <ArrowLeft
                      size={17}
                      className="rtl:rotate-180"
                      aria-hidden="true"
                    />
                    {t("coursePlayer.previousLesson")}
                  </Action>
                )}
                <Action
                  variant="secondary"
                  pending={progress.isPending}
                  pendingLabel={t("loading")}
                  onClick={() =>
                    progress.mutate({
                      lessonId: lesson.id,
                      lastPositionSeconds: lesson.lastPositionSeconds,
                      markCompleted: true,
                    })
                  }
                  disabled={
                    lesson.isLocked ||
                    lesson.isCompleted ||
                    lesson.type === "Video"
                  }
                >
                  <CircleCheckBig size={18} aria-hidden="true" />
                  {lesson.isCompleted
                    ? t("coursePlayer.completed")
                    : lesson.type === "Video"
                      ? t("coursePlayer.videoCompletion")
                      : t("coursePlayer.markComplete")}
                </Action>
                {nextLesson ? (
                  <Link
                    href={lessonHref(nextLesson.id)}
                    className={actionClassName("primary")}
                  >
                    {t("coursePlayer.nextLesson")}
                    <ArrowRight
                      size={17}
                      className="rtl:rotate-180"
                      aria-hidden="true"
                    />
                  </Link>
                ) : (
                  <Action disabled>
                    {t("coursePlayer.nextLesson")}
                    <ArrowRight
                      size={17}
                      className="rtl:rotate-180"
                      aria-hidden="true"
                    />
                  </Action>
                )}
              </div>
              {progress.isSuccess ? (
                <p role="status" className="mt-3 text-sm text-success">
                  {t("coursePlayer.progressSaved")}
                </p>
              ) : null}
              {progress.isError ? (
                <p role="alert" className="mt-3 text-sm text-danger">
                  {t("coursePlayer.progressSaveError")}
                </p>
              ) : null}
              {!lesson.isLocked && lesson.resources.length ? (
                <section
                  className={playerStyles.lessonResources}
                  aria-labelledby="player-lesson-files"
                >
                  <h2 id="player-lesson-files" className="text-base font-bold">
                    {t("coursePlayer.lessonFiles")}
                  </h2>
                  <ul className="mt-3 grid gap-2">
                    {lesson.resources.map((resource) => (
                      <li key={resource.id} className="min-w-0">
                        <a
                          href={
                            resource.externalUrl ||
                            `/api/v1/learning/lessons/${lesson.id}/resources/${resource.id}`
                          }
                          target={resource.externalUrl ? "_blank" : undefined}
                          rel={resource.externalUrl ? "noreferrer" : undefined}
                          className="focus-ring flex min-h-11 items-center gap-3 py-2 text-sm font-semibold text-text-link break-words"
                        >
                          <FileBadge
                            size={19}
                            className="shrink-0"
                            aria-hidden="true"
                          />
                          <span className="min-w-0 break-words">
                            {resource.displayName}
                          </span>
                          {resource.externalUrl ? (
                            <ArrowUpRight
                              size={17}
                              className="shrink-0 rtl:-scale-x-100"
                              aria-hidden="true"
                            />
                          ) : null}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {lesson.type === "Assignment" ? (
                <div className={playerStyles.secondarySlot}>
                  <CourseAssignmentPanel
                    courseId={courseId}
                    lessonId={lesson.id}
                  />
                  <Link
                    className={actionClassName("quiet", "mt-3")}
                    href={`/${locale}/student/evaluations/new`}
                  >
                    {t("coursePlayer.evaluateAssignment")}
                  </Link>
                </div>
              ) : null}
            </section>
          ) : (
            <>
              <h1 className={playerStyles.lessonTitle}>{result.data.title}</h1>
              <QueryState
                kind="empty"
                title={t("coursePlayer.noPublishedLesson")}
                className="mt-5"
              />
            </>
          )}
          <div className={playerStyles.secondary}>
            <StudentProgressIntelligence courseId={courseId} />
            <StudentLearningAimPractice courseId={courseId} />
            <StudentComprehensivePractice courseId={courseId} />
            {lesson ? (
              <>
                <CourseResourceCenter courseId={courseId} />
                <CourseAnnouncementsPanel courseId={courseId} />
                <LessonWorkspace
                  key={lesson.id}
                  courseId={courseId}
                  lessonId={lesson.id}
                />
                <StudentCourseGradebookPanel courseId={courseId} />
                <AiTutorPanel courseId={courseId} lessonId={lesson.id} />
                <div className={playerStyles.secondarySlot}>
                  <Action
                    variant="quiet"
                    onClick={() => certificate.mutate()}
                    pending={certificate.isPending}
                    pendingLabel={t("loading")}
                  >
                    <FileBadge size={18} aria-hidden="true" />
                    {t("coursePlayer.issueCertificate")}
                  </Action>
                  {certificate.data ? (
                    <p role="status" className="mt-3 text-sm text-success">
                      {t("coursePlayer.certificateIssued")}{" "}
                      {certificate.data.verificationCode}
                    </p>
                  ) : null}
                  {certificate.isError ? (
                    <p role="alert" className="mt-3 text-sm text-danger">
                      {certificate.error instanceof Error
                        ? certificate.error.message
                        : t("coursePlayer.completeLessonsFirst")}
                    </p>
                  ) : null}
                </div>
                <MotivationCard variant="player" className="mt-6" />
              </>
            ) : null}
          </div>
        </div>
        <aside
          id="player-course-content"
          aria-labelledby="player-outline-title"
          hidden={!sidebarOpen || mobileOutlineOpen}
          className={playerStyles.desktopOutline}
        >
          {outline("player-outline-title")}
        </aside>
      </div>
      {mobileOutlineOpen
        ? createPortal(
            <div
              className={playerStyles.backdrop}
              onClick={(event) => {
                if (event.target === event.currentTarget)
                  setMobileOutlineOpen(false);
              }}
            >
              <div
                ref={outlineDialog}
                id="player-mobile-content"
                role="dialog"
                aria-modal="true"
                aria-labelledby="player-mobile-outline-title"
                tabIndex={-1}
                dir={locale === "ar" ? "rtl" : "ltr"}
                className={playerStyles.outlineDrawer}
              >
                <div className={playerStyles.drawerClose}>
                  <Action
                    variant="quiet"
                    onClick={() => setMobileOutlineOpen(false)}
                  >
                    <X size={19} aria-hidden="true" />
                    {t("coursePlayer.hideContent")}
                  </Action>
                </div>
                {outline("player-mobile-outline-title", true)}
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function PlayerOutline({
  modules,
  currentLessonId,
  headingId,
  lessonHref,
  lockedMessage,
  currentLinkRef,
  onNavigate,
}: {
  modules: StudentCoursePlayerResult["modules"];
  currentLessonId?: string;
  headingId: string;
  lessonHref: (id: string) => string;
  lockedMessage: (reason?: string, date?: string) => string;
  currentLinkRef?: RefObject<HTMLAnchorElement | null>;
  onNavigate?: () => void;
}) {
  const t = useTranslations("studentWorkspace");
  return (
    <>
      <h2
        id={headingId}
        className="flex items-center gap-2 text-base font-extrabold"
      >
        <ListVideo size={20} aria-hidden="true" />
        {t("coursePlayer.courseContent")}
      </h2>
      <div className="mt-5 grid gap-5">
        {modules.map((module) => (
          <section
            key={module.id}
            className="min-w-0"
            aria-label={module.title}
          >
            <h3 className="text-sm leading-6 font-bold break-words">
              {module.title}
            </h3>
            {module.isLocked ? (
              <p className="mt-2 text-xs leading-5 text-text-secondary">
                {lockedMessage(module.lockReason, module.availableAtUtc)}
              </p>
            ) : null}
            <ul className="mt-2 grid gap-1">
              {module.lessons.map((item) => (
                <li key={item.id} className="min-w-0">
                  {item.isLocked ? (
                    <div className={playerStyles.lockedRow}>
                      <button
                        type="button"
                        disabled
                        aria-current={
                          item.id === currentLessonId ? "page" : undefined
                        }
                        title={lockedMessage(
                          item.lockReason,
                          item.availableAtUtc,
                        )}
                        aria-describedby={`${headingId}-${item.id}-lock`}
                        className={playerStyles.lockedLesson}
                      >
                        <span>{item.title}</span>
                        <LockKeyhole
                          size={16}
                          className="shrink-0"
                          aria-hidden="true"
                        />
                      </button>
                      <p
                        id={`${headingId}-${item.id}-lock`}
                        className="mt-1 text-xs leading-5 text-text-secondary"
                      >
                        {lockedMessage(item.lockReason, item.availableAtUtc)}
                      </p>
                    </div>
                  ) : (
                    <Link
                      href={lessonHref(item.id)}
                      aria-current={
                        currentLessonId === item.id ? "page" : undefined
                      }
                      ref={
                        currentLessonId === item.id ? currentLinkRef : undefined
                      }
                      onClick={onNavigate}
                      className={`focus-ring ${playerStyles.outlineLesson}`}
                    >
                      <span className="min-w-0 break-words">{item.title}</span>
                      {item.isCompleted ? (
                        <CircleCheckBig
                          size={17}
                          className="shrink-0"
                          aria-label={t("coursePlayer.completed")}
                        />
                      ) : currentLessonId === item.id ? (
                        <ArrowRight
                          size={17}
                          className="shrink-0 rtl:rotate-180"
                          aria-hidden="true"
                        />
                      ) : null}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
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
    <div className={playerStyles.videoSurface}>
      <video
        key={retryCount}
        controls
        preload="metadata"
        className="aspect-video w-full"
        dir="ltr"
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
            className={actionClassName(
              "secondary",
              "border-white/40! bg-transparent! text-white!",
            )}
            onClick={() => {
              setPlaybackState("loading");
              setRetryCount((count) => count + 1);
            }}
          >
            {t("lessonVideo.retry")}
          </button>
        </div>
      ) : null}
      <div className={playerStyles.videoCaption}>
        <p className="text-xs text-slate-300 break-words">
          {lesson.video?.displayName}
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
  const t = useTranslations("studentWorkspace.evaluationWizard");
  const loadingLabel = useTranslations(
    "studentWorkspace.myEvaluations.pagination",
  )("loading");
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
        throw new Error(t("errors.fileRequired"));
      if (!authenticityConfirmed)
        throw new Error(t("errors.authenticityRequired"));
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
        throw new Error(t("errors.invalidDevelopmentPayment"));
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
    return <EvaluationResumeMessage locale={locale} kind="incomplete" />;
  if (resumeRequested && resumeDetail.isPending)
    return (
      <section className="shell py-10">
        <QueryState kind="loading" title={t("resume.loading")} />
      </section>
    );
  if (resumeRequested && (resumeDetail.isError || !resumeDetail.data))
    return (
      <section className="shell py-10">
        <div className="card grid justify-items-start gap-3 p-6">
          <p role="alert">{t("resume.loadError")}</p>
          <button
            type="button"
            onClick={() => void resumeDetail.refetch()}
            className="focus-ring rounded-lg border border-primary px-3 py-2 font-semibold text-primary"
          >
            {t("resume.retry")}
          </button>
          <Link
            className="focus-ring font-bold text-primary underline"
            href={`/${locale}/student/evaluations`}
          >
            {t("resume.back")}
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
    return <EvaluationResumeMessage locale={locale} kind="invalid" />;
  if (resumeRequested && resumeDetail.data && !evaluationId)
    return (
      <section className="shell py-10">
        <QueryState kind="loading" title={t("resume.restoring")} />
      </section>
    );
  if (!resumeRequested && options.isPending)
    return (
      <section className="shell py-10">
        <QueryState kind="loading" title={loadingLabel} />
      </section>
    );
  if (!resumeRequested && (options.isError || !options.data))
    return (
      <section className="shell py-10">
        <QueryState kind="error" title={t("errors.options")} />
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
    <section className={`shell ${wizardStyles.workspace}`}>
      <header className={wizardStyles.header}>
        <p className={wizardStyles.eyebrow}>{t("header.eyebrow")}</p>
        <h1>{t("header.title")}</h1>
        <p>{t("header.description")}</p>
      </header>
      <ol className={wizardStyles.stages}>
        <li aria-current={!evaluationId ? "step" : undefined}>
          {`01 · ${t("scope.assessment")}`}
        </li>
        <li aria-current={evaluationId && !paymentSession ? "step" : undefined}>
          {`02 · ${t("evidence.portfolio")}`}
        </li>
        <li aria-current={paymentSession ? "step" : undefined}>
          {`03 · ${hasIncludedCredit ? t("actions.included") : t("actions.payment")}`}
        </li>
      </ol>
      <form
        className={wizardStyles.layout}
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !resumeRequested &&
            !evaluationId &&
            !create.isPending &&
            selected.assessmentScopeId
          )
            create.mutate();
        }}
      >
        <div className={wizardStyles.work}>
          {evaluationId ? (
            <section
              className={wizardStyles.saved}
              aria-labelledby="evaluation-draft-title"
            >
              <div className={wizardStyles.sectionHeading}>
                <ClipboardCheck size={22} aria-hidden="true" />
                <h2 id="evaluation-draft-title">{t("draft.title")}</h2>
              </div>
              <AcademicIdentity
                academic={
                  resumeRequested
                    ? (resumeDetail.data?.academic ?? null)
                    : (currentScope ?? null)
                }
                locale={locale}
              />
              <div className={wizardStyles.savedFacts}>
                <p>
                  {t("draft.savedCriteria")}:{" "}
                  {evaluationCriteria.join(", ") || "—"}
                </p>
                <p>
                  {t("draft.savedPrice")}:{" "}
                  {evaluationPrice ? (
                    <bdi>
                      {formatLocalizedCurrency(
                        evaluationPrice.price,
                        evaluationPrice.currency,
                        locale,
                      )}
                    </bdi>
                  ) : (
                    "—"
                  )}
                </p>
              </div>
              <label className="grid gap-1 text-sm font-semibold">
                {t("evidence.comment")}
                <textarea
                  value={selected.comment}
                  readOnly={Boolean(evaluationId) || create.isPending}
                  onChange={(event) =>
                    setSelected({
                      ...selected,
                      comment: event.target.value.slice(0, 1000),
                    })
                  }
                  className="min-h-24 rounded-lg border bg-transparent p-3"
                />
              </label>
            </section>
          ) : (
            <section className={wizardStyles.panel}>
              <div className={wizardStyles.sectionHeading}>
                <BookOpenCheck size={22} aria-hidden="true" />
                <h2 id="evaluation-scope-title">{t("scope.assessment")}</h2>
              </div>
              {scopes.length === 0 ? (
                <QueryState kind="empty" title={t("scope.none")} />
              ) : null}
              <div className={wizardStyles.selects}>
                <Select
                  label={t("scope.qualification")}
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
                  disabled={Boolean(evaluationId) || create.isPending}
                />
                <Select
                  label={t("scope.grade")}
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
                  disabled={
                    !selected.qualification ||
                    Boolean(evaluationId) ||
                    create.isPending
                  }
                />
                <Select
                  label={t("scope.specialization")}
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
                  disabled={
                    !selected.grade || Boolean(evaluationId) || create.isPending
                  }
                />
                <Select
                  label={t("scope.unit")}
                  value={selected.unit}
                  setValue={(value) =>
                    setSelected({
                      ...selected,
                      unit: value,
                      assessmentScopeId: "",
                    })
                  }
                  items={units}
                  disabled={
                    !selected.specialization ||
                    Boolean(evaluationId) ||
                    create.isPending
                  }
                />
                <Select
                  label={t("scope.assessment")}
                  value={selected.assessmentScopeId}
                  setValue={(value) =>
                    setSelected({ ...selected, assessmentScopeId: value })
                  }
                  items={forUnit.map((item) => ({
                    id: item.assessmentScopeId,
                    label: `${item.assessmentCode} · ${locale === "ar" ? item.assessmentArabicTitle : item.assessmentEnglishTitle} (v${item.assessmentVersion}${forUnit.length > 1 ? ` · ${t("scope.scopeLabel")} ${item.scopeVersion}` : ""})`,
                  }))}
                  disabled={
                    !selected.unit || Boolean(evaluationId) || create.isPending
                  }
                />
              </div>
              {currentScope ? (
                <div
                  className="rounded-xl border border-border bg-surface-solid/60 p-4 text-sm"
                  role="status"
                >
                  <AcademicIdentity academic={currentScope} locale={locale} />
                  <p className="font-bold">{t("scope.coverage")}</p>
                  <p className="mt-2">
                    {t("scope.aims")}:{" "}
                    {currentScope.learningAimCodes.join(", ")}
                  </p>
                  <p className="mt-1">
                    {t("scope.criteria")}:{" "}
                    {currentScope.criteria
                      .map((item) => `${item.code} (${item.band})`)
                      .join(", ")}
                  </p>
                </div>
              ) : null}

              <label className="grid gap-1 text-sm font-semibold">
                {t("evidence.comment")}
                <textarea
                  value={selected.comment}
                  readOnly={Boolean(evaluationId) || create.isPending}
                  onChange={(event) =>
                    setSelected({
                      ...selected,
                      comment: event.target.value.slice(0, 1000),
                    })
                  }
                  className="min-h-24 rounded-lg border bg-transparent p-3"
                />
              </label>
            </section>
          )}
          <section className={wizardStyles.panel}>
            <div className={wizardStyles.sectionHeading}>
              <FolderOpen size={22} aria-hidden="true" />
              <h2 id="evaluation-files-title">{t("files.label")}</h2>
            </div>
            {resumeRequested && resumeDetail.data ? (
              <div className={wizardStyles.serverFiles}>
                <h3>{t("draft.uploadedFiles")}</h3>
                {resumeDetail.data.files.length ? (
                  <ul>
                    {resumeDetail.data.files.map((file) => (
                      <li key={file.id}>
                        <a
                          className="focus-ring font-semibold text-primary underline"
                          href={`/api/v1/evaluations/${encodeURIComponent(resumeDetail.data.id)}/files/${encodeURIComponent(file.id)}`}
                        >
                          <bdi>{file.originalFileName}</bdi>
                        </a>
                        <p>
                          {t("draft.scanStatus")}: {file.scanStatus}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">{t("draft.noFiles")}</p>
                )}
              </div>
            ) : null}
            {!resumeRequested && uploadedFileKeys.length > 0 ? (
              <div className={wizardStyles.serverFiles} role="status">
                <h3>{t("draft.uploadedFiles")}</h3>
                <ul>
                  {files
                    .filter((item) => uploadedFileKeys.includes(fileKey(item)))
                    .map((item) => (
                      <li key={fileKey(item)}>
                        <bdi>{item.name}</bdi>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
            <FilePicker
              label={t("files.label")}
              files={files}
              onFilesChange={setFiles}
              locale={locale}
              accept=".pdf,.docx,.xlsx,.txt,.jpg,.jpeg,.png,.webp"
              multiple
              maxFileBytes={maxFileBytes}
              chooseLabel={t("files.choose")}
              helpText={t("files.help")}
            />
          </section>
          {evaluationId && (
            <section className={wizardStyles.panel}>
              <div>
                <h2 className="font-black">{t("evidence.portfolio")}</h2>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {t("evidence.description")}
                </p>
              </div>
              {evaluationCriteria.map((criterion) => (
                <label key={criterion} className={wizardStyles.criterion}>
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
                    placeholder={t("evidence.placeholder")}
                  />
                </label>
              ))}
            </section>
          )}

          {evaluationId && (
            <label className={wizardStyles.authenticity}>
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
                <strong>{t("authenticity.title")}</strong>
                <span className="mt-1 block text-muted">
                  {t("authenticity.description")}
                </span>
              </span>
            </label>
          )}
        </div>
        <div className={wizardStyles.review}>
          {!evaluationId ? (
            <div className={wizardStyles.service}>
              <h2>{t("intro.creditTitle")}</h2>
              <p>{t("intro.creditDescription")}</p>
              <h3 className="font-bold">{t("intro.noCreditTitle")}</h3>
              <p>{t("intro.noCreditDescription")}</p>
            </div>
          ) : null}
          {selected.assessmentScopeId ? (
            includedCredit.isPending ||
            (includedCredit.isError && includedCredit.isFetching) ? (
              <QueryState kind="loading" title={t("credit.checking")} />
            ) : includedCredit.isError ? (
              <QueryState
                kind="error"
                title={t("credit.error")}
                action={
                  <Action
                    variant="secondary"
                    onClick={() => void includedCredit.refetch()}
                  >
                    {t("credit.retry")}
                  </Action>
                }
              />
            ) : hasIncludedCredit ? (
              <div className={wizardStyles.credit} role="status">
                <h2>{t("credit.available")}</h2>
                <p>{t("credit.availableDescription")}</p>
              </div>
            ) : (
              <p className={wizardStyles.notice} role="status">
                {t("credit.unavailable")}
              </p>
            )
          ) : null}
          {evaluationId &&
          !includedCredit.isPending &&
          !includedCredit.isError &&
          !hasIncludedCredit ? (
            <section className={wizardStyles.payment}>
              <div>
                <h2 className="font-black">{t("payment.title")}</h2>
                <p className="mt-1 text-sm text-muted">
                  {evaluationPrice
                    ? t("payment.priceKnown", {
                        price: formatLocalizedCurrency(
                          evaluationPrice.price,
                          evaluationPrice.currency,
                          locale,
                        ),
                      })
                    : t("payment.pricePending")}
                </p>
              </div>
              <label className="grid gap-1 text-sm font-semibold">
                {t("payment.method")}
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  className="rounded-lg border bg-transparent p-3"
                >
                  <option value="Card">{t("payment.card")}</option>
                  <option value="BankTransfer">
                    {t("payment.bankTransfer")}
                  </option>
                  <option value="EWallet">{t("payment.eWallet")}</option>
                </select>
              </label>
            </section>
          ) : null}

          <p className={wizardStyles.disclaimer}>{t("scope.disclaimer")}</p>
          {!evaluationId ? (
            <Action
              type="submit"
              pending={create.isPending}
              pendingLabel={loadingLabel}
              disabled={
                resumeRequested ||
                create.isPending ||
                !selected.assessmentScopeId ||
                scopes.length === 0
              }
              className={wizardStyles.primary}
            >
              {t("actions.save")}
            </Action>
          ) : !paymentSession ? (
            <Action
              type="button"
              onClick={() => checkout.mutate()}
              pending={create.isPending || checkout.isPending}
              pendingLabel={loadingLabel}
              disabled={
                checkout.isPending ||
                Boolean(paymentSession) ||
                !authenticityConfirmed ||
                includedCredit.isPending ||
                includedCredit.isError
              }
              className={wizardStyles.primary}
            >
              {checkout.isPending
                ? "…"
                : hasIncludedCredit
                  ? t("actions.included")
                  : t("actions.payment")}
            </Action>
          ) : null}

          {paymentSession ? (
            <section className={wizardStyles.payment} aria-live="polite">
              {paymentSession.provider?.startsWith("Fake") ? (
                <>
                  <p className="font-black text-primary">
                    {t("developmentPayment.title")}
                  </p>
                  <p className="mt-1 leading-6 text-muted">
                    {t("developmentPayment.description")}
                  </p>
                  {typeof paymentSession.total === "number" &&
                  paymentSession.currency ? (
                    <p className="mt-2 font-black">
                      {t("developmentPayment.total")}{" "}
                      {formatLocalizedCurrency(
                        paymentSession.total,
                        paymentSession.currency,
                        locale,
                      )}
                    </p>
                  ) : null}
                  <Action
                    type="button"
                    pending={confirmDevelopmentPayment.isPending}
                    pendingLabel={loadingLabel}
                    disabled={confirmDevelopmentPayment.isPending}
                    onClick={() => confirmDevelopmentPayment.mutate()}
                    className={wizardStyles.primary}
                  >
                    {confirmDevelopmentPayment.isPending
                      ? "…"
                      : t("developmentPayment.confirm")}
                  </Action>
                </>
              ) : (
                <>
                  <p className="font-black">
                    {t("developmentPayment.sessionTitle")}
                  </p>
                  <p className="mt-1 leading-6 text-muted">
                    {t("developmentPayment.sessionDescription")}
                  </p>
                </>
              )}
            </section>
          ) : null}

          {fileUploadFailed ? (
            <p role="alert" className="text-sm text-danger">
              {t("errors.upload")}
            </p>
          ) : null}
          {checkout.isError ? (
            <p role="alert" className="text-sm text-danger">
              {t("errors.checkout")}
            </p>
          ) : null}
          {(create.isError || confirmDevelopmentPayment.isError) && (
            <p role="alert" className="text-sm text-danger">
              {(create.error ?? confirmDevelopmentPayment.error) instanceof
              Error
                ? (create.error ?? confirmDevelopmentPayment.error)?.message
                : t("errors.request")}
            </p>
          )}
        </div>
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
  kind,
}: {
  locale: string;
  kind: "incomplete" | "invalid";
}) {
  const t = useTranslations("studentWorkspace.evaluationResume");
  return (
    <section className="shell py-10">
      <div className="card grid justify-items-start gap-3 p-6">
        <p role="alert">{t(kind)}</p>
        <Link
          className="focus-ring font-bold text-primary underline"
          href={`/${locale}/student/evaluations`}
        >
          {t("back")}
        </Link>
      </div>
    </section>
  );
}

function MyEvaluations() {
  const t = useTranslations("studentWorkspace.myEvaluations");
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
      <h1 className="text-3xl font-black">{t("title")}</h1>
      <StudentResitOpportunities />
      {result.isPending ? (
        <div className="card mt-6 p-5" aria-busy>
          …
        </div>
      ) : null}
      {result.isError && !result.data ? (
        <p role="alert" className="card mt-6 p-5">
          {t("errors.load")}
        </p>
      ) : null}
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <article key={item.id} className="card grid gap-4 p-4">
            {item.isResit ? (
              <div className="grid gap-1 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
                <strong className="text-primary">{t("resit.title")}</strong>
                {item.resitOfEvaluationRequestId ? (
                  <span className="text-xs text-muted">
                    {t("resit.originalRequest")}:{" "}
                    {item.resitOfEvaluationRequestId.slice(0, 8)}
                  </span>
                ) : null}
              </div>
            ) : null}
            {item.isRetake && !item.isResit ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
                <strong className="text-primary">{t("retake.title")}</strong>
                <span className="text-xs text-muted">
                  {t("retake.outcome")}
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
                <h2 className="font-bold">{t("results.title")}</h2>
                <div className="mt-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-primary">
                    {item.status === "NeedsRevision"
                      ? t("results.current")
                      : item.isResit
                        ? t("resit.result")
                        : t("results.final")}
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
                          {t("results.section", { section: section.section })}
                          :{" "}
                        </strong>
                        {section.grade}
                      </p>
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted">
                  {t("results.guidance")}
                </p>
                <ul
                  className="mt-3 grid gap-2"
                  aria-label={t("criteria.title")}
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
                          ? t("criteria.achieved")
                          : t("criteria.notAchieved")}
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
              <p className="text-sm text-muted">{t("results.pending")}</p>
            ) : null}
            {item.evidence.length ? (
              <div className="rounded-xl border border-border/70 bg-page/40 p-4">
                <h2 className="font-bold">{t("evidence.title")}</h2>
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
                <h2 className="font-bold">{t("feedback.title")}</h2>
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
                    {t("revision.deadline")}{" "}
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
                {t("resit.continue")}
              </Link>
            ) : null}
            {item.status === "Draft" && !item.isRetake && !item.isResit ? (
              <Link
                className="focus-ring w-fit font-bold text-primary underline"
                href={`/${locale}/student/evaluations/new?resume=${encodeURIComponent(item.id)}`}
              >
                {t("actions.continueStandard")}
              </Link>
            ) : null}
          </article>
        ))}
      </div>
      {result.isFetchNextPageError ? (
        <p role="alert" className="mt-4 text-sm text-red-500">
          {t("errors.loadMore")}
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
            ? t("pagination.loading")
            : t("pagination.loadMore")}
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
  const t = useTranslations("studentWorkspace.retakePayment");
  const client = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("Card");
  const [authenticityConfirmed, setAuthenticityConfirmed] = useState(false);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const checkout = useMutation({
    mutationFn: async () => {
      if (!files.length) throw new Error(t("errors.fileRequired"));
      if (!authenticityConfirmed)
        throw new Error(t("errors.authenticityRequired"));
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
        <h2 className="font-black">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("description")}</p>
      </div>
      <FilePicker
        label={t("files.label")}
        files={files}
        onFilesChange={setFiles}
        locale={locale}
        accept=".pdf,.docx,.xlsx,.txt,.jpg,.jpeg,.png,.webp"
        multiple
        maxFileBytes={100 * 1024 * 1024}
        chooseLabel={t("files.choose")}
      />
      {criteria.map((criterion) => (
        <label
          key={criterion}
          className="grid min-w-0 gap-1 text-sm font-semibold"
        >
          {t("evidence.label", { criterion })}
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
        {t("payment.method")}
        <select
          className="min-w-0 rounded-xl border border-border bg-transparent p-3"
          value={paymentMethod}
          onChange={(event) => setPaymentMethod(event.target.value)}
        >
          <option value="Card">{t("payment.card")}</option>
          <option value="BankTransfer">{t("payment.bankTransfer")}</option>
          <option value="EWallet">{t("payment.eWallet")}</option>
        </select>
      </label>
      <label className="flex items-start gap-3 text-sm leading-6">
        <input
          type="checkbox"
          className="focus-ring mt-1 size-4 accent-primary"
          checked={authenticityConfirmed}
          onChange={(event) => setAuthenticityConfirmed(event.target.checked)}
        />
        <span>{t("authenticity.description")}</span>
      </label>
      <button
        type="button"
        className="focus-ring rounded-xl bg-primary px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={checkout.isPending || !files.length || !authenticityConfirmed}
        onClick={() => checkout.mutate()}
      >
        {checkout.isPending ? "…" : t("actions.submit")}
      </button>
      {checkout.isError ? (
        <p className="text-sm text-red-500" role="alert">
          {checkout.error instanceof Error
            ? checkout.error.message
            : t("errors.requestFailed")}
        </p>
      ) : null}
    </section>
  );
}

function EvaluationRevisionSubmission({ requestId }: { requestId: string }) {
  const t = useTranslations("studentWorkspace.evaluationRevision");
  const locale = useLocale();
  const client = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [authenticityConfirmed, setAuthenticityConfirmed] = useState(false);
  const resubmit = useMutation({
    mutationFn: async () => {
      if (!files.length) throw new Error(t("errors.fileRequired"));
      if (!authenticityConfirmed)
        throw new Error(t("errors.authenticityRequired"));
      for (const file of files) {
        if (file.size > 100 * 1024 * 1024)
          throw new Error(t("errors.fileSize"));
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
      <h2 className="font-black">{t("title")}</h2>
      <p className="mt-2 text-sm text-muted">{t("description")}</p>
      <div className="mt-3">
        <FilePicker
          label={t("files.label")}
          files={files}
          onFilesChange={setFiles}
          locale={locale}
          accept=".pdf,.docx,.xlsx,.txt,.jpg,.jpeg,.png,.webp"
          multiple
          maxFileBytes={100 * 1024 * 1024}
          chooseLabel={t("files.choose")}
          helpText={t("files.help")}
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
          <strong>{t("authenticity.title")}</strong>
          <span className="mt-1 block text-muted">
            {t("authenticity.description")}
          </span>
        </span>
      </label>
      <button
        type="button"
        onClick={() => resubmit.mutate()}
        disabled={resubmit.isPending || !files.length || !authenticityConfirmed}
        className="focus-ring mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60"
      >
        {t("actions.submit")}
      </button>
      {resubmit.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {resubmit.error instanceof Error
            ? resubmit.error.message
            : t("errors.requestFailed")}
        </p>
      ) : null}
    </section>
  );
}
