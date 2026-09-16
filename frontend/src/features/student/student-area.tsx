"use client";

/* Private quiz images are delivered by an authenticated API endpoint. */
/* eslint-disable @next/next/no-img-element */

import { api } from "@/lib/api";
import { MotivationCard } from "@/components/motivation-card";
import { FilePicker } from "@/components/forms/file-picker";
import { AccountSecurity } from "@/features/auth/account-security";
import { SupportCenter } from "@/features/support/support-center";
import { EvaluationAppeals } from "@/features/student/evaluation-appeals";
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
  ShieldCheck,
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
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";

type EvaluationOptions = {
  grades: { id: string; arabicName: string; englishName: string }[];
  specializations: { id: string; arabicName: string; englishName: string }[];
  taskTypes: { id: string; arabicName: string; englishName: string }[];
  rubrics: {
    id: string;
    gradeId: string;
    specializationId: string;
    taskTypeId: string;
    arabicTitle: string;
    englishTitle: string;
    criteria: {
      code: string;
      arabicDescription: string;
      englishDescription: string;
    }[];
  }[];
};

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
  if (current.startsWith("learn/") && segment[1])
    content = (
      <CoursePlayer
        courseId={segment[1]}
        requestedLessonId={requestedLessonId}
      />
    );
  if (current === "evaluations/new") content = <EvaluationWizard />;
  if (current === "evaluations") content = <MyEvaluations />;
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
  if (current === "security") content = <AccountSecurity />;
  return (
    <>
      <StudentWorkspaceNav current={current} />
      {content}
    </>
  );
}

function StudentWorkspaceNav({ current }: { current: string }) {
  const locale = useLocale();
  const links = [
    ["", locale === "ar" ? "الملخص" : "Overview"],
    ["courses", locale === "ar" ? "دوراتي" : "My courses"],
    ["evaluations", locale === "ar" ? "تقييماتي" : "My evaluations"],
    ["appeals", locale === "ar" ? "استئنافاتي" : "My appeals"],
    ["planner", locale === "ar" ? "المخطط" : "Planner"],
    ["notes", locale === "ar" ? "ملاحظاتي" : "Notes"],
    ["bookmarks", locale === "ar" ? "إشاراتي" : "Bookmarks"],
    ["certificates", locale === "ar" ? "شهاداتي" : "Certificates"],
    ["purchases", locale === "ar" ? "دفعاتي" : "Payments"],
    ["account", locale === "ar" ? "حسابي" : "My account"],
    ["security", locale === "ar" ? "أمان الحساب" : "Account security"],
    ["support", locale === "ar" ? "الدعم" : "Support"],
  ] as const;
  const isCurrent = (href: string) =>
    href === ""
      ? current === "dashboard"
      : current === href || current.startsWith(`${href}/`);
  return (
    <nav
      aria-label={
        locale === "ar" ? "تنقل مساحة الطالب" : "Student workspace navigation"
      }
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
  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow="BETCCO Student"
        title={locale === "ar" ? "لوحة الطالب" : "Student dashboard"}
        description={
          locale === "ar"
            ? "تابع تعلّمك، وارجع إلى آخر دورة، وأرسل مهامك للتقييم من مكان واحد."
            : "Continue learning, return to your course, and submit work for evaluation from one focused space."
        }
        actions={
          <Link
            href={`/${locale}/student/courses`}
            className="focus-ring inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-slate-950"
          >
            <PlayCircle size={18} aria-hidden="true" />
            {locale === "ar" ? "متابعة التعلّم" : "Continue learning"}
          </Link>
        }
      />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label={locale === "ar" ? "الدورات المسجل بها" : "Enrolled courses"}
          value={courses.isPending ? "—" : (courseSummary?.totalCourses ?? 0)}
          detail={
            locale === "ar"
              ? "من سجلات التسجيل الفعلية"
              : "From your actual enrollments"
          }
          icon={BookOpenCheck}
        />
        <MetricCard
          label={locale === "ar" ? "الدروس المكتملة" : "Lessons completed"}
          value={courses.isPending ? "—" : `${completedLessons}/${allLessons}`}
          detail={
            locale === "ar"
              ? "حسب تقدمك المحفوظ"
              : "Based on saved learning progress"
          }
          icon={CircleCheckBig}
          tone="secondary"
        />
        <MetricCard
          label={locale === "ar" ? "التقدم الكلي" : "Overall progress"}
          value={courses.isPending ? "—" : `${Math.round(progress)}%`}
          detail={
            locale === "ar"
              ? "عبر الدورات المسجل بها"
              : "Across enrolled courses"
          }
          icon={Timer}
          tone="accent"
        />
        <MetricCard
          label={locale === "ar" ? "واجبات قريبة" : "Upcoming coursework"}
          value={overview.isPending ? "—" : upcomingAssignments.length}
          detail={
            locale === "ar"
              ? "مواعيد تسليم من دوراتك"
              : "Deadlines from your enrolled courses"
          }
          icon={ClipboardCheck}
          tone="warm"
        />
        <MetricCard
          label={locale === "ar" ? "إشعارات جديدة" : "Unread notifications"}
          value={
            overview.isPending ? "—" : (overview.data?.unreadNotifications ?? 0)
          }
          detail={
            locale === "ar"
              ? "تابع التحديثات المهمة"
              : "Keep up with important updates"
          }
          icon={MessageSquareText}
        />
        <MetricCard
          label={locale === "ar" ? "شهادات الإكمال" : "Completion certificates"}
          value={
            overview.isPending ? "—" : (overview.data?.certificates.length ?? 0)
          }
          detail={
            locale === "ar"
              ? "صادرة من دورات مكتملة"
              : "Issued for completed courses"
          }
          icon={FileBadge}
          tone="secondary"
        />
      </div>
      <MotivationCard variant="dashboard" className="mt-5" />
      <section className="card mt-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
              {locale === "ar" ? "إنجازات التعلّم" : "Learning milestones"}
            </p>
            <h2 className="mt-1 text-xl font-black">
              {locale === "ar"
                ? "تُحتسب من نشاطك الفعلي"
                : "Earned from real learning activity"}
            </h2>
          </div>
          <Trophy className="text-primary" aria-hidden="true" />
        </div>
        {overview.isPending ? (
          <p className="mt-4 text-sm text-muted" aria-busy>
            {locale === "ar" ? "جارٍ تحميل إنجازاتك…" : "Loading milestones…"}
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
                        ? locale === "ar"
                          ? "مكتمل"
                          : "Completed"
                        : locale === "ar"
                          ? "غير مكتمل بعد"
                          : "Not completed yet"
                    }
                  />
                </div>
                <p className="mt-2 text-sm text-muted">
                  {achievement.description}
                </p>
                <p className="mt-3 text-xs font-bold text-foreground">
                  {achievement.currentValue}/{achievement.targetValue}{" "}
                  {locale === "ar" ? "مكتمل" : "complete"}
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
              {locale === "ar" ? "المتابعة" : "Stay on track"}
            </p>
            <h2 className="mt-1 text-xl font-black">
              {locale === "ar"
                ? "مواعيد التسليم القادمة"
                : "Upcoming deadlines"}
            </h2>
          </div>
          <CalendarDays className="text-primary" aria-hidden="true" />
        </div>
        {overview.isPending ? (
          <p className="mt-4 text-sm text-muted" aria-busy>
            …
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
                  {locale === "ar" ? "التسليم:" : "Due:"}{" "}
                  {new Date(assignment.dueAtUtc).toLocaleString(
                    locale === "ar" ? "ar-JO" : "en-US",
                  )}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            {locale === "ar"
              ? "لا توجد مواعيد تسليم قريبة في دوراتك حاليًا."
              : "There are no upcoming coursework deadlines in your courses."}
          </p>
        )}
      </section>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <DashboardLink
          href="courses"
          title={locale === "ar" ? "دوراتي" : "My courses"}
          text={
            locale === "ar"
              ? "أكمل التعلم وتابع التقدم."
              : "Continue learning and track progress."
          }
          icon={BookOpenCheck}
        />
        <DashboardLink
          href="evaluations/new"
          title={locale === "ar" ? "طلب تقييم" : "Request evaluation"}
          text={
            locale === "ar"
              ? "ارفع المهمة واحصل على نتيجة واضحة."
              : "Submit work and receive a clear result."
          }
          icon={ClipboardCheck}
        />
        <DashboardLink
          href="support"
          title={locale === "ar" ? "الدعم" : "Support"}
          text={
            locale === "ar"
              ? "افتح تذكرة وتابع الرد."
              : "Open a ticket and follow the reply."
          }
          icon={Headphones}
        />
        <DashboardLink
          href="planner"
          title={locale === "ar" ? "مخطط التعلّم" : "Learning planner"}
          text={
            locale === "ar"
              ? "نظّم موعدك وشاهد الجلسات المباشرة."
              : "Plan your work and see live sessions."
          }
          icon={CalendarDays}
        />
        <DashboardLink
          href="notes"
          title={locale === "ar" ? "ملاحظاتي" : "My notes"}
          text={
            locale === "ar"
              ? "عد إلى ما كتبته داخل الدروس."
              : "Return to notes made inside lessons."
          }
          icon={StickyNote}
        />
        <DashboardLink
          href="certificates"
          title={locale === "ar" ? "شهاداتي" : "My certificates"}
          text={
            locale === "ar"
              ? "اطبع شهادة الإكمال بعد إنهاء الدورة."
              : "Print completion certificates after finishing a course."
          }
          icon={FileBadge}
        />
        <DashboardLink
          href="account"
          title={locale === "ar" ? "حسابي" : "My account"}
          text={
            locale === "ar"
              ? "راجع بياناتك وعضوياتك ودفعاتك بأمان."
              : "Review your profile, memberships, and payments securely."
          }
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
  return (
    <Link
      href={`/${locale}/student/${href}`}
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

function StudentAccount() {
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
      setNotice(
        locale === "ar"
          ? "تم حفظ إعدادات الحساب."
          : "Account settings were saved.",
      );
      void client.invalidateQueries({ queryKey: ["student-profile"] });
      void client.invalidateQueries({ queryKey: ["current-user"] });
    },
  });
  const entries = [
    ...(memberships.data?.memberships ?? []).map((item) => ({
      ...item,
      kind: locale === "ar" ? "عضوية" : "Membership",
    })),
    ...(memberships.data?.subscriptions ?? []).map((item) => ({
      ...item,
      kind: locale === "ar" ? "اشتراك دورة" : "Course subscription",
    })),
  ].sort(
    (first, second) =>
      new Date(second.endsAtUtc).getTime() -
      new Date(first.endsAtUtc).getTime(),
  );
  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow="BETCCO ACCOUNT"
        title={locale === "ar" ? "حسابي" : "My account"}
        description={
          locale === "ar"
            ? "حدّث بياناتك الأساسية، وراجع عضوياتك ودفعاتك من مكان واحد. لا يتم تغيير البريد الإلكتروني من هذه الصفحة حفاظًا على التحقق والأمان."
            : "Update your basic details and review memberships and payments in one place. Email changes stay outside this page to preserve verification and account security."
        }
        actions={
          <Link
            href={`/${locale}/student/security`}
            className="focus-ring inline-flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-black text-foreground"
          >
            <ShieldCheck size={18} aria-hidden="true" />
            {locale === "ar" ? "أمان الحساب" : "Account security"}
          </Link>
        }
      />
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <form
          className="card p-5 sm:p-6"
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
              <h2 className="text-xl font-black">
                {locale === "ar" ? "البيانات الأساسية" : "Basic details"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {locale === "ar"
                  ? "نطلب الحد الأدنى اللازم لتشغيل حسابك التعليمي فقط."
                  : "We request only the minimum information needed to operate your learning account."}
              </p>
            </div>
          </div>
          {profile.isPending ? (
            <p className="mt-6 text-sm text-muted" aria-busy>
              …
            </p>
          ) : profile.isError || !profile.data ? (
            <p role="alert" className="mt-6 text-sm text-red-600">
              {locale === "ar"
                ? "تعذر تحميل بيانات الحساب."
                : "Your account details could not be loaded."}
            </p>
          ) : (
            <div className="mt-6 grid gap-4">
              <label className="grid gap-1 text-sm font-bold">
                <span>{locale === "ar" ? "الاسم" : "Name"}</span>
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
                <span>{locale === "ar" ? "البريد الإلكتروني" : "Email"}</span>
                <input
                  readOnly
                  value={profile.data.email ?? ""}
                  className="rounded-xl border border-border bg-muted/35 px-3 py-2.5 text-muted"
                />
              </label>
              <label className="grid gap-1 text-sm font-bold">
                <span>
                  {locale === "ar"
                    ? "رقم الهاتف (اختياري)"
                    : "Phone (optional)"}
                </span>
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
                <span>
                  {locale === "ar"
                    ? "أوافق اختياريًا على تلقي العروض والرسائل التسويقية. يمكنني سحب الموافقة في أي وقت."
                    : "I optionally agree to receive offers and marketing messages. I can withdraw consent at any time."}
                </span>
              </label>
              <button
                type="submit"
                disabled={save.isPending}
                className="focus-ring rounded-xl bg-primary px-4 py-3 text-sm font-black text-slate-950 disabled:cursor-wait disabled:opacity-60"
              >
                {save.isPending
                  ? locale === "ar"
                    ? "جارٍ الحفظ…"
                    : "Saving…"
                  : locale === "ar"
                    ? "حفظ البيانات"
                    : "Save details"}
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
                    : locale === "ar"
                      ? "تعذر حفظ البيانات."
                      : "Your details could not be saved."}
                </p>
              ) : null}
            </div>
          )}
        </form>
        <section className="card p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
              <CreditCard size={22} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-black">
                {locale === "ar"
                  ? "العضويات والاشتراكات"
                  : "Memberships and subscriptions"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {locale === "ar"
                  ? "تظهر هنا الحالات الفعلية المسجلة في الحساب."
                  : "Only the actual statuses recorded for this account appear here."}
              </p>
            </div>
          </div>
          {memberships.isPending ? (
            <p className="mt-6 text-sm text-muted" aria-busy>
              …
            </p>
          ) : memberships.isError ? (
            <p role="alert" className="mt-6 text-sm text-red-600">
              {locale === "ar"
                ? "تعذر تحميل العضويات."
                : "Memberships could not be loaded."}
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
                        ? locale === "ar"
                          ? "نشط"
                          : "Active"
                        : locale === "ar"
                          ? "منتهٍ"
                          : "Expired"}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    {locale === "ar" ? "ينتهي:" : "Ends:"}{" "}
                    {new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en", {
                      dateStyle: "medium",
                    }).format(new Date(entry.endsAtUtc))}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-border p-4 text-sm leading-6 text-muted">
              <p>
                {locale === "ar"
                  ? "لا توجد عضوية أو اشتراك نشط أو سابق في هذا الحساب."
                  : "There is no active or previous membership or subscription for this account."}
              </p>
              <Link
                href={`/${locale}/memberships`}
                className="focus-ring mt-3 inline-flex font-black text-primary"
              >
                {locale === "ar" ? "استكشف العضويات" : "Explore memberships"}
              </Link>
            </div>
          )}
          <Link
            href={`/${locale}/student/purchases`}
            className="focus-ring mt-6 inline-flex items-center gap-2 text-sm font-black text-primary"
          >
            <CreditCard size={16} aria-hidden="true" />
            {locale === "ar" ? "عرض سجل الدفعات" : "View payment history"}
          </Link>
        </section>
      </div>
    </section>
  );
}

function StudentPurchases() {
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const purchases = useQuery({
    queryKey: ["student-purchases", page],
    queryFn: () =>
      api<StudentPurchaseHistory>(
        `/student-tools/purchases?page=${page}&pageSize=12`,
      ),
  });
  const labelForPurpose = (purpose: string) => {
    const labels: Record<string, [string, string]> = {
      CoursePurchase: ["شراء دورة", "Course purchase"],
      CoursePackage: ["شراء باقة", "Package purchase"],
      Evaluation: ["طلب تقييم", "Evaluation request"],
      Membership: ["عضوية", "Membership"],
      CourseSubscription: ["اشتراك دورة", "Course subscription"],
    };
    return labels[purpose]?.[locale === "ar" ? 0 : 1] ?? purpose;
  };
  const labelForStatus = (status: string) => {
    const labels: Record<string, [string, string]> = {
      Pending: ["بانتظار الدفع", "Pending payment"],
      Processing: ["قيد المعالجة", "Processing"],
      Paid: ["مدفوع", "Paid"],
      Failed: ["فشل", "Failed"],
      Cancelled: ["ملغى", "Cancelled"],
      Refunded: ["مسترد", "Refunded"],
      PartiallyRefunded: ["مسترد جزئيًا", "Partially refunded"],
      Chargeback: ["اعتراض بنكي", "Chargeback"],
    };
    return labels[status]?.[locale === "ar" ? 0 : 1] ?? status;
  };
  const formatAmount = (amount: number, currency: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-JO" : "en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow="BETCCO PAYMENTS"
        title={locale === "ar" ? "سجل الدفعات" : "Payment history"}
        description={
          locale === "ar"
            ? "هذه المعاملات تخص حسابك فقط. حالة الدفع تأتي من الخادم بعد التحقق، وليست من رابط نجاح الواجهة."
            : "These transactions belong only to your account. Payment status comes from server-side verification, never from a client success URL."
        }
        actions={
          <Link
            href={`/${locale}/student/account`}
            className="focus-ring inline-flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-black text-foreground"
          >
            <UserRound size={18} aria-hidden="true" />
            {locale === "ar" ? "حسابي" : "My account"}
          </Link>
        }
      />
      {purchases.isPending ? (
        <div className="card mt-6 p-6" aria-busy>
          …
        </div>
      ) : purchases.isError || !purchases.data ? (
        <p role="alert" className="card mt-6 p-6 text-red-600">
          {locale === "ar"
            ? "تعذر تحميل سجل الدفعات."
            : "Payment history could not be loaded."}
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
                      {new Intl.DateTimeFormat(
                        locale === "ar" ? "ar-JO" : "en",
                        {
                          dateStyle: "medium",
                          timeStyle: "short",
                        },
                      ).format(
                        new Date(payment.paidAtUtc ?? payment.createdAtUtc),
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
                      {locale === "ar" ? "طريقة الدفع" : "Payment method"}
                    </span>
                    <p className="mt-1 font-bold">{payment.method}</p>
                  </div>
                  <div>
                    <span className="text-muted">
                      {locale === "ar" ? "الخصم" : "Discount"}
                    </span>
                    <p className="mt-1 font-bold">
                      {formatAmount(payment.discount, payment.currency)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted">
                      {locale === "ar" ? "المرجع" : "Reference"}
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
              aria-label={locale === "ar" ? "صفحات الدفعات" : "Payment pages"}
            >
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="focus-ring rounded-xl border border-border px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                {locale === "ar" ? "السابق" : "Previous"}
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
                {locale === "ar" ? "التالي" : "Next"}
              </button>
            </nav>
          ) : null}
        </>
      ) : (
        <div className="card mt-6 p-6 text-center">
          <CreditCard className="mx-auto text-primary" aria-hidden="true" />
          <h2 className="mt-3 text-xl font-black">
            {locale === "ar" ? "لا توجد دفعات بعد" : "No payments yet"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {locale === "ar"
              ? "عند إتمام عملية شراء موثقة ستظهر تفاصيلها هنا."
              : "Verified purchases will appear here once you complete them."}
          </p>
          <Link
            href={`/${locale}/courses`}
            className="focus-ring mt-4 inline-flex font-black text-primary"
          >
            {locale === "ar" ? "استكشف الدورات" : "Explore courses"}
          </Link>
        </div>
      )}
    </section>
  );
}

type LearningOverview = {
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
    eventType: "Personal" | "LiveSession" | "Assignment" | "Quiz";
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

function LearningOrganizer({
  initialTab,
}: {
  initialTab: "planner" | "notes" | "bookmarks" | "certificates";
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [calendarView, setCalendarView] = useState<"month" | "week" | "day">(
    "month",
  );
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
      ? locale === "ar"
        ? "مخطط التعلّم"
        : "Learning planner"
      : initialTab === "notes"
        ? locale === "ar"
          ? "ملاحظاتي"
          : "My notes"
        : initialTab === "bookmarks"
          ? locale === "ar"
            ? "إشاراتي المرجعية"
            : "My bookmarks"
          : locale === "ar"
            ? "شهاداتي"
            : "My certificates";
  if (overview.isPending)
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          …
        </div>
      </section>
    );
  if (overview.isError || !overview.data)
    return (
      <section className="shell py-10">
        <p className="card p-6">
          {locale === "ar"
            ? "تعذر تحميل أدوات التعلّم."
            : "Learning tools could not be loaded."}
        </p>
      </section>
    );
  const data = overview.data;
  const displayedCalendar = calendarEntriesForView(data.calendar, calendarView);
  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow="BETCCO Learning Space"
        title={heading}
        description={
          locale === "ar"
            ? "مساحتك الخاصة منظمة من بياناتك الفعلية داخل المنصة."
            : "Your private workspace, built from your real learning activity."
        }
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
              placeholder={
                locale === "ar"
                  ? "مثال: مراجعة الوحدة الأولى"
                  : "Example: revise module one"
              }
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
              {locale === "ar" ? "إضافة" : "Add"}
            </button>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={1000}
              className="min-h-20 rounded-xl border border-border bg-surface-solid px-3 py-2 md:col-span-3"
              placeholder={
                locale === "ar" ? "تفاصيل اختيارية" : "Optional details"
              }
            />
          </form>
          <div
            className="mt-5 flex flex-wrap gap-2"
            role="group"
            aria-label={locale === "ar" ? "عرض التقويم" : "Calendar view"}
          >
            {(["month", "week", "day"] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setCalendarView(view)}
                aria-pressed={calendarView === view}
                className={`focus-ring rounded-lg border px-3 py-2 text-sm font-bold ${calendarView === view ? "border-primary bg-primary text-slate-950" : "border-border text-muted"}`}
              >
                {calendarViewLabel(view, locale)}
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
                      {new Intl.DateTimeFormat(
                        locale === "ar" ? "ar-JO" : "en",
                        { dateStyle: "medium", timeStyle: "short" },
                      ).format(new Date(entry.startsAtUtc))}
                    </p>
                  </div>
                  {entry.eventType === "LiveSession" ? (
                    <Link
                      href={`/${locale}/live`}
                      className="focus-ring rounded-lg border border-border px-3 py-2 text-sm font-bold text-primary"
                    >
                      {locale === "ar" ? "فتح الجلسة" : "Open session"}
                    </Link>
                  ) : entry.personalEntryId ? (
                    <button
                      type="button"
                      onClick={() =>
                        removeCalendar.mutate(entry.personalEntryId!)
                      }
                      className="focus-ring rounded-lg border border-red-500/40 px-3 py-2 text-sm font-bold text-red-400"
                    >
                      {locale === "ar" ? "حذف" : "Delete"}
                    </button>
                  ) : (
                    <Link
                      href={`/${locale}/student/courses`}
                      className="focus-ring rounded-lg border border-border px-3 py-2 text-sm font-bold text-primary"
                    >
                      {entry.eventType === "Assignment"
                        ? locale === "ar"
                          ? "فتح الواجب"
                          : "Open assignment"
                        : locale === "ar"
                          ? "فتح الاختبار"
                          : "Open quiz"}
                    </Link>
                  )}
                </article>
              ))
            ) : (
              <p className="card p-5 text-muted">
                {locale === "ar" ? "لا توجد مواعيد بعد." : "No dates yet."}
              </p>
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
            <p className="card p-5 text-muted">
              {locale === "ar"
                ? "أضف ملاحظة من داخل أي درس لتظهر هنا."
                : "Add a note inside a lesson and it will appear here."}
            </p>
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
              {locale === "ar"
                ? "احفظ أي درس من مشغّل الدورة للرجوع إليه لاحقًا."
                : "Save a lesson in the course player to revisit it later."}
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
                  {locale === "ar" ? "رمز التحقق:" : "Verification code:"}{" "}
                  {certificate.verificationCode}
                </p>
                <Link
                  href={`/${locale}/student/certificates/${certificate.verificationCode}`}
                  className="focus-ring mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950"
                >
                  {locale === "ar"
                    ? "عرض وطباعة الشهادة"
                    : "View and print certificate"}
                </Link>
              </article>
            ))
          ) : (
            <p className="card p-5 text-muted">
              {locale === "ar"
                ? "أكمل جميع دروس الدورة ثم اطلب شهادتها من المشغّل."
                : "Complete every course lesson, then issue its certificate in the player."}
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

function calendarViewLabel(view: "month" | "week" | "day", locale: string) {
  const labels = {
    month: ["الشهر", "Month"],
    week: ["الأسبوع", "Week"],
    day: ["اليوم", "Day"],
  } as const;
  return labels[view][locale === "ar" ? 0 : 1];
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
  const issuedOn = new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en", {
    dateStyle: "long",
  }).format(new Date(certificate.data.issuedAtUtc));
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
            ? "لا تملك صلاحية الوصول إلى محتوى هذه الدورة."
            : "You do not have access to this course."}
        </p>
      </section>
    );
  const allLessons = result.data.modules.flatMap((module) => module.lessons);
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
              BETCCO Player
            </p>
            <h1 className="mt-2 text-3xl font-black">{result.data.title}</h1>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/5 px-3 py-2 text-xs font-bold text-muted">
            <ListVideo size={15} aria-hidden="true" />
            {result.data.modules.length} {locale === "ar" ? "وحدات" : "modules"}
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
              ? locale === "ar"
                ? "إخفاء المحتوى"
                : "Hide content"
              : locale === "ar"
                ? "إظهار المحتوى"
                : "Show content"}
          </button>
        </div>
        {result.data.requestedLessonRejected ? (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200"
          >
            {locale === "ar"
              ? "الدرس المطلوب غير متاح. تمت إعادتك إلى موضع التعلّم المسموح به."
              : "That lesson is unavailable. You were returned to your authorized learning position."}
          </p>
        ) : null}
        {lesson ? (
          <>
            {lesson.video && !lesson.isLocked ? (
              <LessonVideo
                key={`video-${lesson.id}`}
                lesson={lesson}
                locale={locale}
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
                  {lesson.type} · {Math.round(lesson.durationSeconds / 60)} min
                </p>
                <p className="relative mt-8 max-w-md whitespace-pre-wrap text-sm leading-6 text-slate-300">
                  {lesson.isLocked
                    ? lockedContentMessage(
                        locale,
                        lesson.lockReason,
                        lesson.availableAtUtc,
                      )
                    : lesson.body ||
                      (locale === "ar"
                        ? "لم يضف المعلم نصًا لهذا الدرس بعد."
                        : "The teacher has not added lesson text yet.")}
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
                <h2 className="font-black">
                  {locale === "ar" ? "ملفات الدرس" : "Lesson files"}
                </h2>
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
                ? locale === "ar"
                  ? "مكتمل"
                  : "Completed"
                : lesson.type === "Video"
                  ? locale === "ar"
                    ? "يكتمل بعد مشاهدة 80%"
                    : "Completes after 80% watched"
                  : locale === "ar"
                    ? "تمييز كمكتمل"
                    : "Mark complete"}
            </button>
            <button
              type="button"
              onClick={() => certificate.mutate()}
              disabled={certificate.isPending}
              className="focus-ring ms-3 mt-5 inline-flex items-center gap-2 rounded-xl border border-primary/50 px-4 py-3 font-bold text-primary hover:bg-primary/10"
            >
              <FileBadge size={18} aria-hidden="true" />
              {locale === "ar"
                ? "طلب شهادة الإكمال"
                : "Issue completion certificate"}
            </button>
            {certificate.data ? (
              <p role="status" className="mt-3 text-sm text-primary">
                {locale === "ar"
                  ? "تم إصدار الشهادة. رمز التحقق: "
                  : "Certificate issued. Verification code: "}
                {certificate.data.verificationCode}
              </p>
            ) : null}
            {certificate.isError ? (
              <p role="alert" className="mt-3 text-sm text-red-400">
                {certificate.error instanceof Error
                  ? certificate.error.message
                  : locale === "ar"
                    ? "أكمل جميع الدروس أولًا."
                    : "Complete all lessons first."}
              </p>
            ) : null}
            {progress.isSuccess ? (
              <p role="status" className="mt-3 text-sm text-primary">
                {locale === "ar" ? "تم حفظ تقدمك." : "Your progress was saved."}
              </p>
            ) : null}
            {progress.isError ? (
              <p role="alert" className="mt-3 text-sm text-red-400">
                {locale === "ar"
                  ? "تعذر حفظ التقدم. حاول مرة أخرى."
                  : "Progress could not be saved. Try again."}
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
                  {locale === "ar" ? "الدرس السابق" : "Previous lesson"}
                </Link>
              ) : (
                <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-xl border border-border px-3 py-2.5 text-sm font-bold text-muted opacity-40">
                  <ArrowLeft
                    size={16}
                    className="rtl:rotate-180"
                    aria-hidden="true"
                  />
                  {locale === "ar" ? "الدرس السابق" : "Previous lesson"}
                </span>
              )}
              {nextLesson ? (
                <Link
                  href={lessonHref(nextLesson.id)}
                  className="focus-ring inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-black text-slate-950"
                >
                  {locale === "ar" ? "الدرس التالي" : "Next lesson"}
                  <ArrowRight
                    size={16}
                    className="rtl:rotate-180"
                    aria-hidden="true"
                  />
                </Link>
              ) : (
                <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-black text-slate-950 opacity-40">
                  {locale === "ar" ? "الدرس التالي" : "Next lesson"}
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
                  {locale === "ar"
                    ? "طلب تقييم BTEC خارجي منفصل"
                    : "Request a separate external BTEC evaluation"}
                </Link>
              </>
            ) : null}
            <QuizPanel courseId={courseId} lessonId={lesson.id} />
          </>
        ) : (
          <p className="mt-5 text-muted">No published lesson.</p>
        )}
      </div>
      <aside
        id="player-course-content"
        className={`card h-fit p-4 lg:sticky lg:top-24 ${sidebarOpen ? "block" : "hidden"}`}
      >
        <h2 className="flex items-center gap-2 font-black">
          <ListVideo size={18} className="text-primary" aria-hidden="true" />
          {locale === "ar" ? "محتوى الدورة" : "Course content"}
        </h2>
        <div className="mt-3 space-y-4">
          {result.data.modules.map((module) => (
            <div key={module.id}>
              <p className="text-sm font-bold">{module.title}</p>
              <div className="mt-2 grid gap-1">
                {module.lessons.map((item) =>
                  item.isLocked ? (
                    <button
                      key={item.id}
                      type="button"
                      disabled
                      title={lockedContentMessage(
                        locale,
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
                          aria-label={locale === "ar" ? "مكتمل" : "Completed"}
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
  locale,
  savePending,
  onSave,
}: {
  lesson: StudentCoursePlayerLesson;
  locale: string;
  savePending: boolean;
  onSave: (lastPositionSeconds: number, markCompleted: boolean) => void;
}) {
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
        aria-label={
          locale === "ar" ? `فيديو ${lesson.title}` : `${lesson.title} video`
        }
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
        {locale === "ar"
          ? "المتصفح لا يدعم تشغيل الفيديو."
          : "Your browser does not support video playback."}
      </video>
      {playbackState === "loading" ? (
        <p role="status" className="px-4 py-2 text-sm text-slate-300">
          {locale === "ar" ? "جارٍ تحميل الفيديو…" : "Loading video…"}
        </p>
      ) : null}
      {playbackState === "error" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm text-white"
        >
          <span>
            {locale === "ar"
              ? "تعذر تشغيل الفيديو. حاول مجددًا أو تواصل مع الدعم."
              : "Video unavailable. Try again or contact support."}
          </span>
          <button
            type="button"
            className="focus-ring rounded-lg border border-white/40 px-3 py-1.5 font-bold"
            onClick={() => {
              setPlaybackState("loading");
              setRetryCount((count) => count + 1);
            }}
          >
            {locale === "ar" ? "إعادة المحاولة" : "Retry video"}
          </button>
        </div>
      ) : null}
      <div className="border-t border-white/10 bg-[#0b1735] px-4 py-3 text-white">
        <p className="font-black">{lesson.title}</p>
        <p className="mt-1 flex items-center gap-2 text-xs text-slate-300">
          <Timer size={14} aria-hidden="true" />
          {lesson.video?.displayName} ·{" "}
          {Math.round(lesson.durationSeconds / 60)}{" "}
          {locale === "ar" ? "دقيقة" : "min"}
        </p>
      </div>
    </div>
  );
}

function lockedContentMessage(
  locale: string,
  reason?: string,
  availableAtUtc?: string,
) {
  if (reason === "AvailableOnDate" || reason === "AvailableAfterEnrollment") {
    const date = availableAtUtc
      ? new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(availableAtUtc))
      : "";
    return locale === "ar"
      ? `يفتح هذا المحتوى في ${date}.`
      : `This content opens on ${date}.`;
  }
  return locale === "ar"
    ? "أكمل المتطلبات السابقة لفتح هذا المحتوى."
    : "Complete the required previous content to unlock this item.";
}

function CourseAnnouncementsPanel({ courseId }: { courseId: string }) {
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
        {locale === "ar" ? "إعلانات الدورة" : "Course announcements"}
      </h2>
      {announcements.isError ? (
        <p className="mt-2 text-sm text-muted">
          {locale === "ar"
            ? "تعذر تحميل الإعلانات الآن."
            : "Announcements could not be loaded now."}
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
                  {new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(item.publishedAtUtc))}
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
            {locale === "ar" ? "مركز الموارد" : "Resource center"}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {locale === "ar"
              ? "موارد هذه الدورة المتاحة لك حاليًا."
              : "Course resources currently available to you."}
          </p>
        </div>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
          aria-label={locale === "ar" ? "تصفية الموارد" : "Filter resources"}
        >
          {categories.map((item) => (
            <option key={item} value={item}>
              {resourceCategoryLabel(item, locale)}
            </option>
          ))}
        </select>
      </div>
      {resources.isError ? (
        <p className="mt-3 text-sm text-muted">
          {locale === "ar"
            ? "تعذر تحميل الموارد الآن."
            : "Resources could not be loaded now."}
        </p>
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
                {resourceCategoryLabel(resource.category, locale)} ·{" "}
                {resource.lessonTitle}
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function resourceCategoryLabel(category: string, locale: string) {
  const labels: Record<string, [string, string]> = {
    All: ["كل الأنواع", "All types"],
    PDF: ["PDF", "PDF"],
    PowerPoint: ["PowerPoint", "PowerPoint"],
    Word: ["Word", "Word"],
    Excel: ["Excel", "Excel"],
    Code: ["كود", "Code"],
    Video: ["فيديو / صوت", "Video / audio"],
    ZIP: ["ZIP", "ZIP"],
    Link: ["رابط", "Link"],
    Other: ["أخرى", "Other"],
  };
  return labels[category]?.[locale === "ar" ? 0 : 1] ?? category;
}

function LessonWorkspace({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
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
            {locale === "ar" ? "ملاحظة خاصة" : "Private note"}
          </h2>
          <button
            type="button"
            onClick={() => toggleBookmark.mutate()}
            disabled={toggleBookmark.isPending || overview.isPending}
            className="focus-ring rounded-lg border border-border p-2 text-primary"
            aria-label={
              bookmarked
                ? locale === "ar"
                  ? "إزالة الإشارة المرجعية"
                  : "Remove bookmark"
                : locale === "ar"
                  ? "حفظ إشارة مرجعية"
                  : "Save bookmark"
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
          placeholder={
            locale === "ar"
              ? "اكتب ملاحظة لا يراها سواك…"
              : "Write a note only you can see…"
          }
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => saveNote.mutate()}
            disabled={saveNote.isPending || !noteValue.trim()}
            className="focus-ring rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950"
          >
            {locale === "ar" ? "حفظ الملاحظة" : "Save note"}
          </button>
          {currentNote ? (
            <button
              type="button"
              onClick={() => deleteNote.mutate()}
              disabled={deleteNote.isPending}
              className="focus-ring rounded-xl border border-red-500/40 px-4 py-2 text-sm font-black text-red-400"
            >
              {locale === "ar" ? "حذف" : "Delete"}
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
          {locale === "ar" ? "اسأل معلم الدورة" : "Ask the course teacher"}
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
            placeholder={
              locale === "ar"
                ? "اكتب سؤالك المتعلق بهذا الدرس…"
                : "Ask about this lesson…"
            }
          />
          <button
            disabled={ask.isPending}
            className="focus-ring mt-3 rounded-xl border border-secondary/50 px-4 py-2 text-sm font-black text-secondary hover:bg-secondary/10"
          >
            {locale === "ar" ? "إرسال السؤال" : "Send question"}
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
                    {locale === "ar" ? "تمت الإجابة" : "Answered"}
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
  const locale = useLocale();
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
          {locale === "ar" ? "مساعد BETCCO الذكي" : "BETCCO AI Tutor"}
        </h2>
        <span className="text-xs font-bold text-muted">
          {locale === "ar"
            ? "مساند للتعلّم، وليس بديلًا عن عملك"
            : "Learning support, not a substitute for your work"}
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
            ["Explain", locale === "ar" ? "اشرح" : "Explain"],
            ["Practice", locale === "ar" ? "تدرّب" : "Practice"],
            ["Plan", locale === "ar" ? "خطّط" : "Plan"],
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
          placeholder={
            locale === "ar"
              ? "اسأل عن محتوى هذا الدرس أو اطلب خطة تدريب…"
              : "Ask about this lesson or request a practice plan…"
          }
        />
        <button
          disabled={chat.isPending || !message.trim()}
          className="focus-ring w-fit rounded-xl border border-accent/60 px-4 py-2 text-sm font-black text-foreground hover:bg-accent/15 disabled:opacity-50"
        >
          {chat.isPending
            ? "…"
            : locale === "ar"
              ? "اطلب المساعدة"
              : "Ask for help"}
        </button>
      </form>
      {chat.data ? (
        <div className="mt-4 rounded-xl border border-border/70 bg-page/40 p-4">
          <p className="whitespace-pre-line text-sm leading-7">
            {chat.data.text}
          </p>
          {chat.data.citations.length ? (
            <p className="mt-3 text-xs text-muted">
              {locale === "ar" ? "المصادر المستخدمة: " : "Sources used: "}
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
            : locale === "ar"
              ? "المساعد الذكي غير متاح حاليًا."
              : "The AI tutor is unavailable right now."}
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
  quizzesPassed: number;
  quizzesTotal: number;
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
  const locale = useLocale();
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
        <p className="text-sm text-muted">…</p>
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
            BETCCO BTEC
          </p>
          <h2 className="mt-1 text-lg font-black">
            {locale === "ar"
              ? "تقدّمك ودرجتك المتوقعة"
              : "Your progress and predicted grade"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {locale === "ar"
              ? "تُحسب من نتائج المعايير التي قيّمها المعلم على الخادم."
              : "Calculated from teacher-assessed criterion results on the server."}
          </p>
        </div>
        <div className="rounded-xl border border-secondary/35 bg-page/50 px-4 py-3 text-center">
          <p className="text-xs font-bold text-muted">
            {locale === "ar" ? "النتيجة المتوقعة" : "Predicted grade"}
          </p>
          <p className="mt-1 text-xl font-black text-secondary">
            {gradeLabel(summary.predictedGrade, locale)}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <GradeProgressStat
          label={locale === "ar" ? "الدروس" : "Lessons"}
          value={`${data.lessonsCompleted} / ${data.lessonsTotal}`}
          detail={`${data.lessonProgressPercent}%`}
        />
        <GradeProgressStat
          label={locale === "ar" ? "الاختبارات المجتازة" : "Quizzes passed"}
          value={`${data.quizzesPassed} / ${data.quizzesTotal}`}
          detail={locale === "ar" ? "اختبارات" : "quizzes"}
        />
        <GradeProgressStat
          label={locale === "ar" ? "المهام المكتملة" : "Coursework assessed"}
          value={`${data.assignmentsCompleted} / ${data.assignmentsTotal}`}
          detail={locale === "ar" ? "مهام" : "assignments"}
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
            {locale === "ar" ? "مُحقَّق" : "achieved"}: {achieved} / {required}
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
                {unit.lessonsCompleted}/{unit.lessonsTotal} ·{" "}
                {unit.lessonProgressPercent}% ·{" "}
                {gradeLabel(unit.predictedGrade.predictedGrade, locale)}
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
                          {aim.lessonProgressPercent}%
                        </span>
                      </div>
                      <p className="mt-1 text-muted">
                        {aim.lessonsCompleted}/{aim.lessonsTotal} ·{" "}
                        {gradeLabel(aim.predictedGrade.predictedGrade, locale)}
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
            {locale === "ar" ? "حالة معايير BTEC" : "BTEC criterion status"}
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
                    {criterionStatusLabel(criterion.status, locale)}
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

function gradeLabel(grade: string, locale: string) {
  const labels: Record<string, [string, string]> = {
    NotYetAchieved: ["لم يتحقق بعد", "Not achieved yet"],
    Pass: ["نجاح", "Pass"],
    Merit: ["تفوق", "Merit"],
    Distinction: ["امتياز", "Distinction"],
  };
  return labels[grade]?.[locale === "ar" ? 0 : 1] ?? grade;
}

function criterionStatusLabel(status: string, locale: string) {
  const labels: Record<string, [string, string]> = {
    NotStarted: ["لم يبدأ", "Not started"],
    InReview: ["قيد المراجعة", "In review"],
    Achieved: ["مُحقَّق", "Achieved"],
    NotAchieved: ["غير مُحقَّق", "Not achieved"],
    NeedsImprovement: ["يحتاج تحسين", "Needs improvement"],
    ResubmissionRequired: ["إعادة تسليم مطلوبة", "Resubmission required"],
    NotApplicable: ["غير منطبق", "Not applicable"],
  };
  return labels[status]?.[locale === "ar" ? 0 : 1] ?? status;
}

function CourseAssignmentPanel({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
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
          {locale === "ar" ? "مهمة الدورة" : "Coursework"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {locale === "ar"
            ? "ارفع عملك بشكل خاص. لا تظهر النتيجة إلا بعد تدقيق المعلم واحتسابها من المعايير."
            : "Upload your work privately. Results appear only after teacher review and server-side criterion calculation."}
        </p>
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
                {assignment.dueAtUtc ? (
                  <p className="mt-2 text-xs text-muted">
                    {locale === "ar" ? "الموعد النهائي: " : "Due: "}
                    {new Date(assignment.dueAtUtc).toLocaleString(
                      locale === "ar" ? "ar-JO" : "en-US",
                    )}
                  </p>
                ) : null}
                {assignment.availableFromUtc ? (
                  <p className="mt-2 text-xs text-muted">
                    {locale === "ar" ? "تفتح المهمة: " : "Opens: "}
                    {new Date(assignment.availableFromUtc).toLocaleString(
                      locale === "ar" ? "ar-JO" : "en-US",
                    )}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted">
                  {locale === "ar" ? "الملفات: " : "Files: "}
                  {assignment.allowedFileExtensions
                    .join(", ")
                    .toUpperCase()} ·{" "}
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
                <p className="font-bold">
                  {locale === "ar" ? "نتيجة المعايير" : "Criterion result"}
                </p>
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
                      (submission?.status === "NeedsRevision" &&
                        !assignment.allowResubmission)
                    }
                    className="focus-ring rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
                  >
                    {opensInFuture
                      ? locale === "ar"
                        ? "المهمة لم تُفتح بعد"
                        : "This coursework is not open yet"
                      : submission?.status === "NeedsRevision" &&
                          !assignment.allowResubmission
                        ? locale === "ar"
                          ? "إعادة التسليم غير متاحة"
                          : "Resubmission is unavailable"
                        : submission?.status === "NeedsRevision"
                          ? locale === "ar"
                            ? "بدء إعادة التسليم"
                            : "Start resubmission"
                          : submission?.status === "Draft"
                            ? locale === "ar"
                              ? "متابعة المسودة"
                              : "Continue draft"
                            : locale === "ar"
                              ? "بدء التسليم"
                              : "Start submission"}
                  </button>
                ) : (
                  <div className="grid gap-3">
                    <textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      maxLength={4000}
                      placeholder={
                        locale === "ar"
                          ? "ملاحظة اختيارية للمعلم"
                          : "Optional note to your teacher"
                      }
                      className="min-h-20 rounded-xl border border-border bg-transparent p-2.5 text-sm"
                    />
                    <FilePicker
                      label={locale === "ar" ? "ملفات الحل" : "Your work files"}
                      files={files}
                      onFilesChange={setFiles}
                      locale={locale}
                      multiple
                      accept={assignment.allowedFileExtensions.join(",")}
                      maxFileBytes={assignment.maxFileSizeBytes}
                      chooseLabel={
                        locale === "ar"
                          ? "اختيار ملفات الحل"
                          : "Choose work files"
                      }
                      helpText={
                        locale === "ar"
                          ? `يمكن إضافة أكثر من ملف؛ الحد ${Math.round(assignment.maxFileSizeBytes / 1024 / 1024)}MB لكل ملف. تفحص الملفات أمنيًا قبل حفظها.`
                          : `You can add multiple files; the limit is ${Math.round(assignment.maxFileSizeBytes / 1024 / 1024)}MB per file. Files are security-scanned before storage.`
                      }
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => start.mutate(assignment.id)}
                        disabled={start.isPending}
                        className="focus-ring rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-muted disabled:opacity-50"
                      >
                        {locale === "ar" ? "حفظ الملاحظة" : "Save note"}
                      </button>
                      <button
                        type="button"
                        onClick={() => upload.mutate()}
                        disabled={!files.length || upload.isPending}
                        className="focus-ring rounded-xl border border-primary/40 px-4 py-2.5 text-sm font-bold text-primary disabled:opacity-50"
                      >
                        {locale === "ar" ? "رفع الملفات" : "Upload files"}
                      </button>
                      <button
                        type="button"
                        onClick={() => submit.mutate()}
                        disabled={submit.isPending}
                        className="focus-ring rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
                      >
                        {locale === "ar" ? "تسليم للمعلم" : "Submit to teacher"}
                      </button>
                    </div>
                    {upload.isError || submit.isError ? (
                      <p role="alert" className="text-sm text-red-400">
                        {(upload.error ?? submit.error) instanceof Error
                          ? (upload.error ?? submit.error)?.message
                          : locale === "ar"
                            ? "تعذر تنفيذ العملية."
                            : "The action could not be completed."}
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
            : locale === "ar"
              ? "تعذر بدء التسليم."
              : "Unable to start the submission."}
        </p>
      ) : null}
      {assignments.isError || mine.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {locale === "ar"
            ? "تعذر تحميل مهمة الدورة."
            : "Unable to load coursework."}
        </p>
      ) : null}
    </section>
  );
}

function QuizPanel({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
  const locale = useLocale();
  const quizzes = useQuery({
    queryKey: ["quizzes", courseId, locale],
    queryFn: () =>
      api<
        {
          id: string;
          lessonId?: string;
          title: string;
          passMark: number;
          timeLimitMinutes?: number;
          showScore: boolean;
          showAnswers: boolean;
          availableFromUtc?: string;
          availableUntilUtc?: string;
          allowLateAttempts: boolean;
          isOpen: boolean;
          isLate: boolean;
          activeAttempt?: {
            id: string;
            startedAtUtc?: string;
            expiresAtUtc?: string;
          };
          latestAttempt?: {
            id: string;
            submittedAtUtc?: string;
            requiresManualReview: boolean;
            isFinal: boolean;
            scorePercent?: number;
            passed?: boolean;
            wasLate: boolean;
            feedback: {
              questionId: string;
              question: string;
              feedback: string;
            }[];
          };
          questions: {
            id: string;
            type:
              | "SingleChoice"
              | "MultipleChoice"
              | "TrueFalse"
              | "ShortAnswer"
              | "FillInBlank"
              | "Matching"
              | "Ordering"
              | "Essay"
              | "ImageQuestion"
              | "CodeQuestion";
            text: string;
            options: string[];
            matchingOptions: string[];
            imagePath?: string;
          }[];
        }[]
      >(`/quizzes/courses/${courseId}?locale=${locale}`),
  });
  const visible = (quizzes.data ?? []).filter(
    (quiz) => !quiz.lessonId || quiz.lessonId === lessonId,
  );
  if (!visible.length) return null;
  return (
    <div className="mt-8 grid gap-4">
      {visible.map((quiz) => (
        <QuizAttemptForm key={quiz.id} quiz={quiz} />
      ))}
    </div>
  );
}

function QuizAttemptForm({
  quiz,
}: {
  quiz: {
    id: string;
    lessonId?: string;
    title: string;
    passMark: number;
    timeLimitMinutes?: number;
    showScore: boolean;
    showAnswers: boolean;
    availableFromUtc?: string;
    availableUntilUtc?: string;
    allowLateAttempts: boolean;
    isOpen: boolean;
    isLate: boolean;
    activeAttempt?: {
      id: string;
      startedAtUtc?: string;
      expiresAtUtc?: string;
    };
    latestAttempt?: {
      id: string;
      submittedAtUtc?: string;
      requiresManualReview: boolean;
      isFinal: boolean;
      scorePercent?: number;
      passed?: boolean;
      wasLate: boolean;
      feedback: { questionId: string; question: string; feedback: string }[];
    };
    questions: {
      id: string;
      type:
        | "SingleChoice"
        | "MultipleChoice"
        | "TrueFalse"
        | "ShortAnswer"
        | "FillInBlank"
        | "Matching"
        | "Ordering"
        | "Essay"
        | "ImageQuestion"
        | "CodeQuestion";
      text: string;
      options: string[];
      matchingOptions: string[];
      imagePath?: string;
    }[];
  };
}) {
  const locale = useLocale();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [attemptId, setAttemptId] = useState<string | null>(
    quiz.activeAttempt?.id ?? null,
  );
  const start = useMutation({
    mutationFn: () =>
      api<{ id: string; expiresAtUtc?: string }>(
        `/quizzes/${quiz.id}/attempts/start`,
        {
          method: "POST",
        },
      ),
    onSuccess: (attempt) => setAttemptId(attempt.id),
  });
  const submit = useMutation({
    mutationFn: () =>
      api<{
        showScore: boolean;
        scorePercent?: number;
        passed?: boolean;
        wasLate: boolean;
        requiresManualReview: boolean;
        review: { id: string; isCorrect: boolean; correctAnswers: string[] }[];
      }>(`/quizzes/${quiz.id}/attempts`, {
        method: "POST",
        body: JSON.stringify({ attemptId, answers }),
      }),
    onError: () => setAttemptId(null),
  });
  const optionLabel = (option: string) =>
    option === "True"
      ? locale === "ar"
        ? "صح"
        : "True"
      : option === "False"
        ? locale === "ar"
          ? "خطأ"
          : "False"
        : option;
  return (
    <section className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-black">{quiz.title}</h2>
        <span className="text-xs font-bold text-muted">
          {locale === "ar" ? "النجاح" : "Pass"}: {quiz.passMark}%
        </span>
      </div>
      {quiz.timeLimitMinutes ? (
        <p className="mt-2 text-xs font-bold text-muted">
          {locale === "ar"
            ? `الوقت المحدد: ${quiz.timeLimitMinutes} دقيقة`
            : `Time limit: ${quiz.timeLimitMinutes} minutes`}
          {quiz.activeAttempt?.expiresAtUtc || start.data?.expiresAtUtc
            ? ` · ${locale === "ar" ? "ينتهي" : "Ends"}: ${new Date(quiz.activeAttempt?.expiresAtUtc ?? start.data?.expiresAtUtc ?? "").toLocaleString(locale === "ar" ? "ar-JO" : "en-US")}`
            : ""}
        </p>
      ) : null}
      {quiz.latestAttempt ? (
        <div className="mt-3 rounded-lg border border-border bg-black/5 p-3 text-sm">
          <p className="font-bold">
            {quiz.latestAttempt.requiresManualReview
              ? locale === "ar"
                ? "آخر محاولة بانتظار التصحيح اليدوي من المعلم."
                : "Your latest attempt is awaiting teacher marking."
              : quiz.showScore
                ? `${locale === "ar" ? "آخر نتيجة" : "Latest result"}: ${quiz.latestAttempt.scorePercent ?? 0}% · ${quiz.latestAttempt.passed ? (locale === "ar" ? "ناجح" : "Passed") : locale === "ar" ? "لم يحقق علامة النجاح" : "Did not reach the pass mark"}`
                : locale === "ar"
                  ? "تم تسليم آخر محاولة. النتيجة مخفية وفق إعدادات المعلم."
                  : "Your latest attempt was submitted. The score is hidden by your teacher."}
            {quiz.latestAttempt.wasLate
              ? locale === "ar"
                ? " (متأخر)"
                : " (late)"
              : ""}
          </p>
          {quiz.latestAttempt.feedback.length ? (
            <ul className="mt-2 grid gap-2">
              {quiz.latestAttempt.feedback.map((item) => (
                <li
                  key={item.questionId}
                  className="rounded-md border border-border p-2 text-xs leading-5"
                >
                  <strong>{item.question}: </strong>
                  {item.feedback}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {!quiz.isOpen ? (
        <p role="status" className="mt-3 text-sm text-amber-500">
          {quiz.availableFromUtc && new Date() < new Date(quiz.availableFromUtc)
            ? locale === "ar"
              ? `يفتح الاختبار في ${new Date(quiz.availableFromUtc).toLocaleString("ar-JO")}`
              : `This quiz opens ${new Date(quiz.availableFromUtc).toLocaleString("en-US")}`
            : locale === "ar"
              ? "انتهت فترة إتاحة الاختبار."
              : "The quiz availability window has closed."}
        </p>
      ) : null}
      {quiz.isLate ? (
        <p className="mt-2 text-xs font-bold text-amber-500">
          {locale === "ar"
            ? "سيُسجل هذا التسليم كمتأخر."
            : "This attempt will be marked late."}
        </p>
      ) : null}
      {!attemptId && quiz.isOpen ? (
        <button
          type="button"
          onClick={() => start.mutate()}
          disabled={start.isPending}
          className="focus-ring mt-4 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
        >
          {locale === "ar" ? "بدء الاختبار" : "Start quiz"}
        </button>
      ) : null}
      {start.isError ? (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {start.error instanceof Error
            ? start.error.message
            : locale === "ar"
              ? "تعذر بدء الاختبار."
              : "Unable to start the quiz."}
        </p>
      ) : null}
      {attemptId ? (
        <>
          {quiz.questions.map((question) => (
            <fieldset key={question.id} className="mt-4">
              <legend className="text-sm font-semibold">{question.text}</legend>
              {question.imagePath ? (
                <img
                  src={question.imagePath}
                  alt={locale === "ar" ? "صورة السؤال" : "Question image"}
                  className="mt-3 max-h-80 w-auto max-w-full rounded-xl border border-border object-contain"
                />
              ) : null}
              {question.type === "Essay" || question.type === "CodeQuestion" ? (
                <textarea
                  value={answers[question.id]?.[0] ?? ""}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: [event.target.value],
                    }))
                  }
                  className={`mt-2 min-h-32 w-full rounded-lg border border-border bg-transparent p-2.5 text-sm ${question.type === "CodeQuestion" ? "font-mono ltr:text-left" : ""}`}
                  dir={question.type === "CodeQuestion" ? "ltr" : undefined}
                  placeholder={
                    question.type === "CodeQuestion"
                      ? locale === "ar"
                        ? "اكتب الكود هنا. لا يتم تنفيذه على الخادم."
                        : "Write your code here. It will not run on the server."
                      : locale === "ar"
                        ? "اكتب إجابتك التفصيلية"
                        : "Write your detailed answer"
                  }
                />
              ) : question.type === "ShortAnswer" ||
                question.type === "FillInBlank" ? (
                <input
                  value={answers[question.id]?.[0] ?? ""}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: [event.target.value],
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-border bg-transparent p-2.5 text-sm"
                  placeholder={
                    locale === "ar" ? "اكتب إجابتك" : "Write your answer"
                  }
                />
              ) : question.type === "Ordering" ? (
                <div className="mt-2 grid gap-2">
                  {question.options.map((_, position) => (
                    <label key={position} className="grid gap-1 text-sm">
                      <span className="font-bold text-muted">
                        {locale === "ar"
                          ? `الموضع ${position + 1}`
                          : `Position ${position + 1}`}
                      </span>
                      <select
                        value={answers[question.id]?.[position] ?? ""}
                        onChange={(event) =>
                          setAnswers((current) => {
                            const next = [...(current[question.id] ?? [])];
                            next[position] = event.target.value;
                            return { ...current, [question.id]: next };
                          })
                        }
                        className="rounded-lg border border-border bg-transparent p-2.5 text-sm"
                      >
                        <option value="">
                          {locale === "ar" ? "اختر عنصرًا" : "Choose an item"}
                        </option>
                        {question.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              ) : question.type === "Matching" ? (
                <div className="mt-2 grid gap-3">
                  {question.options.map((left) => {
                    const selected = answers[question.id] ?? [];
                    const currentValue =
                      selected
                        .find((answer) => answer.startsWith(`${left} => `))
                        ?.slice(left.length + 4) ?? "";
                    return (
                      <label
                        key={left}
                        className="grid gap-1 text-sm sm:grid-cols-2 sm:items-center"
                      >
                        <span className="font-bold">{left}</span>
                        <select
                          value={currentValue}
                          onChange={(event) =>
                            setAnswers((current) => {
                              const unchanged = (
                                current[question.id] ?? []
                              ).filter(
                                (answer) => !answer.startsWith(`${left} => `),
                              );
                              return {
                                ...current,
                                [question.id]: event.target.value
                                  ? [
                                      ...unchanged,
                                      `${left} => ${event.target.value}`,
                                    ]
                                  : unchanged,
                              };
                            })
                          }
                          className="rounded-lg border border-border bg-transparent p-2.5 text-sm"
                        >
                          <option value="">
                            {locale === "ar"
                              ? "اختر المطابقة"
                              : "Choose a match"}
                          </option>
                          {question.matchingOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 grid gap-2">
                  {question.options.map((option) => {
                    const selected = answers[question.id] ?? [];
                    const multiple = question.type === "MultipleChoice";
                    return (
                      <label key={option} className="flex gap-2 text-sm">
                        <input
                          type={multiple ? "checkbox" : "radio"}
                          name={question.id}
                          value={option}
                          checked={selected.includes(option)}
                          onChange={(event) =>
                            setAnswers((current) => ({
                              ...current,
                              [question.id]: multiple
                                ? event.target.checked
                                  ? [...selected, option]
                                  : selected.filter((item) => item !== option)
                                : [option],
                            }))
                          }
                        />
                        {optionLabel(option)}
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() => submit.mutate()}
            disabled={submit.isPending || !attemptId || Boolean(submit.data)}
            className="focus-ring mt-5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
          >
            {locale === "ar" ? "إرسال الاختبار" : "Submit quiz"}
          </button>
          {submit.data ? (
            <p role="status" className="mt-3 text-sm">
              {submit.data.requiresManualReview
                ? locale === "ar"
                  ? "تم تسليم الاختبار. توجد إجابة تحتاج إلى تصحيح المعلم قبل إعلان النتيجة النهائية."
                  : "Quiz submitted. A teacher must mark one or more responses before the final result is released."
                : submit.data.showScore
                  ? `${submit.data.scorePercent ?? 0}% · ${submit.data.passed ? (locale === "ar" ? "ناجح" : "Passed") : locale === "ar" ? "حاول مجددًا" : "Try again"}`
                  : locale === "ar"
                    ? "تم تسليم الاختبار. النتيجة مخفية وفق إعدادات المعلم."
                    : "Quiz submitted. The score is hidden by your teacher."}
              {submit.data.wasLate
                ? locale === "ar"
                  ? " (متأخر)"
                  : " (late)"
                : ""}
            </p>
          ) : null}
          {submit.data?.review.length ? (
            <ul className="mt-3 grid gap-2 text-sm">
              {submit.data.review.map((item, index) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-border p-2"
                >
                  {locale === "ar"
                    ? `السؤال ${index + 1}`
                    : `Question ${index + 1}`}
                  :{" "}
                  {item.isCorrect
                    ? locale === "ar"
                      ? "صحيح"
                      : "Correct"
                    : locale === "ar"
                      ? `الصحيح: ${item.correctAnswers.join("، ")}`
                      : `Correct: ${item.correctAnswers.join(", ")}`}
                </li>
              ))}
            </ul>
          ) : null}
          {submit.isError ? (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {submit.error instanceof Error
                ? submit.error.message
                : locale === "ar"
                  ? "تعذر إرسال الاختبار."
                  : "Unable to submit the quiz."}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function EvaluationWizard() {
  const locale = useLocale();
  const router = useRouter();
  const [selected, setSelected] = useState({
    gradeId: "",
    specializationId: "",
    taskTypeId: "",
    rubricTemplateId: "",
    comment: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [evaluationId, setEvaluationId] = useState<string>();
  const [evaluationCriteria, setEvaluationCriteria] = useState<string[]>([]);
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, string>>(
    {},
  );
  const [uploadedFileKeys, setUploadedFileKeys] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("Card");
  const [authenticityConfirmed, setAuthenticityConfirmed] = useState(false);
  const maxFileBytes = 100 * 1024 * 1024;
  const fileKey = (item: File) =>
    `${item.name}:${item.size}:${item.lastModified}`;
  const uploadFiles = async (requestId: string, pendingFiles: File[]) => {
    if (pendingFiles.length === 0) return;

    for (const item of pendingFiles) {
      const form = new FormData();
      form.set("file", item);
      await api(`/evaluations/${requestId}/files`, {
        method: "POST",
        body: form,
      });
    }

    const newKeys = pendingFiles.map(fileKey);
    setUploadedFileKeys((current) => [...new Set([...current, ...newKeys])]);
  };
  const options = useQuery({
    queryKey: ["evaluation-options"],
    queryFn: () => api<EvaluationOptions>("/taxonomy/evaluation-options"),
  });
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string; criteria: string[] }>("/evaluations", {
        method: "POST",
        body: JSON.stringify(selected),
      }),
    onSuccess: async (response) => {
      setEvaluationId(response.id);
      setEvaluationCriteria(response.criteria);
      await uploadFiles(response.id, files);
    },
  });
  const checkout = useMutation({
    mutationFn: async () => {
      if (!evaluationId || files.length === 0)
        throw new Error(
          locale === "ar"
            ? "اختر ملف مهمة واحدًا على الأقل قبل الدفع."
            : "Choose at least one assignment file before payment.",
        );
      if (!authenticityConfirmed)
        throw new Error(
          locale === "ar"
            ? "يجب تأكيد إقرار أصالة العمل قبل الدفع."
            : "Confirm the originality declaration before payment.",
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
      await api(`/evaluations/${evaluationId}/authenticity-declaration`, {
        method: "POST",
      });
      return api<{ paymentId: string }>(
        `/evaluations/${evaluationId}/checkout`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ paymentMethod }),
        },
      );
    },
    onSuccess: async (payment) => {
      await api("/payments/fake/confirm", {
        method: "POST",
        body: JSON.stringify({
          paymentId: payment.paymentId,
          providerEventId: `test_${crypto.randomUUID()}`,
        }),
      });
      router.push(`/${locale}/student/evaluations`);
    },
  });
  if (options.isPending)
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          …
        </div>
      </section>
    );
  if (options.isError || !options.data)
    return (
      <section className="shell py-10">
        <p className="card p-6">
          {locale === "ar"
            ? "سجّل الدخول لطلب تقييم."
            : "Sign in to request an evaluation."}
        </p>
      </section>
    );
  const text = (item: { arabicName: string; englishName: string }) =>
    locale === "ar" ? item.arabicName : item.englishName;
  return (
    <section className="shell py-10">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
        className="card mx-auto grid max-w-2xl gap-4 p-6"
      >
        <p className="font-bold text-primary">BETCCO BTEC Evaluation</p>
        <h1 className="text-3xl font-black">
          {locale === "ar"
            ? "اكتشف المعايير التي حققتها"
            : "Discover the criteria you achieved"}
        </h1>
        <Select
          label={locale === "ar" ? "الصف" : "Grade"}
          value={selected.gradeId}
          setValue={(value) => setSelected({ ...selected, gradeId: value })}
          items={options.data.grades.map((item) => ({
            id: item.id,
            label: text(item),
          }))}
        />
        <Select
          label={locale === "ar" ? "التخصص" : "Specialization"}
          value={selected.specializationId}
          setValue={(value) =>
            setSelected({ ...selected, specializationId: value })
          }
          items={options.data.specializations.map((item) => ({
            id: item.id,
            label: text(item),
          }))}
        />
        <Select
          label={locale === "ar" ? "نوع المهمة" : "Task type"}
          value={selected.taskTypeId}
          setValue={(value) => setSelected({ ...selected, taskTypeId: value })}
          items={options.data.taskTypes.map((item) => ({
            id: item.id,
            label: text(item),
          }))}
        />
        <Select
          label="Rubric"
          value={selected.rubricTemplateId}
          setValue={(value) =>
            setSelected({ ...selected, rubricTemplateId: value })
          }
          items={options.data.rubrics
            .filter(
              (item) =>
                item.gradeId === selected.gradeId &&
                item.specializationId === selected.specializationId &&
                item.taskTypeId === selected.taskTypeId,
            )
            .map((item) => ({
              id: item.id,
              label: locale === "ar" ? item.arabicTitle : item.englishTitle,
            }))}
        />
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
        {evaluationId && (
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
        )}
        {evaluationId && (
          <label className="flex items-start gap-3 rounded-xl border border-border bg-surface-solid/60 p-3 text-sm leading-6">
            <input
              type="checkbox"
              checked={authenticityConfirmed}
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
            disabled={create.isPending}
            className="focus-ring rounded-xl bg-primary px-4 py-3 font-bold text-white"
          >
            {locale === "ar" ? "حفظ ومراجعة الطلب" : "Save and review"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => checkout.mutate()}
            disabled={checkout.isPending || !authenticityConfirmed}
            className="focus-ring rounded-xl bg-primary px-4 py-3 font-bold text-white"
          >
            {locale === "ar"
              ? "دفع التقييم بالطريقة المختارة"
              : "Pay using selected method"}
          </button>
        )}
        {(create.isError || checkout.isError) && (
          <p role="alert" className="text-sm text-red-600">
            {(create.error ?? checkout.error) instanceof Error
              ? (create.error ?? checkout.error)?.message
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
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  items: { id: string; label: string }[];
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      {label}
      <select
        value={value}
        onChange={(event) => setValue(event.target.value)}
        required
        className="rounded-lg border bg-transparent p-3"
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

function MyEvaluations() {
  const locale = useLocale();
  const result = useQuery({
    queryKey: ["evaluations"],
    queryFn: () =>
      api<
        {
          id: string;
          status: string;
          price: number;
          currency: string;
          selectedCriteria: string[];
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
        }[]
      >("/evaluations/mine"),
  });
  if (result.isPending)
    return (
      <div className="card p-5" aria-busy>
        …
      </div>
    );
  if (result.isError)
    return (
      <p className="card p-5">
        {locale === "ar" ? "تعذر تحميل الطلبات." : "Unable to load requests."}
      </p>
    );
  return (
    <section className="shell py-10">
      <h1 className="text-3xl font-black">
        {locale === "ar" ? "طلبات التقييم" : "Evaluation requests"}
      </h1>
      <div className="mt-6 space-y-3">
        {result.data.map((item) => (
          <article key={item.id} className="card grid gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-bold">{item.status}</span>
              <span>
                {item.price.toFixed(3)} {item.currency}
              </span>
            </div>
            {item.status === "Completed" && item.results.length > 0 ? (
              <div className="rounded-xl border border-border/70 bg-surface-solid/70 p-4">
                <h2 className="font-bold">
                  {locale === "ar"
                    ? "المعايير التي حققتها في المهمة"
                    : "Criteria achieved in this task"}
                </h2>
                <div className="mt-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-primary">
                    {locale === "ar"
                      ? "النتيجة النهائية المعتمدة"
                      : "Final approved result"}
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
            ) : item.status !== "Completed" ? (
              <p className="text-sm text-muted">
                {locale === "ar"
                  ? "ستظهر معاييرك ونتيجتك هنا بعد اعتماد التقييم من الإدارة."
                  : "Your criteria and result will appear here after the admin approves the evaluation."}
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
                  {locale === "ar" ? "ملاحظات التقييم" : "Assessment feedback"}
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
            {item.status === "NeedsRevision" ? (
              <EvaluationResubmission requestId={item.id} />
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function EvaluationResubmission({ requestId }: { requestId: string }) {
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
            ? "يجب تأكيد إقرار أصالة العمل قبل إعادة التسليم."
            : "Confirm the originality declaration before resubmitting.",
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
        {locale === "ar" ? "إعادة تسليم المهمة" : "Resubmit assignment"}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {locale === "ar"
          ? "أضف النسخة المعدلة ثم أعد إرسالها إلى المقيّم نفسه."
          : "Add your updated work and send it back to the same evaluator."}
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
        {locale === "ar" ? "إعادة الإرسال" : "Resubmit"}
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
