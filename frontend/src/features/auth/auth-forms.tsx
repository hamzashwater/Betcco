"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError, api, invalidateCsrfToken } from "@/lib/api";
import { BrandLogo } from "@/components/brand-logo";
import { AuthThreeGalaxyBackground } from "@/components/visual/auth-three-galaxy-background";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap,
  ShieldCheck,
  UserRound,
  Eye,
  EyeOff,
  ArrowLeft,
  KeyRound,
  Mail,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

const registrationCountries = [
  { code: "JO", dialCode: "+962", ar: "الأردن", en: "Jordan" },
  { code: "PS", dialCode: "+970", ar: "فلسطين", en: "Palestine" },
  { code: "SA", dialCode: "+966", ar: "السعودية", en: "Saudi Arabia" },
  { code: "AE", dialCode: "+971", ar: "الإمارات", en: "United Arab Emirates" },
  { code: "QA", dialCode: "+974", ar: "قطر", en: "Qatar" },
  { code: "KW", dialCode: "+965", ar: "الكويت", en: "Kuwait" },
  { code: "BH", dialCode: "+973", ar: "البحرين", en: "Bahrain" },
  { code: "OM", dialCode: "+968", ar: "عُمان", en: "Oman" },
  { code: "EG", dialCode: "+20", ar: "مصر", en: "Egypt" },
  { code: "IQ", dialCode: "+964", ar: "العراق", en: "Iraq" },
  { code: "LB", dialCode: "+961", ar: "لبنان", en: "Lebanon" },
  { code: "SY", dialCode: "+963", ar: "سوريا", en: "Syria" },
  { code: "TR", dialCode: "+90", ar: "تركيا", en: "Turkey" },
  { code: "GB", dialCode: "+44", ar: "المملكة المتحدة", en: "United Kingdom" },
  { code: "US", dialCode: "+1", ar: "الولايات المتحدة", en: "United States" },
] as const;

function isAtLeast18(dateOfBirth: string) {
  const parsed = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const today = new Date();
  const cutOff = new Date(
    Date.UTC(
      today.getUTCFullYear() - 18,
      today.getUTCMonth(),
      today.getUTCDate(),
    ),
  );
  return parsed <= cutOff;
}

function adultDateLimit() {
  const today = new Date();
  return new Date(
    Date.UTC(
      today.getUTCFullYear() - 18,
      today.getUTCMonth(),
      today.getUTCDate(),
    ),
  )
    .toISOString()
    .slice(0, 10);
}

function normalizePhoneForRegistration(phone: string, countryCode: string) {
  const normalized = phone.trim().replace(/[\s()-]/g, "");
  if (normalized.startsWith("+")) return normalized;
  const dialCode =
    registrationCountries.find((country) => country.code === countryCode)
      ?.dialCode ?? "+";
  return `${dialCode}${normalized.replace(/^0/, "")}`;
}

const registerSchema = z
  .object({
    firstName: z.string().trim().min(2),
    lastName: z.string().trim().min(2),
    email: z.string().trim().email(),
    countryCode: z.string().length(2),
    phone: z.string().trim().min(7).max(40),
    gender: z.enum(["Male", "Female", "PreferNotToSay"]),
    dateOfBirth: z
      .string()
      .min(1, "Date of birth is required.")
      .refine(isAtLeast18, "You must be at least 18 years old."),
    password: z
      .string()
      .min(12)
      .regex(/[A-Z]/, "Include an uppercase letter.")
      .regex(/[^A-Za-z0-9]/, "Include a symbol."),
    confirmPassword: z.string(),
    termsAccepted: z
      .boolean()
      .refine((value) => value, "You must accept the terms."),
    marketingConsent: z.boolean(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  });
type RegisterValues = z.infer<typeof registerSchema>;
const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  rememberMe: z.boolean(),
  twoFactorCode: z.string().trim().optional(),
});
type LoginValues = z.infer<typeof loginSchema>;
const forgotPasswordSchema = z.object({ email: z.string().trim().email() });
const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(12)
      .regex(/[A-Z]/, "Include an uppercase letter.")
      .regex(/[^A-Za-z0-9]/, "Include a symbol."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  });
type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
type LegalDocumentSummary = {
  slug: string;
  version: string;
  title: string;
  effectiveAtUtc: string;
};

function authErrorMessage(error: unknown, locale: string) {
  if (
    error instanceof ApiError &&
    error.code === "EMAIL_CONFIRMATION_INVALID"
  ) {
    return locale === "ar"
      ? "رابط تأكيد البريد غير صالح أو انتهت صلاحيته. أنشئ حسابًا جديدًا أو تواصل مع الدعم."
      : "The email-confirmation link is invalid or has expired. Create a new account or contact support.";
  }
  if (error instanceof ApiError && error.code === "DEVICE_LIMIT") {
    return locale === "ar"
      ? "هذا الحساب مرتبط بجهاز موثوق آخر. اطلب من الأدمن إعادة ضبط الجهاز ثم حاول مجددًا."
      : "This account is linked to another trusted device. Ask an administrator to reset the device, then try again.";
  }
  if (error instanceof ApiError && error.code === "TWO_FACTOR_REQUIRED") {
    return locale === "ar"
      ? "أدخل رمز المصادقة المكوّن من 6 أرقام من تطبيق المصادقة."
      : "Enter the 6-digit code from your authenticator app.";
  }
  if (error instanceof ApiError && error.code === "TWO_FACTOR_INVALID") {
    return locale === "ar"
      ? "رمز تطبيق المصادقة غير صحيح أو انتهت صلاحيته."
      : "The authenticator code is invalid or expired.";
  }
  if (error instanceof ApiError && error.code === "PASSWORD_CHANGE_REQUIRED") {
    return locale === "ar"
      ? "يجب إعادة تعيين كلمة المرور قبل تسجيل الدخول."
      : "You must reset your password before signing in.";
  }
  return error instanceof Error ? error.message : "Request failed.";
}

const motivationMessages = {
  ar: [
    "كل درس تكمله يقربك خطوة من هدفك.",
    "التقدّم الصغير اليوم يصنع إنجازًا كبيرًا غدًا.",
    "تعلّم، طبّق، ثم دع إنجازك يتكلم عنك.",
    "أنت لا تحفظ فقط — أنت تبني مهارة حقيقية.",
    "المعيار الذي تحققه اليوم هو ثقة إضافية في نفسك.",
  ],
  en: [
    "Every completed lesson moves you closer to your goal.",
    "Small progress today becomes a big achievement tomorrow.",
    "Learn, apply, then let your work speak for you.",
    "You are not only memorising — you are building a real skill.",
    "Every criterion you achieve is another vote of confidence in yourself.",
  ],
};

export function AuthPageLayout({
  children,
  showGalaxy = false,
}: {
  children: React.ReactNode;
  showGalaxy?: boolean;
}) {
  const locale = useLocale();
  const logoTilt = useRef<HTMLDivElement>(null);
  const [messageIndex, setMessageIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(true);
  const messages =
    locale === "ar" ? motivationMessages.ar : motivationMessages.en;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReduceMotion(mediaQuery.matches);
    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);
    return () =>
      mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(
      () => setMessageIndex((current) => (current + 1) % messages.length),
      3_000,
    );
    return () => window.clearInterval(timer);
  }, [messages.length, reduceMotion]);

  const resetLogoTilt = () => {
    logoTilt.current?.style.setProperty("--auth-pointer-x", "0");
    logoTilt.current?.style.setProperty("--auth-pointer-y", "0");
  };

  return (
    <div className="auth-page-shell">
      {showGalaxy && <AuthThreeGalaxyBackground />}
      <section
        dir="ltr"
        className="shell relative z-10 grid items-stretch gap-6 py-8 md:grid-cols-[0.9fr_1fr] md:py-12"
      >
        <aside
          dir={locale === "ar" ? "rtl" : "ltr"}
          className="relative flex min-h-[22rem] p-4 sm:min-h-[26rem] sm:p-7"
          onPointerMove={(event) => {
            if (reduceMotion || !logoTilt.current) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const x = (event.clientX - bounds.left) / bounds.width - 0.5;
            const y = (event.clientY - bounds.top) / bounds.height - 0.5;
            logoTilt.current.style.setProperty(
              "--auth-pointer-x",
              x.toFixed(3),
            );
            logoTilt.current.style.setProperty(
              "--auth-pointer-y",
              y.toFixed(3),
            );
          }}
          onPointerLeave={resetLogoTilt}
        >
          <div className="flex w-full flex-col items-center text-center">
            <div className="auth-logo-float">
              <div
                ref={logoTilt}
                className="auth-logo-tilt w-[min(100%,22rem)]"
              >
                <BrandLogo
                  variant="horizontal"
                  priority
                  className="brand-logo-on-light w-full"
                />
                <BrandLogo
                  variant="horizontal"
                  priority
                  className="auth-logo-on-dark brand-logo-on-dark w-full"
                />
              </div>
            </div>
            <p className="mt-5 text-sm font-black tracking-[0.16em] text-primary">
              {locale === "ar" ? "رحلتك تبدأ الآن" : "YOUR JOURNEY STARTS NOW"}
            </p>
            <h2 className="mt-3 max-w-sm text-2xl font-black leading-snug text-foreground sm:text-3xl">
              {locale === "ar"
                ? "كل خطوة تعلّم تقرّبك من إنجاز أكبر."
                : "Every learning step leads to a greater achievement."}
            </h2>
            <div
              key={messageIndex}
              className="auth-motivation-card mt-auto w-full max-w-md text-start"
              aria-live="off"
            >
              <p className="text-xs font-black tracking-[0.14em] text-primary">
                {locale === "ar" ? "رسالة لك" : "A NOTE FOR YOU"}
              </p>
              <p className="mt-2 text-base font-bold leading-7 text-foreground">
                {messages[messageIndex]}
              </p>
              <div className="mt-4 flex gap-1.5" aria-hidden="true">
                {messages.map((message, index) => (
                  <span
                    key={message}
                    className={`h-1.5 rounded-full transition-all ${index === messageIndex ? "w-6 bg-primary" : "w-1.5 bg-foreground/25"}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </aside>
        <div
          dir={locale === "ar" ? "rtl" : "ltr"}
          className="flex min-w-0 items-center"
        >
          {children}
        </div>
      </section>
    </div>
  );
}

export function RegisterForm() {
  const locale = useLocale();
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      countryCode: "JO",
      phone: "",
      gender: "PreferNotToSay",
      dateOfBirth: "",
      password: "",
      confirmPassword: "",
      termsAccepted: false,
      marketingConsent: false,
    },
  });
  const legal = useQuery({
    queryKey: ["required-legal-documents", locale],
    queryFn: () =>
      api<LegalDocumentSummary[]>(`/legal/required?locale=${locale}`),
    staleTime: 60_000,
  });
  const terms = legal.data?.find((document) => document.slug === "terms");
  const privacy = legal.data?.find((document) => document.slug === "privacy");
  const request = useMutation({
    mutationFn: (values: RegisterValues) =>
      api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          displayName: `${values.firstName.trim()} ${values.lastName.trim()}`,
          email: values.email,
          phone: normalizePhoneForRegistration(
            values.phone,
            values.countryCode,
          ),
          countryCode: values.countryCode,
          gender: values.gender,
          dateOfBirth: values.dateOfBirth,
          password: values.password,
          termsAccepted: values.termsAccepted,
          termsVersion: terms?.version ?? "",
          privacyVersion: privacy?.version ?? "",
          marketingConsent: values.marketingConsent,
        }),
      }),
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const selectedCountryCode = useWatch({
    control: form.control,
    name: "countryCode",
  });
  const selectedCountry =
    registrationCountries.find(
      (country) => country.code === selectedCountryCode,
    ) ?? registrationCountries[0];
  return (
    <form
      onSubmit={form.handleSubmit((values) => {
        if (terms && privacy) request.mutate(values);
      })}
      className="card mx-auto grid max-w-2xl gap-5 p-5 sm:p-7"
    >
      <header className="border-b border-border pb-5">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
            <GraduationCap size={23} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
              {locale === "ar" ? "انضم إلى BETCCO" : "JOIN BETCCO"}
            </p>
            <h1 className="mt-1 text-3xl font-black">
              {locale === "ar" ? "أنشئ حسابًا جديدًا" : "Create your account"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              {locale === "ar"
                ? "ابدأ كطالب، وتابع الدروس والمهام والتقييمات من مكان واحد."
                : "Start as a learner and manage lessons, coursework, and assessment in one place."}
            </p>
          </div>
        </div>
      </header>
      <section aria-label={locale === "ar" ? "نوع الحساب" : "Account type"}>
        <p className="text-sm font-bold text-muted">
          {locale === "ar" ? "نوع المستخدم" : "User type"}
        </p>
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-primary/45 bg-primary/10 p-3 text-primary">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-slate-950">
            <UserRound size={18} aria-hidden="true" />
          </span>
          <span className="font-black">
            {locale === "ar" ? "حساب طالب" : "Student account"}
          </span>
          <span className="ms-auto text-xs font-semibold text-muted">
            {locale === "ar"
              ? "حسابات المعلمين تُنشأ بدعوة من الأدمن"
              : "Teacher accounts are created by admin invitation"}
          </span>
        </div>
      </section>
      <fieldset className="grid gap-4">
        <legend className="text-sm font-bold text-muted">
          {locale === "ar" ? "معلوماتك الأساسية" : "Your details"}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={locale === "ar" ? "الاسم الأول" : "First name"}
            error={form.formState.errors.firstName?.message}
          >
            <input autoComplete="given-name" {...form.register("firstName")} />
          </Field>
          <Field
            label={locale === "ar" ? "اسم العائلة" : "Last name"}
            error={form.formState.errors.lastName?.message}
          >
            <input autoComplete="family-name" {...form.register("lastName")} />
          </Field>
        </div>
      </fieldset>
      <Field
        label={locale === "ar" ? "البريد الإلكتروني" : "Email"}
        error={form.formState.errors.email?.message}
      >
        <input type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <fieldset className="grid gap-4 border-t border-border pt-5">
        <legend className="text-sm font-bold text-muted">
          {locale === "ar" ? "بيانات التواصل والتعريف" : "Contact and profile"}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={locale === "ar" ? "الدولة" : "Country"}
            error={form.formState.errors.countryCode?.message}
          >
            <select autoComplete="country" {...form.register("countryCode")}>
              {registrationCountries.map((country) => (
                <option key={country.code} value={country.code}>
                  {locale === "ar" ? country.ar : country.en}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={locale === "ar" ? "رقم الهاتف / واتساب" : "Phone / WhatsApp"}
            error={form.formState.errors.phone?.message}
          >
            <span className="relative block">
              <input
                type="tel"
                autoComplete="tel"
                className="!ps-16"
                placeholder={locale === "ar" ? "7X XXX XXXX" : "7X XXX XXXX"}
                {...form.register("phone")}
              />
              <span
                dir="ltr"
                className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-xs font-bold text-muted"
              >
                {selectedCountry.dialCode}
              </span>
            </span>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={locale === "ar" ? "نوع الجنس" : "Gender"}
            error={form.formState.errors.gender?.message}
          >
            <select autoComplete="sex" {...form.register("gender")}>
              <option value="Male">{locale === "ar" ? "ذكر" : "Male"}</option>
              <option value="Female">
                {locale === "ar" ? "أنثى" : "Female"}
              </option>
              <option value="PreferNotToSay">
                {locale === "ar" ? "أفضل عدم الإفصاح" : "Prefer not to say"}
              </option>
            </select>
          </Field>
          <Field
            label={locale === "ar" ? "تاريخ الميلاد" : "Date of birth"}
            error={form.formState.errors.dateOfBirth?.message}
          >
            <input
              type="date"
              autoComplete="bday"
              max={adultDateLimit()}
              {...form.register("dateOfBirth")}
            />
          </Field>
        </div>
        <p className="text-xs leading-5 text-muted">
          {locale === "ar"
            ? "التسجيل الذاتي متاح لمن بلغ 18 سنة أو أكثر."
            : "Self-registration is available to learners aged 18 and over."}
        </p>
      </fieldset>
      <fieldset className="grid gap-4 border-t border-border pt-5">
        <legend className="flex items-center gap-2 text-sm font-bold text-muted">
          <ShieldCheck size={16} className="text-primary" aria-hidden="true" />
          {locale === "ar" ? "تأمين الحساب" : "Secure your account"}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={locale === "ar" ? "كلمة المرور" : "Password"}
            error={form.formState.errors.password?.message}
          >
            <span className="relative block">
              <input
                type={showPassword ? "text" : "password"}
                className="!pe-11"
                aria-label={locale === "ar" ? "كلمة المرور" : "Password"}
                {...form.register("password")}
              />
              <PasswordVisibilityButton
                locale={locale}
                visible={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              />
            </span>
          </Field>
          <Field
            label={locale === "ar" ? "تأكيد كلمة المرور" : "Confirm password"}
            error={form.formState.errors.confirmPassword?.message}
          >
            <span className="relative block">
              <input
                type={showConfirmation ? "text" : "password"}
                className="!pe-11"
                {...form.register("confirmPassword")}
              />
              <PasswordVisibilityButton
                locale={locale}
                visible={showConfirmation}
                onClick={() => setShowConfirmation((value) => !value)}
              />
            </span>
          </Field>
        </div>
        <p className="text-xs leading-5 text-muted">
          {locale === "ar"
            ? "استخدم 12 حرفًا على الأقل، وتتضمن كلمة المرور حرفًا كبيرًا ورمزًا."
            : "Use at least 12 characters, including an uppercase letter and a symbol."}
        </p>
      </fieldset>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" {...form.register("termsAccepted")} />
        <span>
          {locale === "ar"
            ? "أقر بأنني قرأت ووافقت على "
            : "I confirm that I have read and accepted the "}
          <Link
            className="font-bold text-primary underline"
            href={`/${locale}/terms`}
            target="_blank"
            rel="noreferrer"
          >
            {locale === "ar"
              ? `الشروط والأحكام (الإصدار ${terms?.version ?? "…"})`
              : `Terms and conditions (version ${terms?.version ?? "…"})`}
          </Link>
          {locale === "ar" ? " و" : " and the "}
          <Link
            className="font-bold text-primary underline"
            href={`/${locale}/privacy`}
            target="_blank"
            rel="noreferrer"
          >
            {locale === "ar"
              ? `سياسة الخصوصية (الإصدار ${privacy?.version ?? "…"})`
              : `Privacy policy (version ${privacy?.version ?? "…"})`}
          </Link>
          {locale === "ar" ? "." : "."}
        </span>
      </label>
      {form.formState.errors.termsAccepted && (
        <p className="text-xs text-red-600">
          {form.formState.errors.termsAccepted.message}
        </p>
      )}
      <label className="flex gap-2 text-sm text-muted">
        <input type="checkbox" {...form.register("marketingConsent")} />
        <span>
          {locale === "ar"
            ? "أوافق اختياريًا على استلام العروض والرسائل التسويقية، ويمكنني سحب هذه الموافقة في أي وقت."
            : "I optionally agree to receive offers and marketing messages, and can withdraw this consent at any time."}
        </span>
      </label>
      <button
        disabled={request.isPending || legal.isPending || !terms || !privacy}
        className="focus-ring rounded-xl bg-primary px-4 py-3 font-bold text-white disabled:opacity-60"
      >
        {request.isPending
          ? "…"
          : locale === "ar"
            ? "إنشاء الحساب"
            : "Create account"}
      </button>
      <p className="text-center text-sm text-muted">
        {locale === "ar" ? "لديك حساب بالفعل؟ " : "Already have an account? "}
        <Link
          className="font-bold text-primary hover:underline"
          href={`/${locale}/login`}
        >
          {locale === "ar" ? "سجّل الدخول" : "Sign in"}
        </Link>
      </p>
      {request.isSuccess && (
        <p role="status" className="text-sm text-emerald-700">
          {locale === "ar"
            ? "تم إنشاء الحساب. افحص بريدك لتأكيده قبل تسجيل الدخول."
            : "Account created. Check your email before signing in."}
        </p>
      )}
      {request.isError && (
        <p role="alert" className="text-sm text-red-600">
          {authErrorMessage(request.error, locale)}
        </p>
      )}
      {legal.isError && (
        <p role="alert" className="text-sm text-red-600">
          {locale === "ar"
            ? "تعذر تحميل الإصدارات القانونية الحالية. حاول مرة أخرى لاحقًا."
            : "The current legal document versions could not be loaded. Please try again later."}
        </p>
      )}
    </form>
  );
}

export function LoginForm() {
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
      twoFactorCode: "",
    },
  });
  const request = useMutation({
    mutationFn: (values: LoginValues) =>
      api<{ user: { displayName: string; roles: string[] } }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          twoFactorCode: values.twoFactorCode || null,
        }),
      }),
    onSuccess: (result) => {
      invalidateCsrfToken();
      queryClient.setQueryData(["current-user"], result.user);
      void queryClient.invalidateQueries({ queryKey: ["current-user"] });
      const destination =
        result.user.roles.includes("Admin") ||
        result.user.roles.includes("SystemAdmin")
          ? "admin/dashboard"
          : result.user.roles.includes("CourseReviewer")
            ? "admin/evaluations"
            : result.user.roles.includes("Teacher")
              ? "teacher/dashboard"
              : "student/dashboard";
      router.replace(`/${locale}/${destination}`);
      router.refresh();
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.code === "PASSWORD_CHANGE_REQUIRED"
      ) {
        router.push(`/${locale}/reset-password`);
        return;
      }
      if (
        error instanceof ApiError &&
        (error.code === "TWO_FACTOR_REQUIRED" ||
          error.code === "TWO_FACTOR_INVALID")
      ) {
        setRequiresTwoFactor(true);
        window.setTimeout(() => form.setFocus("twoFactorCode"), 0);
      }
    },
  });
  return (
    <form
      onSubmit={form.handleSubmit((values) => request.mutate(values))}
      className="card mx-auto grid max-w-md gap-4 p-6"
    >
      <h1 className="text-3xl font-black">
        {locale === "ar" ? "تسجيل الدخول" : "Sign in"}
      </h1>
      <Field
        label={locale === "ar" ? "البريد الإلكتروني" : "Email"}
        error={form.formState.errors.email?.message}
      >
        <input type="email" {...form.register("email")} />
      </Field>
      <Field
        label={locale === "ar" ? "كلمة المرور" : "Password"}
        error={form.formState.errors.password?.message}
      >
        <span className="relative block">
          <input
            type={showPassword ? "text" : "password"}
            className="!pe-11"
            {...form.register("password")}
          />
          <PasswordVisibilityButton
            locale={locale}
            visible={showPassword}
            onClick={() => setShowPassword((value) => !value)}
          />
        </span>
      </Field>
      {requiresTwoFactor && (
        <Field
          label={
            locale === "ar"
              ? "رمز تطبيق المصادقة (6 أرقام)"
              : "Authenticator code (6 digits)"
          }
          error={form.formState.errors.twoFactorCode?.message}
        >
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="font-mono tracking-[0.25em]"
            {...form.register("twoFactorCode", {
              onChange: (event) => {
                event.target.value = event.target.value.replace(/\D/g, "");
              },
            })}
          />
        </Field>
      )}
      <label className="flex gap-2 text-sm">
        <input type="checkbox" {...form.register("rememberMe")} />
        {locale === "ar"
          ? "تذكرني على هذا الجهاز"
          : "Remember me on this device"}
      </label>
      <button
        disabled={request.isPending}
        className="focus-ring rounded-xl bg-primary px-4 py-3 font-bold text-white disabled:opacity-60"
      >
        {request.isPending ? "…" : locale === "ar" ? "دخول" : "Sign in"}
      </button>
      {request.isError && (
        <p role="alert" className="text-sm text-red-600">
          {authErrorMessage(request.error, locale)}
        </p>
      )}
      <Link
        className="text-sm font-semibold text-primary"
        href={`/${locale}/register`}
      >
        {locale === "ar" ? "إنشاء حساب طالب" : "Create a student account"}
      </Link>
      <Link
        className="text-sm font-semibold text-primary"
        href={`/${locale}/reset-password`}
      >
        {locale === "ar" ? "نسيت كلمة المرور؟" : "Forgot your password?"}
      </Link>
      <div className="rounded-xl border border-border bg-white/5 p-4 text-sm leading-6 text-muted">
        <p>
          {locale === "ar"
            ? "لا تريد تسجيل الدخول الآن؟ يمكنك المتابعة كضيف لاستكشاف الصفحات والدورات العامة."
            : "Not ready to sign in? Continue as a guest to explore public pages and courses."}
        </p>
        <p className="mt-1">
          {locale === "ar"
            ? "الشراء، السلة، التعلّم، والملفات الخاصة تتطلب حساب طالب مسجّل الدخول."
            : "Purchasing, the cart, learning, and private files require a signed-in student account."}
        </p>
        <Link
          className="focus-ring mt-3 inline-flex font-bold text-primary"
          href={`/${locale}`}
        >
          {locale === "ar" ? "الدخول كضيف" : "Continue as guest"}
        </Link>
      </div>
    </form>
  );
}

export function EmailConfirmationForm() {
  const locale = useLocale();
  const t = useTranslations("auth.emailConfirmation");
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const token = searchParams.get("token");
  const hasVerificationLink = Boolean(userId && token);
  const confirmation = useMutation({
    mutationFn: () =>
      api<{ message: string }>(
        `/auth/confirm-email?${new URLSearchParams({
          userId: userId ?? "",
          token: token ?? "",
        })}`,
        { method: "POST" },
      ),
  });

  return (
    <section
      className="card mx-auto grid max-w-md gap-4 p-6"
      aria-live="polite"
    >
      <h1 className="text-3xl font-black">{t("title")}</h1>
      <p className="text-sm leading-7 text-muted">{t("description")}</p>
      {!hasVerificationLink ? (
        <>
          <p
            role="alert"
            className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700"
          >
            {t("missingLink")}
          </p>
          <Link className="font-bold text-primary" href={`/${locale}/register`}>
            {t("createAccount")}
          </Link>
        </>
      ) : confirmation.isSuccess ? (
        <>
          <p
            role="status"
            className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700"
          >
            {t("success")}
          </p>
          <Link className="font-bold text-primary" href={`/${locale}/login`}>
            {t("signIn")}
          </Link>
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={confirmation.isPending}
            className="focus-ring rounded-xl bg-primary px-4 py-3 font-bold text-white disabled:opacity-60"
            onClick={() => confirmation.mutate()}
          >
            {confirmation.isPending ? t("confirming") : t("confirm")}
          </button>
          {confirmation.isError && (
            <p
              role="alert"
              className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700"
            >
              {authErrorMessage(confirmation.error, locale)}
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function ResetPasswordForm() {
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const token = searchParams.get("token");
  const isReset = Boolean(userId && token);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const forgot = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const reset = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  const requestReset = useMutation({
    mutationFn: (values: ForgotPasswordValues) =>
      api("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify(values),
      }),
  });
  const updatePassword = useMutation({
    mutationFn: (values: ResetPasswordValues) =>
      api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ userId, token, password: values.password }),
      }),
    onSuccess: () => router.push(`/${locale}/login`),
  });
  return (
    <section className="shell grid min-w-0 gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-center lg:py-12">
      <div className="rounded-[1.75rem] bg-gradient-to-br from-[#11354c] via-[#11283c] to-[#0c1a2a] px-6 py-10 text-white sm:px-10 lg:min-h-[32rem] lg:py-16">
        <p className="text-xs font-black tracking-[0.16em] text-[#79dfd0]">
          BETCCO ACCOUNT
        </p>
        <h1 className="mt-5 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
          {isReset
            ? locale === "ar"
              ? "أنشئ كلمة مرور جديدة لحسابك"
              : "Create a new password for your account"
            : locale === "ar"
              ? "استعد الوصول إلى حسابك"
              : "Recover access to your account"}
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-slate-200">
          {isReset
            ? locale === "ar"
              ? "استخدم الرابط الذي وصلك عبر البريد لإنشاء كلمة مرور جديدة."
              : "Use the link sent to your email to set a new password."
            : locale === "ar"
              ? "أدخل بريد حسابك وسنرسل تعليمات الاستعادة إذا كان الحساب مؤهلًا."
              : "Enter your account email. If the account is eligible, we will send recovery instructions."}
        </p>
        <div className="mt-9 grid gap-3 text-sm sm:grid-cols-2">
          <p className="rounded-xl border border-white/10 p-4">
            <ShieldCheck
              size={20}
              className="mb-3 text-[#79dfd0]"
              aria-hidden="true"
            />
            {locale === "ar" ? "رابط استعادة آمن" : "Secure reset link"}
          </p>
          <p className="rounded-xl border border-white/10 p-4">
            <KeyRound
              size={20}
              className="mb-3 text-[#79dfd0]"
              aria-hidden="true"
            />
            {locale === "ar" ? "كلمة مرور جديدة" : "A new password"}
          </p>
        </div>
      </div>
      <div className="card min-w-0 p-5 sm:p-8">
        <span className="grid size-12 place-items-center rounded-xl bg-primary/15 text-primary">
          {isReset ? (
            <KeyRound size={23} aria-hidden="true" />
          ) : (
            <Mail size={23} aria-hidden="true" />
          )}
        </span>
        <h2 className="mt-5 text-2xl font-black">
          {isReset
            ? locale === "ar"
              ? "تعيين كلمة مرور جديدة"
              : "Set a new password"
            : locale === "ar"
              ? "نسيت كلمة المرور؟"
              : "Forgot your password?"}
        </h2>
        {isReset ? (
          <form
            onSubmit={reset.handleSubmit((values) =>
              updatePassword.mutate(values),
            )}
            className="mt-5 grid gap-4"
          >
            <Field
              label={locale === "ar" ? "كلمة المرور الجديدة" : "New password"}
              error={reset.formState.errors.password?.message}
            >
              <span className="relative block">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="!pe-11"
                  {...reset.register("password")}
                />
                <PasswordVisibilityButton
                  locale={locale}
                  visible={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                />
              </span>
            </Field>
            <p className="text-xs leading-5 text-muted">
              {locale === "ar"
                ? "استخدم 12 حرفًا على الأقل، مع حرف إنجليزي كبير ورمز خاص."
                : "Use at least 12 characters, including an uppercase letter and a symbol."}
            </p>
            <Field
              label={locale === "ar" ? "تأكيد كلمة المرور" : "Confirm password"}
              error={reset.formState.errors.confirmPassword?.message}
            >
              <span className="relative block">
                <input
                  type={showConfirmation ? "text" : "password"}
                  autoComplete="new-password"
                  className="!pe-11"
                  {...reset.register("confirmPassword")}
                />
                <PasswordVisibilityButton
                  locale={locale}
                  visible={showConfirmation}
                  onClick={() => setShowConfirmation((value) => !value)}
                />
              </span>
            </Field>
            <button
              className="focus-ring rounded-xl bg-primary px-4 py-3 font-bold text-slate-950 disabled:opacity-60"
              disabled={updatePassword.isPending}
            >
              {updatePassword.isPending
                ? locale === "ar"
                  ? "جارٍ الحفظ…"
                  : "Saving…"
                : locale === "ar"
                  ? "حفظ كلمة المرور"
                  : "Save password"}
            </button>
            {updatePassword.isError && (
              <p role="alert" className="text-sm text-red-600">
                {updatePassword.error instanceof Error
                  ? updatePassword.error.message
                  : locale === "ar"
                    ? "تعذر تعيين كلمة المرور."
                    : "Password could not be reset."}
              </p>
            )}
          </form>
        ) : (
          <form
            onSubmit={forgot.handleSubmit((values) =>
              requestReset.mutate(values),
            )}
            className="mt-5 grid gap-4"
          >
            <Field
              label={locale === "ar" ? "البريد الإلكتروني" : "Email"}
              error={forgot.formState.errors.email?.message}
            >
              <input
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                {...forgot.register("email")}
              />
            </Field>
            <button
              className="focus-ring rounded-xl bg-primary px-4 py-3 font-bold text-slate-950 disabled:opacity-60"
              disabled={requestReset.isPending}
            >
              {requestReset.isPending
                ? locale === "ar"
                  ? "جارٍ الإرسال…"
                  : "Sending…"
                : locale === "ar"
                  ? "إرسال رابط الاستعادة"
                  : "Send reset link"}
            </button>
            {requestReset.isSuccess && (
              <p
                role="status"
                className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"
              >
                {locale === "ar"
                  ? "إذا كان الحساب مؤهلًا فسيصلك رابط الاستعادة."
                  : "If an eligible account exists, a reset link has been sent."}
              </p>
            )}
            {requestReset.isError && (
              <p role="alert" className="text-sm text-red-600">
                {requestReset.error instanceof Error
                  ? requestReset.error.message
                  : locale === "ar"
                    ? "تعذر إرسال الطلب."
                    : "The request could not be sent."}
              </p>
            )}
          </form>
        )}
        <Link
          href={`/${locale}/login`}
          className="focus-ring mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary"
        >
          <ArrowLeft
            size={16}
            aria-hidden="true"
            className={locale === "ar" ? "rotate-180" : ""}
          />
          {locale === "ar" ? "العودة إلى تسجيل الدخول" : "Back to sign in"}
        </Link>
      </div>
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      <span>{label}</span>
      <span className="[&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:bg-transparent [&_input]:px-3 [&_input]:py-2 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-border [&_select]:bg-transparent [&_select]:px-3 [&_select]:py-2">
        {children}
      </span>
      {error && (
        <span className="text-xs font-normal text-red-600">{error}</span>
      )}
    </label>
  );
}

function PasswordVisibilityButton({
  locale,
  visible,
  onClick,
}: {
  locale: string;
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="focus-ring absolute inset-y-0 end-0 grid w-10 place-items-center text-muted hover:text-primary"
      onClick={onClick}
      aria-label={
        locale === "ar"
          ? visible
            ? "إخفاء كلمة المرور"
            : "إظهار كلمة المرور"
          : visible
            ? "Hide password"
            : "Show password"
      }
      aria-pressed={visible}
    >
      {visible ? <Eye size={19} /> : <EyeOff size={19} />}
    </button>
  );
}
