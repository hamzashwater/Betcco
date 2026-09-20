"use client";

import { CatalogGrid } from "@/features/courses/catalog-grid";
import {
  LiveSessionDirectory,
  MembershipDirectory,
  PackageDirectory,
  PublicBlog,
  TeacherDirectory,
} from "@/features/public/public-content";
import { PlatformRatingPage } from "@/features/public/platform-rating";
import { api } from "@/lib/api";
import {
  publicBrandSettingsQueryKey,
  resolveBrandSettings,
  type BrandSettings,
} from "@/lib/brand";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useState } from "react";

const labels: Record<string, { ar: string; en: string }> = {
  about: { ar: "عن BETCCO", en: "About BETCCO" },
  faq: { ar: "الأسئلة الشائعة", en: "Frequently asked questions" },
  contact: { ar: "تواصل معنا", en: "Contact us" },
  complaints: { ar: "اقتراح أو شكوى", en: "Suggestion or complaint" },
  privacy: { ar: "سياسة الخصوصية", en: "Privacy policy" },
  terms: { ar: "الشروط والأحكام", en: "Terms and conditions" },
  refunds: { ar: "الدفع والاسترداد", en: "Payment and refunds" },
  copyright: { ar: "حقوق النشر", en: "Copyright" },
  "student-agreement": { ar: "اتفاقية الطالب", en: "Student agreement" },
  "teacher-agreement": { ar: "اتفاقية المعلم", en: "Teacher agreement" },
  minors: { ar: "حماية القاصرين", en: "Minors protection" },
  cookies: { ar: "ملفات تعريف الارتباط", en: "Cookies" },
  "privacy-center": { ar: "مركز الخصوصية", en: "Privacy centre" },
  security: {
    ar: "الإبلاغ عن ثغرة أمنية",
    en: "Report a security vulnerability",
  },
  tracks: { ar: "المسارات التعليمية", en: "Learning tracks" },
  packages: { ar: "الباقات", en: "Packages" },
  memberships: {
    ar: "العضويات والاشتراكات",
    en: "Memberships & subscriptions",
  },
  teachers: { ar: "المعلمون", en: "Teachers" },
  search: { ar: "البحث", en: "Search" },
  blog: { ar: "مدونة BETCCO", en: "BETCCO blog" },
  live: { ar: "الجلسات المباشرة", en: "Live sessions" },
  "platform-rating": { ar: "تقييم BETCCO", en: "Rate BETCCO" },
  guide: { ar: "دليل الاستخدام", en: "User guide" },
};

export function ContentRoute({ segments }: { segments: string[] }) {
  const locale = useLocale();
  const language = locale === "ar" ? "ar" : "en";
  const key = segments[0] ?? "about";
  const title = labels[key]?.[language] ?? "BETCCO";
  const settings = useQuery({
    queryKey: publicBrandSettingsQueryKey(locale),
    queryFn: () => api<BrandSettings>(`/settings/public?locale=${locale}`),
  });
  const brand = resolveBrandSettings(locale, settings.data);
  const isLegalDocument = new Set([
    "terms",
    "privacy",
    "refunds",
    "copyright",
    "student-agreement",
    "teacher-agreement",
    "minors",
    "cookies",
    "complaints",
    "privacy-center",
    "security",
  ]).has(key);
  if (key === "contact" || key === "complaints")
    return (
      <>
        {key === "complaints" && <LegalDocumentPage slug="complaints" />}
        <EngagementForm
          category={key === "complaints" ? "Complaint" : "Contact"}
          title={title}
        />
      </>
    );
  if (isLegalDocument)
    return (
      <>
        <LegalDocumentPage slug={key} />
        {key === "privacy-center" && <PrivacyRequestPanel />}
        {key === "security" && (
          <EngagementForm
            category={"SecurityReport"}
            title={
              locale === "ar"
                ? "أرسل بلاغًا أمنيًا"
                : "Submit a security report"
            }
          />
        )}
      </>
    );
  if (key === "search")
    return (
      <section className="shell py-12">
        <h1 className="text-4xl font-black">{title}</h1>
        <div className="mt-6">
          <CatalogGrid />
        </div>
      </section>
    );
  if (key === "blog") return <PublicBlog slug={segments[1]} />;
  if (key === "teachers") return <TeacherDirectory />;
  if (key === "packages") return <PackageDirectory />;
  if (key === "memberships") return <MembershipDirectory />;
  if (key === "live") return <LiveSessionDirectory />;
  if (key === "platform-rating") return <PlatformRatingPage />;
  if (key === "guide") return <UserGuide />;
  if (key === "faq") return <FrequentlyAskedQuestions />;
  if (key === "about") return <AboutBetcco brand={brand} />;
  if (key === "tracks")
    return segments[1] ? (
      <TrackDetail slug={segments[1]} />
    ) : (
      <Tracks title={title} />
    );
  const content =
    key === "about"
      ? brand.BrandSecondaryMessage
      : locale === "ar"
        ? "يُدار هذا المحتوى من لوحة إدارة BETCCO ويمكن تحديثه بالعربية والإنجليزية دون تعديل الكود."
        : "This content is managed from BETCCO administration and can be updated in Arabic and English without code changes.";
  return (
    <section className="shell py-12">
      <div className="max-w-4xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          {brand.BrandName}
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
          {title}
        </h1>
      </div>
      <article className="card mt-7 max-w-3xl p-6 leading-8 text-muted sm:p-8">
        {content}
      </article>
    </section>
  );
}

function AboutBetcco({ brand }: { brand: BrandSettings }) {
  const locale = useLocale();
  const ar = locale === "ar";
  return (
    <section className="shell py-12">
      <div className="max-w-4xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          {brand.BrandName}
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
          {ar
            ? "تعلّم واضح مبني على التطبيق"
            : "Clear learning built around application"}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted">
          {brand.BrandSecondaryMessage}
        </p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          [
            ar ? "تعلّم منظّم" : "Structured learning",
            ar
              ? "انتقل من المسار والصف والتخصص إلى دورة تحتوي وحدات ودروسًا وموارد فعلية."
              : "Move from track, grade, and specialization into courses with real units, lessons, and resources.",
          ],
          [
            ar ? "تطبيق وتقييم" : "Apply and assess",
            ar
              ? "أرسل المهام والاختبارات، وتابع تقييم BTEC المبني على معايير P وM وD داخل حسابك."
              : "Submit coursework and quizzes, then follow BTEC evaluation based on P, M, and D criteria in your account.",
          ],
          [
            ar ? "متابعة مسؤولة" : "Responsible follow-through",
            ar
              ? "تتبّع التقدم والمواعيد والملاحظات والشهادات من مساحة طالب خاصة، مع بقاء الملفات والنتائج محمية."
              : "Track progress, deadlines, notes, and certificates from a private learner workspace while files and results remain protected.",
          ],
        ].map(([heading, body]) => (
          <article key={heading} className="card p-6">
            <h2 className="text-xl font-black">{heading}</h2>
            <p className="mt-3 leading-7 text-muted">{body}</p>
          </article>
        ))}
      </div>
      <p className="mt-8 max-w-4xl rounded-2xl border border-border bg-surface/70 p-5 text-sm leading-7 text-muted">
        {brand.BtecDisclaimer}
      </p>
      <Link
        href={`/${locale}/guide`}
        className="focus-ring mt-7 inline-flex rounded-xl bg-primary px-5 py-3 font-black text-slate-950"
      >
        {ar ? "افتح دليل الاستخدام" : "Open the user guide"}
      </Link>
    </section>
  );
}

function UserGuide() {
  const locale = useLocale();
  const ar = locale === "ar";
  const steps = [
    [
      ar ? "1. اختر مسارك ودورتك" : "1. Choose your track and course",
      ar
        ? "ابدأ من المسارات أو الكتالوج، ثم راجع تفاصيل الدورة ومحتواها قبل الإضافة إلى السلة."
        : "Start from Tracks or the catalogue, then review the course details and content before adding it to your cart.",
      `/${locale}/courses`,
      ar ? "استكشف الدورات" : "Browse courses",
    ],
    [
      ar
        ? "2. سجّل كطالب وأكمل الدفع"
        : "2. Register as a learner and check out",
      ar
        ? "يُحسب السعر والخصم من الخادم. لا يُمنح الوصول إلا بعد تحقق الدفع الموثوق من مزود الدفع."
        : "The server calculates price and discounts. Access is granted only after trusted payment-provider verification.",
      `/${locale}/register`,
      ar ? "إنشاء حساب طالب" : "Create a student account",
    ],
    [
      ar ? "3. تعلّم وتابع تقدمك" : "3. Learn and track progress",
      ar
        ? "من مساحة الطالب ستجد دوراتك، المواعيد، الملاحظات، الإشارات المرجعية والشهادات عند استحقاقها."
        : "Your student workspace contains courses, deadlines, notes, bookmarks, and earned certificates.",
      `/${locale}/student`,
      ar ? "مساحة الطالب" : "Student workspace",
    ],
    [
      ar
        ? "4. أرسل مهمة أو اطلب تقييمًا"
        : "4. Submit work or request an evaluation",
      ar
        ? "ارفع ملفاتك الخاصة، ثم تابع الحالة والنتيجة بعد تدقيق المعلم واعتماد الإدارة عند الحاجة."
        : "Upload your private files, then follow status and results after teacher review and, when required, admin verification.",
      `/${locale}/student/evaluations/new`,
      ar ? "طلب تقييم" : "Request evaluation",
    ],
    [
      ar
        ? "5. المعلمون يُدعون من الأدمن"
        : "5. Teachers are invited by an admin",
      ar
        ? "لا يوجد تسجيل معلم ذاتي. ينشئ الأدمن الدعوة، ثم ينشئ المعلم الدورة ويقدمها للمراجعة قبل النشر."
        : "There is no self-service teacher registration. An admin invites the teacher, who creates a course and submits it for review before publication.",
      `/${locale}/teachers`,
      ar ? "صفحة المعلمين" : "Teacher directory",
    ],
  ];
  return (
    <section className="shell py-12">
      <div className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          BETCCO
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
          {ar ? "دليل استخدام BETCCO" : "Using BETCCO"}
        </h1>
        <p className="mt-4 leading-7 text-muted">
          {ar
            ? "خطوات عملية مرتبطة بالمسارات الموجودة فعلًا في المنصة."
            : "Practical steps linked to routes that are actually available in the platform."}
        </p>
      </div>
      <ol className="mt-8 grid gap-4">
        {steps.map(([heading, body, href, action]) => (
          <li
            key={heading}
            className="card flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <h2 className="text-xl font-black">{heading}</h2>
              <p className="mt-2 max-w-3xl leading-7 text-muted">{body}</p>
            </div>
            <Link
              href={href}
              className="focus-ring shrink-0 rounded-xl border border-primary/40 px-4 py-2.5 text-sm font-black text-primary hover:bg-primary/10"
            >
              {action}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FrequentlyAskedQuestions() {
  const locale = useLocale();
  const ar = locale === "ar";
  const questions = [
    [
      ar ? "كيف أشتري دورة؟" : "How do I buy a course?",
      ar
        ? "سجّل كطالب، أضف الدورة إلى السلة، وأكمل Checkout. لا يُسجَّل الطالب في الدورة من رابط النجاح وحده؛ يحتاج النظام إلى تأكيد موثوق من مزود الدفع."
        : "Sign in as a student, add the course to your cart, and complete checkout. A success page alone never enrolls a student; BETCCO requires trusted confirmation from the payment provider.",
    ],
    [
      ar
        ? "هل BETCCO جهة Pearson أو مركز BTEC معتمد؟"
        : "Is BETCCO Pearson or a BTEC approved centre?",
      ar
        ? "لا. BETCCO منصة تعليمية مستقلة تقدم مواد مساندة لدارسي BTEC ولا تدّعي تمثيل Pearson أو إصدار شهادات Pearson الرسمية دون اعتماد موثق."
        : "No. BETCCO is an independent learning platform supporting BTEC learners. It does not claim to represent Pearson or issue official Pearson certificates without documented accreditation.",
    ],
    [
      ar ? "كيف أرسل مهمة للتقييم؟" : "How do I submit work for evaluation?",
      ar
        ? "من مساحة الطالب افتح طلب تقييم، اختر الصف والتخصص ونوع المهمة، ثم أضف ملفاتك الخاصة واتبع حالة الطلب."
        : "From the student workspace, open an evaluation request, choose your grade, specialization, and task type, then add your private files and follow the request status.",
    ],
    [
      ar ? "كيف أصبح معلّمًا؟" : "How do I become a teacher?",
      ar
        ? "حساب المعلم لا يُنشأ ذاتيًا. يحتاج الأدمن إلى إنشاء دعوة وتفعيل الحساب، ثم يستطيع المعلم بناء الدورة وتقديمها للمراجعة."
        : "Teacher accounts are not self-created. An administrator must issue an invitation and activate the account; the teacher can then build and submit a course for review.",
    ],
    [
      ar ? "هل ملفاتي عامة؟" : "Are my files public?",
      ar
        ? "لا. الملفات المرفوعة للتقييم أو للدروس تُحفظ في تخزين خاص وتخضع لصلاحيات الوصول على الخادم."
        : "No. Files uploaded for evaluation or course delivery are stored privately and protected by server-side access checks.",
    ],
  ];
  return (
    <section className="shell py-12">
      <div className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          BETCCO
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
          {ar ? "الأسئلة الشائعة" : "Frequently asked questions"}
        </h1>
      </div>
      <div className="mt-8 grid gap-3">
        {questions.map(([question, answer]) => (
          <details key={question} className="card group p-5">
            <summary className="cursor-pointer list-none font-black marker:hidden">
              {question}
            </summary>
            <p className="mt-4 leading-7 text-muted">{answer}</p>
          </details>
        ))}
      </div>
      <Link
        href={`/${locale}/contact`}
        className="focus-ring mt-7 inline-flex rounded-xl bg-primary px-5 py-3 font-black text-slate-950"
      >
        {ar ? "تواصل مع الدعم" : "Contact support"}
      </Link>
    </section>
  );
}

type LegalDocument = {
  slug: string;
  version: string;
  title: string;
  content: string;
  effectiveAtUtc: string;
};

function LegalDocumentPage({ slug }: { slug: string }) {
  const locale = useLocale();
  const settings = useQuery({
    queryKey: publicBrandSettingsQueryKey(locale),
    queryFn: () => api<BrandSettings>(`/settings/public?locale=${locale}`),
    staleTime: 60_000,
  });
  const document = useQuery({
    queryKey: ["legal-document", slug, locale],
    queryFn: () => api<LegalDocument>(`/legal/${slug}?locale=${locale}`),
    staleTime: 60_000,
  });
  const brand = resolveBrandSettings(locale, settings.data);
  if (document.isPending)
    return (
      <section className="shell py-12">
        <div className="card h-64 animate-pulse" aria-busy />
      </section>
    );
  if (document.isError || !document.data)
    return (
      <section className="shell py-12">
        <p className="card max-w-3xl p-6" role="alert">
          {locale === "ar"
            ? "تعذر تحميل هذه الوثيقة القانونية."
            : "This legal document could not be loaded."}
        </p>
      </section>
    );
  const value = document.data;
  const content = interpolateLegalText(value.content, brand);
  const effectiveDate = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-JO" : "en",
    {
      dateStyle: "long",
    },
  ).format(new Date(value.effectiveAtUtc));
  return (
    <section className="shell py-12">
      <div className="max-w-4xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          {brand.BrandName}
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
          {value.title}
        </h1>
        <p className="mt-3 text-sm text-muted">
          {locale === "ar" ? "الإصدار" : "Version"} {value.version} ·{" "}
          {locale === "ar" ? "ساري من" : "Effective"} {effectiveDate}
        </p>
      </div>
      {locale === "en" && (
        <p className="mt-6 max-w-3xl rounded-xl border border-amber-400/35 bg-amber-400/10 p-4 text-sm leading-6 text-foreground">
          The Arabic version is the operational reference for Jordanian
          publication until an English legal translation is reviewed and
          approved.
        </p>
      )}
      <article className="card mt-7 max-w-4xl p-6 leading-8 text-muted sm:p-8">
        <MarkdownLegalContent content={content} />
      </article>
      <p className="mt-5 max-w-4xl text-xs leading-5 text-muted">
        {locale === "ar"
          ? "هذه وثيقة تشغيلية للمنصة ويجب مراجعتها واعتمادها قانونيًا قبل النشر العام."
          : "This is an operational platform document and requires legal review and approval before public production publication."}
      </p>
    </section>
  );
}

type PrivacyRequestType =
  | "Access"
  | "Rectification"
  | "Restriction"
  | "ErasureOrConcealment"
  | "ObjectionToProfiling"
  | "Portability"
  | "WithdrawMarketingConsent";
type PrivacyRequestStatus =
  | "Submitted"
  | "IdentityVerificationRequired"
  | "InReview"
  | "Completed"
  | "Rejected"
  | "Cancelled";
type PrivacyRequest = {
  id: string;
  requestType: PrivacyRequestType;
  status: PrivacyRequestStatus;
  description?: string | null;
  resolutionSummary?: string | null;
  identityVerifiedAtUtc?: string | null;
  createdAtUtc: string;
  resolvedAtUtc?: string | null;
};
type PrivacyRequestPage = {
  items: PrivacyRequest[];
  page: number;
  pageSize: number;
  totalCount: number;
};
type PrivacyCurrentUser = { id: string; displayName: string; roles: string[] };

function PrivacyRequestPanel() {
  const locale = useLocale();
  const ar = locale === "ar";
  const [requestType, setRequestType] = useState<PrivacyRequestType>("Access");
  const [description, setDescription] = useState("");
  const user = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api<PrivacyCurrentUser>("/auth/me"),
    retry: false,
  });
  const requests = useQuery({
    queryKey: ["privacy-requests"],
    queryFn: () => api<PrivacyRequestPage>("/privacy/requests"),
    enabled: Boolean(user.data),
    retry: false,
  });
  const createRequest = useMutation({
    mutationFn: () =>
      api<PrivacyRequest>("/privacy/requests", {
        method: "POST",
        body: JSON.stringify({
          requestType,
          description: description.trim() || null,
        }),
      }),
    onSuccess: () => {
      setDescription("");
      void requests.refetch();
    },
  });
  const cancelRequest = useMutation({
    mutationFn: (requestId: string) =>
      api<void>(`/privacy/requests/${requestId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: null }),
      }),
    onSuccess: () => void requests.refetch(),
  });
  const options: { value: PrivacyRequestType; ar: string; en: string }[] = [
    { value: "Access", ar: "طلب الوصول إلى بياناتي", en: "Access my data" },
    { value: "Rectification", ar: "تصحيح بياناتي", en: "Correct my data" },
    {
      value: "Restriction",
      ar: "تقييد معالجة البيانات",
      en: "Restrict processing",
    },
    {
      value: "ErasureOrConcealment",
      ar: "محو أو إخفاء البيانات حيث ينطبق",
      en: "Erase or conceal data where applicable",
    },
    {
      value: "ObjectionToProfiling",
      ar: "الاعتراض على المعالجة أو التنميط",
      en: "Object to processing or profiling",
    },
    { value: "Portability", ar: "نسخة قابلة للنقل", en: "Portable copy" },
    {
      value: "WithdrawMarketingConsent",
      ar: "سحب موافقة التسويق",
      en: "Withdraw marketing consent",
    },
  ];
  const canCancel = (status: PrivacyRequestStatus) =>
    !["Completed", "Rejected", "Cancelled"].includes(status);
  const date = (value: string) =>
    new Intl.DateTimeFormat(ar ? "ar-JO" : "en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  const statusLabel = (status: PrivacyRequestStatus) =>
    ({
      Submitted: ar ? "تم الإرسال" : "Submitted",
      IdentityVerificationRequired: ar
        ? "مطلوب تحقق من الهوية"
        : "Identity check required",
      InReview: ar ? "قيد المراجعة" : "In review",
      Completed: ar ? "مكتمل" : "Completed",
      Rejected: ar ? "مرفوض" : "Rejected",
      Cancelled: ar ? "ملغى" : "Cancelled",
    })[status];

  return (
    <section className="shell pb-12" aria-labelledby="privacy-request-heading">
      <div className="card max-w-4xl p-6 sm:p-8">
        <div className="max-w-2xl">
          <h2 id="privacy-request-heading" className="text-2xl font-black">
            {ar ? "طلبات الخصوصية الخاصة بك" : "Your privacy requests"}
          </h2>
          <p className="mt-2 leading-7 text-muted">
            {ar
              ? "يُسجّل الطلب للمراجعة الآمنة. لا تنشر كلمة المرور أو معلومات الدفع أو وثائق الهوية في الوصف."
              : "Requests are recorded for a secure review. Do not include a password, payment details, or identity documents in the description."}
          </p>
        </div>
        {user.isPending ? (
          <div
            className="mt-6 h-36 animate-pulse rounded-2xl bg-surface-solid"
            aria-busy
          />
        ) : !user.data ? (
          <div className="mt-6 rounded-2xl border border-border bg-surface-solid/70 p-5">
            <p className="leading-7 text-muted">
              {ar
                ? "سجّل الدخول أولًا لتأكيد هويتك ومتابعة طلبك من داخل حسابك."
                : "Sign in first so we can verify your identity and let you track the request in your account."}
            </p>
            <Link
              href={`/${locale}/login?next=/${locale}/privacy-center`}
              className="focus-ring mt-4 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950"
            >
              {ar ? "تسجيل الدخول" : "Sign in"}
            </Link>
          </div>
        ) : (
          <>
            <form
              className="mt-6 grid gap-4 rounded-2xl border border-border bg-surface-solid/50 p-5"
              onSubmit={(event) => {
                event.preventDefault();
                createRequest.mutate();
              }}
            >
              <div>
                <label
                  className="text-sm font-black"
                  htmlFor="privacy-request-type"
                >
                  {ar ? "نوع الطلب" : "Request type"}
                </label>
                <select
                  id="privacy-request-type"
                  className="focus-ring mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-foreground"
                  value={requestType}
                  onChange={(event) =>
                    setRequestType(event.target.value as PrivacyRequestType)
                  }
                >
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {ar ? option.ar : option.en}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  className="text-sm font-black"
                  htmlFor="privacy-request-details"
                >
                  {ar ? "تفاصيل اختيارية" : "Optional details"}
                </label>
                <textarea
                  id="privacy-request-details"
                  className="focus-ring mt-2 min-h-28 w-full rounded-xl border border-border bg-background p-3 text-foreground"
                  value={description}
                  maxLength={2000}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={
                    ar
                      ? "اشرح الطلب دون إرسال أي أسرار أو وثائق حساسة."
                      : "Explain the request without sending secrets or sensitive documents."
                  }
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="focus-ring rounded-xl bg-primary px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={createRequest.isPending}
                >
                  {createRequest.isPending
                    ? ar
                      ? "جارٍ الإرسال…"
                      : "Submitting…"
                    : ar
                      ? "إرسال طلب الخصوصية"
                      : "Submit privacy request"}
                </button>
                {createRequest.isError && (
                  <p className="text-sm text-danger" role="alert">
                    {createRequest.error.message}
                  </p>
                )}
                {createRequest.isSuccess && (
                  <p className="text-sm text-emerald-600" role="status">
                    {ar
                      ? "تم تسجيل طلبك ويمكنك متابعته أدناه."
                      : "Your request has been recorded and can be tracked below."}
                  </p>
                )}
              </div>
            </form>
            <div className="mt-7">
              <h3 className="text-lg font-black">
                {ar ? "سجل الطلبات" : "Request history"}
              </h3>
              {requests.isPending ? (
                <div
                  className="mt-3 h-24 animate-pulse rounded-2xl bg-surface-solid"
                  aria-busy
                />
              ) : requests.isError ? (
                <p
                  className="mt-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger"
                  role="alert"
                >
                  {requests.error.message}
                </p>
              ) : requests.data?.items.length ? (
                <ul className="mt-3 grid gap-3">
                  {requests.data.items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-2xl border border-border bg-surface-solid/50 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-black">
                            {ar
                              ? options.find(
                                  (option) => option.value === item.requestType,
                                )?.ar
                              : options.find(
                                  (option) => option.value === item.requestType,
                                )?.en}
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            {statusLabel(item.status)} ·{" "}
                            {date(item.createdAtUtc)}
                          </p>
                        </div>
                        {canCancel(item.status) && (
                          <button
                            type="button"
                            className="focus-ring rounded-xl border border-border px-3 py-2 text-sm font-black hover:bg-surface"
                            onClick={() => cancelRequest.mutate(item.id)}
                            disabled={cancelRequest.isPending}
                          >
                            {ar ? "إلغاء الطلب" : "Cancel request"}
                          </button>
                        )}
                      </div>
                      {item.resolutionSummary && (
                        <p className="mt-3 rounded-xl bg-background/70 p-3 text-sm leading-6 text-muted">
                          {item.resolutionSummary}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted">
                  {ar
                    ? "لا توجد طلبات خصوصية مسجلة بعد."
                    : "No privacy requests have been recorded yet."}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function MarkdownLegalContent({ content }: { content: string }) {
  return (
    <div className="grid gap-5">
      {content.split(/\n\s*\n/).map((block, index) => {
        const lines = block.trim().split("\n").filter(Boolean);
        const heading = lines[0]?.match(/^#{1,3}\s+(.+)$/);
        if (heading)
          return (
            <h2
              key={`${heading[1]}-${index}`}
              className="text-xl font-black leading-8 text-foreground"
            >
              {heading[1]}
            </h2>
          );
        if (lines.every((line) => line.startsWith("- ")))
          return (
            <ul
              key={`${lines[0]}-${index}`}
              className="grid list-disc gap-1 ps-5"
            >
              {lines.map((line) => (
                <li key={line}>{line.slice(2)}</li>
              ))}
            </ul>
          );
        return <p key={`${lines[0]}-${index}`}>{lines.join(" ")}</p>;
      })}
    </div>
  );
}

function interpolateLegalText(content: string, settings: BrandSettings) {
  return content.replace(
    /\{\{([A-Za-z]+)\}\}/g,
    (_token, key: string) => settings[key] || `{{${key}}}`,
  );
}

function Tracks({ title }: { title: string }) {
  const locale = useLocale();
  const result = useQuery({
    queryKey: ["taxonomy", locale],
    queryFn: () =>
      api<{
        tracks: {
          id: string;
          slug: string;
          name: string;
          isBtecFocused: boolean;
        }[];
      }>(`/taxonomy?locale=${locale}`),
  });
  return (
    <section className="shell py-12">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
        BETCCO
      </p>
      <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
        {title}
      </h1>
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        {result.data?.tracks.map((track) => (
          <a
            key={track.id}
            href={`/${locale}/tracks/${track.slug}`}
            className="card focus-ring block p-6"
            data-interactive
          >
            <p className="font-black text-primary">{track.name}</p>
            <p className="mt-2 text-sm text-muted">
              {track.isBtecFocused ? "BTEC-first" : "Academic"}
            </p>
          </a>
        ))}
      </div>
      {result.isError && (
        <p className="mt-5 text-muted">
          {locale === "ar" ? "تعذر تحميل المسارات." : "Unable to load tracks."}
        </p>
      )}
    </section>
  );
}

function TrackDetail({ slug }: { slug: string }) {
  const locale = useLocale();
  const track = useQuery({
    queryKey: ["track-detail", slug, locale],
    queryFn: () =>
      api<{
        slug: string;
        name: string;
        description?: string;
        isBtecFocused: boolean;
        courseCount: number;
        moduleCount: number;
        lessonCount: number;
        guidedLearningHours: number;
        grades: { slug: string; name: string }[];
        specializations: { slug: string; name: string }[];
        subjects: { slug: string; name: string }[];
      }>(`/taxonomy/tracks/${encodeURIComponent(slug)}?locale=${locale}`),
  });
  if (track.isPending)
    return (
      <section className="shell py-12">
        <div className="card h-52 animate-pulse" aria-busy />
      </section>
    );
  if (track.isError || !track.data)
    return (
      <section className="shell py-12">
        <div className="card p-6 text-muted">
          {locale === "ar"
            ? "هذا المسار غير متاح."
            : "This learning track is unavailable."}
        </div>
      </section>
    );
  return (
    <section className="shell py-12">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_85%_15%,color-mix(in_srgb,var(--primary)_28%,transparent),transparent_38%),linear-gradient(135deg,color-mix(in_srgb,var(--surface)_94%,transparent),color-mix(in_srgb,var(--surface-solid)_75%,transparent))] p-7 shadow-[var(--shadow)] sm:p-10">
        <p className="relative text-xs font-black uppercase tracking-[0.18em] text-primary">
          {track.data.isBtecFocused ? "BETCCO · BTEC-first" : "BETCCO Learning"}
        </p>
        <h1 className="relative mt-3 text-4xl font-black tracking-tight sm:text-5xl">
          {track.data.name}
        </h1>
        <p className="relative mt-4 max-w-2xl leading-7 text-muted">
          {track.data.description ||
            (track.data.isBtecFocused
              ? locale === "ar"
                ? "استكشف الدورات المنشورة التي تدعم التعلم والتطبيق وتحقيق المعايير ضمن مسار BTEC."
                : "Explore published courses that support learning, application, and criteria achievement in the BTEC pathway."
              : locale === "ar"
                ? "استكشف الدورات المنشورة المتاحة ضمن هذا المسار الأكاديمي."
                : "Explore published courses available in this academic pathway.")}
        </p>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [
            track.data.courseCount,
            locale === "ar" ? "دورات منشورة" : "Published courses",
          ],
          [
            track.data.moduleCount,
            locale === "ar" ? "وحدات متاحة" : "Available units",
          ],
          [
            track.data.lessonCount,
            locale === "ar" ? "دروس متاحة" : "Available lessons",
          ],
          [
            track.data.guidedLearningHours,
            locale === "ar" ? "ساعات تعلّم موجه" : "Guided learning hours",
          ],
        ].map(([value, label]) => (
          <div key={String(label)} className="card p-4">
            <p className="text-2xl font-black text-primary">{value}</p>
            <p className="mt-1 text-xs font-bold text-muted">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-7 grid gap-4 lg:grid-cols-3">
        <TrackTaxonomyList
          title={locale === "ar" ? "الصفوف والمراحل" : "Grades and stages"}
          items={track.data.grades}
          empty={
            locale === "ar"
              ? "لا توجد صفوف منشورة لهذا المسار."
              : "No grades are published for this track."
          }
        />
        <TrackTaxonomyList
          title={locale === "ar" ? "التخصصات" : "Specializations"}
          items={track.data.specializations}
          empty={
            locale === "ar"
              ? "لا توجد تخصصات منشورة لهذا المسار."
              : "No specializations are published for this track."
          }
        />
        <TrackTaxonomyList
          title={locale === "ar" ? "المواد" : "Subjects"}
          items={track.data.subjects}
          empty={
            locale === "ar"
              ? "لا توجد مواد منشورة لهذا المسار."
              : "No subjects are published for this track."
          }
        />
      </div>
      <div className="mt-8">
        <h2 className="text-2xl font-black">
          {locale === "ar"
            ? "الدورات المتاحة في هذا المسار"
            : "Available courses in this track"}
        </h2>
        <div className="mt-5">
          <CatalogGrid track={track.data.slug} />
        </div>
      </div>
    </section>
  );
}

function TrackTaxonomyList({
  title,
  items,
  empty,
}: {
  title: string;
  items: { slug: string; name: string }[];
  empty: string;
}) {
  return (
    <section className="card p-5">
      <h2 className="font-black">{title}</h2>
      {items.length ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {items.map((item) => (
            <li
              key={item.slug}
              className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary"
            >
              {item.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted">{empty}</p>
      )}
    </section>
  );
}

function EngagementForm({
  category,
  title,
}: {
  category: string;
  title: string;
}) {
  const locale = useLocale();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const send = useMutation({
    mutationFn: () =>
      api("/engagement/leads", {
        method: "POST",
        body: JSON.stringify({ name, contact, message, category, consent }),
      }),
  });
  return (
    <section className="shell py-12">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send.mutate();
        }}
        className="card mx-auto grid max-w-xl gap-4 p-6"
      >
        <h1 className="text-4xl font-black">{title}</h1>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={locale === "ar" ? "الاسم" : "Name"}
          className="rounded-lg border bg-transparent p-3"
          required
        />
        <input
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          placeholder={locale === "ar" ? "البريد أو الهاتف" : "Email or phone"}
          className="rounded-lg border bg-transparent p-3"
          required
        />
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={locale === "ar" ? "الرسالة" : "Message"}
          className="min-h-32 rounded-lg border bg-transparent p-3"
          required
        />
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          {locale === "ar"
            ? "أوافق على استخدام بياناتي للرد على الرسالة."
            : "I consent to using these details to respond."}
        </label>
        <button className="focus-ring rounded-xl bg-primary px-4 py-3 font-bold text-white">
          {locale === "ar" ? "إرسال" : "Send"}
        </button>
        {send.isSuccess && (
          <p role="status">
            {locale === "ar"
              ? "شكرًا، وصلت رسالتك."
              : "Thank you, your message was received."}
          </p>
        )}
        {send.isError && (
          <p role="alert" className="text-red-600">
            {send.error instanceof Error
              ? send.error.message
              : "Request failed."}
          </p>
        )}
      </form>
    </section>
  );
}
