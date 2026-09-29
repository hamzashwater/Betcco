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
  { code: "JO", dialCode: "+962" },
  { code: "PS", dialCode: "+970" },
  { code: "SA", dialCode: "+966" },
  { code: "AE", dialCode: "+971" },
  { code: "QA", dialCode: "+974" },
  { code: "KW", dialCode: "+965" },
  { code: "BH", dialCode: "+973" },
  { code: "OM", dialCode: "+968" },
  { code: "EG", dialCode: "+20" },
  { code: "IQ", dialCode: "+964" },
  { code: "LB", dialCode: "+961" },
  { code: "SY", dialCode: "+963" },
  { code: "TR", dialCode: "+90" },
  { code: "GB", dialCode: "+44" },
  { code: "US", dialCode: "+1" },
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

type RegisterValidationMessages = ReturnType<
  typeof useTranslations<"auth.registerForm.validation">
>;
const createRegisterSchema = (t: RegisterValidationMessages) =>
  z
    .object({
      firstName: z.string().trim().min(2, t("firstNameMin")),
      lastName: z.string().trim().min(2, t("lastNameMin")),
      email: z.string().trim().email(t("emailInvalid")),
      countryCode: z.string().length(2, t("countryInvalid")),
      phone: z.string().trim().min(7, t("phoneMin")).max(40, t("phoneMax")),
      gender: z.enum(["Male", "Female", "PreferNotToSay"], {
        error: t("genderInvalid"),
      }),
      dateOfBirth: z
        .string()
        .min(1, t("dateRequired"))
        .refine(isAtLeast18, t("adultRequired")),
      password: z
        .string()
        .min(12, t("passwordMin"))
        .regex(/[A-Z]/, t("passwordUppercase"))
        .regex(/[^A-Za-z0-9]/, t("passwordSymbol")),
      confirmPassword: z.string(),
      termsAccepted: z.boolean().refine((value) => value, t("termsRequired")),
      marketingConsent: z.boolean(),
    })
    .refine((value) => value.password === value.confirmPassword, {
      path: ["confirmPassword"],
      message: t("passwordsMatch"),
    });
type RegisterValues = z.infer<ReturnType<typeof createRegisterSchema>>;
type LoginValidationMessages = ReturnType<
  typeof useTranslations<"auth.loginForm.validation">
>;
const createLoginSchema = (t: LoginValidationMessages) =>
  z.object({
    email: z.string().trim().email(t("emailInvalid")),
    password: z.string().min(1, t("passwordRequired")),
    rememberMe: z.boolean(),
    twoFactorCode: z.string().trim().optional(),
    twoFactorRecoveryCode: z.string().trim().optional(),
  });
type LoginValues = z.infer<ReturnType<typeof createLoginSchema>>;
type ResetValidationMessages = ReturnType<
  typeof useTranslations<"auth.resetPassword.validation">
>;
const createForgotPasswordSchema = (t: ResetValidationMessages) =>
  z.object({ email: z.string().trim().email(t("emailInvalid")) });
const createResetPasswordSchema = (t: ResetValidationMessages) =>
  z
    .object({
      password: z
        .string()
        .min(12, t("passwordMin"))
        .regex(/[A-Z]/, t("passwordUppercase"))
        .regex(/[^A-Za-z0-9]/, t("passwordSymbol")),
      confirmPassword: z.string(),
    })
    .refine((value) => value.password === value.confirmPassword, {
      path: ["confirmPassword"],
      message: t("passwordsMatch"),
    });
type ForgotPasswordValues = z.infer<
  ReturnType<typeof createForgotPasswordSchema>
>;
type ResetPasswordValues = z.infer<
  ReturnType<typeof createResetPasswordSchema>
>;
type LegalDocumentSummary = {
  slug: string;
  version: string;
  title: string;
  effectiveAtUtc: string;
};

type AuthErrorMessages = ReturnType<typeof useTranslations<"auth.errors">>;
function authErrorMessage(error: unknown, t: AuthErrorMessages) {
  if (
    error instanceof ApiError &&
    error.code === "EMAIL_CONFIRMATION_INVALID"
  ) {
    return t("emailConfirmationInvalid");
  }
  if (error instanceof ApiError && error.code === "DEVICE_LIMIT") {
    return t("deviceLimit");
  }
  if (error instanceof ApiError && error.code === "TWO_FACTOR_REQUIRED") {
    return t("twoFactorRequired");
  }
  if (error instanceof ApiError && error.code === "TWO_FACTOR_INVALID") {
    return t("twoFactorInvalid");
  }
  if (
    error instanceof ApiError &&
    error.code === "TWO_FACTOR_RECOVERY_CODE_INVALID"
  ) {
    return t("twoFactorRecoveryCodeInvalid");
  }
  if (error instanceof ApiError && error.code === "PASSWORD_CHANGE_REQUIRED") {
    return t("passwordChangeRequired");
  }
  return error instanceof Error ? error.message : t("requestFailed");
}

export function AuthPageLayout({
  children,
  showGalaxy = false,
}: {
  children: React.ReactNode;
  showGalaxy?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("auth.page");
  const logoTilt = useRef<HTMLDivElement>(null);
  const [messageIndex, setMessageIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(true);
  const messages = t.raw("motivation") as string[];

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
              {t("journeyLabel")}
            </p>
            <h2 className="mt-3 max-w-sm text-2xl font-black leading-snug text-foreground sm:text-3xl">
              {t("journeyTitle")}
            </h2>
            <div
              key={messageIndex}
              className="auth-motivation-card mt-auto w-full max-w-md text-start"
              aria-live="off"
            >
              <p className="text-xs font-black tracking-[0.14em] text-primary">
                {t("noteLabel")}
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
  const t = useTranslations("auth.registerForm");
  const validation = useTranslations("auth.registerForm.validation");
  const errors = useTranslations("auth.errors");
  const form = useForm<RegisterValues>({
    resolver: zodResolver(createRegisterSchema(validation)),
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
              {t("join")}
            </p>
            <h1 className="mt-1 text-3xl font-black">{t("title")}</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              {t("description")}
            </p>
          </div>
        </div>
      </header>
      <section aria-label={t("accountType")}>
        <p className="text-sm font-bold text-muted">{t("userType")}</p>
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-primary/45 bg-primary/10 p-3 text-primary">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-slate-950">
            <UserRound size={18} aria-hidden="true" />
          </span>
          <span className="font-black">{t("studentAccount")}</span>
          <span className="ms-auto text-xs font-semibold text-muted">
            {t("teacherInvitation")}
          </span>
        </div>
      </section>
      <fieldset className="grid gap-4">
        <legend className="text-sm font-bold text-muted">{t("details")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("firstName")}
            error={form.formState.errors.firstName?.message}
          >
            <input autoComplete="given-name" {...form.register("firstName")} />
          </Field>
          <Field
            label={t("lastName")}
            error={form.formState.errors.lastName?.message}
          >
            <input autoComplete="family-name" {...form.register("lastName")} />
          </Field>
        </div>
      </fieldset>
      <Field label={t("email")} error={form.formState.errors.email?.message}>
        <input type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <fieldset className="grid gap-4 border-t border-border pt-5">
        <legend className="text-sm font-bold text-muted">
          {t("contactProfile")}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("country")}
            error={form.formState.errors.countryCode?.message}
          >
            <select autoComplete="country" {...form.register("countryCode")}>
              {registrationCountries.map((country) => (
                <option key={country.code} value={country.code}>
                  {t(`countryNames.${country.code}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={t("phone")}
            error={form.formState.errors.phone?.message}
          >
            <span className="relative block">
              <input
                type="tel"
                autoComplete="tel"
                className="!ps-16"
                placeholder={t("phonePlaceholder")}
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
            label={t("gender")}
            error={form.formState.errors.gender?.message}
          >
            <select autoComplete="sex" {...form.register("gender")}>
              <option value="Male">{t("male")}</option>
              <option value="Female">{t("female")}</option>
              <option value="PreferNotToSay">{t("preferNotToSay")}</option>
            </select>
          </Field>
          <Field
            label={t("dateOfBirth")}
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
        <p className="text-xs leading-5 text-muted">{t("adultEligibility")}</p>
      </fieldset>
      <fieldset className="grid gap-4 border-t border-border pt-5">
        <legend className="flex items-center gap-2 text-sm font-bold text-muted">
          <ShieldCheck size={16} className="text-primary" aria-hidden="true" />
          {t("secureAccount")}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("password")}
            error={form.formState.errors.password?.message}
          >
            <span className="relative block">
              <input
                type={showPassword ? "text" : "password"}
                className="!pe-11"
                aria-label={t("password")}
                {...form.register("password")}
              />
              <PasswordVisibilityButton
                visible={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              />
            </span>
          </Field>
          <Field
            label={t("confirmPassword")}
            error={form.formState.errors.confirmPassword?.message}
          >
            <span className="relative block">
              <input
                type={showConfirmation ? "text" : "password"}
                className="!pe-11"
                {...form.register("confirmPassword")}
              />
              <PasswordVisibilityButton
                visible={showConfirmation}
                onClick={() => setShowConfirmation((value) => !value)}
              />
            </span>
          </Field>
        </div>
        <p className="text-xs leading-5 text-muted">
          {t("passwordRequirements")}
        </p>
      </fieldset>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" {...form.register("termsAccepted")} />
        <span>
          {t("termsPrefix")}
          <Link
            className="font-bold text-primary underline"
            href={`/${locale}/terms`}
            target="_blank"
            rel="noreferrer"
          >
            {t("termsVersion", { version: terms?.version ?? "…" })}
          </Link>
          {t("privacyJoin")}
          <Link
            className="font-bold text-primary underline"
            href={`/${locale}/privacy`}
            target="_blank"
            rel="noreferrer"
          >
            {t("privacyVersion", { version: privacy?.version ?? "…" })}
          </Link>
          {t("legalEnd")}
        </span>
      </label>
      {form.formState.errors.termsAccepted && (
        <p className="text-xs text-red-600">
          {form.formState.errors.termsAccepted.message}
        </p>
      )}
      <label className="flex gap-2 text-sm text-muted">
        <input type="checkbox" {...form.register("marketingConsent")} />
        <span>{t("marketingConsent")}</span>
      </label>
      <button
        disabled={request.isPending || legal.isPending || !terms || !privacy}
        className="focus-ring rounded-xl bg-primary px-4 py-3 font-bold text-white disabled:opacity-60"
      >
        {request.isPending ? "…" : t("createAccount")}
      </button>
      <p className="text-center text-sm text-muted">
        {t("alreadyHaveAccount")}
        <Link
          className="font-bold text-primary hover:underline"
          href={`/${locale}/login`}
        >
          {t("signIn")}
        </Link>
      </p>
      {request.isSuccess && (
        <p role="status" className="text-sm text-emerald-700">
          {t("created")}
        </p>
      )}
      {request.isError && (
        <p role="alert" className="text-sm text-red-600">
          {authErrorMessage(request.error, errors)}
        </p>
      )}
      {legal.isError && (
        <p role="alert" className="text-sm text-red-600">
          {t("legalLoadFailed")}
        </p>
      )}
    </form>
  );
}

export function LoginForm() {
  const locale = useLocale();
  const t = useTranslations("auth.loginForm");
  const validation = useTranslations("auth.loginForm.validation");
  const errors = useTranslations("auth.errors");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<
    "authenticator" | "recovery"
  >("authenticator");
  const form = useForm<LoginValues>({
    resolver: zodResolver(createLoginSchema(validation)),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
      twoFactorCode: "",
      twoFactorRecoveryCode: "",
    },
  });
  const request = useMutation({
    mutationFn: () => {
      const values = form.getValues();
      form.setValue("twoFactorRecoveryCode", "");
      return api<{
        user: {
          displayName: string;
          roles: string[];
          requiresMfaEnrollment: boolean;
        };
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          twoFactorCode:
            twoFactorMethod === "authenticator"
              ? values.twoFactorCode || null
              : null,
          twoFactorRecoveryCode:
            twoFactorMethod === "recovery"
              ? values.twoFactorRecoveryCode || null
              : null,
        }),
      });
    },
    onSuccess: (result) => {
      form.setValue("twoFactorRecoveryCode", "");
      invalidateCsrfToken();
      queryClient.setQueryData(["current-user"], result.user);
      void queryClient.invalidateQueries({ queryKey: ["current-user"] });
      if (result.user.requiresMfaEnrollment) {
        router.replace(`/${locale}/staff/security`);
        router.refresh();
        return;
      }
      const destination =
        result.user.roles.includes("Admin") ||
        result.user.roles.includes("SystemAdmin")
          ? "admin/dashboard"
          : result.user.roles.includes("CourseReviewer")
            ? "admin/evaluations"
            : result.user.roles.includes("SupportAdmin")
              ? "support/accounts"
              : result.user.roles.includes("FinanceAdmin")
                ? "admin/wallet"
                : result.user.roles.includes("Teacher")
                  ? "teacher/dashboard"
                  : "student/dashboard";
      router.replace(`/${locale}/${destination}`);
      router.refresh();
    },
    onError: (error) => {
      form.setValue("twoFactorRecoveryCode", "");
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
          error.code === "TWO_FACTOR_INVALID" ||
          error.code === "TWO_FACTOR_RECOVERY_CODE_INVALID")
      ) {
        setRequiresTwoFactor(true);
        window.setTimeout(
          () =>
            form.setFocus(
              twoFactorMethod === "recovery"
                ? "twoFactorRecoveryCode"
                : "twoFactorCode",
            ),
          0,
        );
      }
    },
  });
  return (
    <form
      onSubmit={form.handleSubmit(() => request.mutate())}
      className="card mx-auto grid max-w-md gap-4 p-6"
    >
      <h1 className="text-3xl font-black">{t("title")}</h1>
      <Field label={t("email")} error={form.formState.errors.email?.message}>
        <input type="email" {...form.register("email")} />
      </Field>
      <Field
        label={t("password")}
        error={form.formState.errors.password?.message}
      >
        <span className="relative block">
          <input
            type={showPassword ? "text" : "password"}
            className="!pe-11"
            {...form.register("password")}
          />
          <PasswordVisibilityButton
            visible={showPassword}
            onClick={() => setShowPassword((value) => !value)}
          />
        </span>
      </Field>
      {requiresTwoFactor && (
        <div className="grid gap-3">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t("verificationMethod")}
          >
            <button
              type="button"
              aria-pressed={twoFactorMethod === "authenticator"}
              onClick={() => {
                setTwoFactorMethod("authenticator");
                form.setValue("twoFactorRecoveryCode", "");
              }}
              className="focus-ring rounded-lg border border-border px-3 py-2 text-sm font-bold aria-pressed:bg-primary/20"
            >
              {t("authenticatorCode")}
            </button>
            <button
              type="button"
              aria-pressed={twoFactorMethod === "recovery"}
              onClick={() => {
                setTwoFactorMethod("recovery");
                form.setValue("twoFactorCode", "");
              }}
              className="focus-ring rounded-lg border border-border px-3 py-2 text-sm font-bold aria-pressed:bg-primary/20"
            >
              {t("useRecoveryCode")}
            </button>
          </div>
          {twoFactorMethod === "authenticator" ? (
            <Field
              label={t("authenticatorCodeDigits")}
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
          ) : (
            <Field
              label={t("recoveryCode")}
              error={form.formState.errors.twoFactorRecoveryCode?.message}
            >
              <input
                autoComplete="off"
                className="min-w-0 font-mono"
                {...form.register("twoFactorRecoveryCode")}
              />
            </Field>
          )}
          {twoFactorMethod === "recovery" && (
            <p className="text-sm text-muted">{t("recoveryCodeUseOnce")}</p>
          )}
        </div>
      )}
      <label className="flex gap-2 text-sm">
        <input type="checkbox" {...form.register("rememberMe")} />
        {t("rememberMe")}
      </label>
      <button
        disabled={request.isPending}
        className="focus-ring rounded-xl bg-primary px-4 py-3 font-bold text-white disabled:opacity-60"
      >
        {request.isPending ? "…" : t("submit")}
      </button>
      {request.isError && (
        <p role="alert" className="text-sm text-red-600">
          {authErrorMessage(request.error, errors)}
        </p>
      )}
      <Link
        className="text-sm font-semibold text-primary"
        href={`/${locale}/register`}
      >
        {t("createStudentAccount")}
      </Link>
      <Link
        className="text-sm font-semibold text-primary"
        href={`/${locale}/reset-password`}
      >
        {t("forgotPassword")}
      </Link>
      <div className="rounded-xl border border-border bg-white/5 p-4 text-sm leading-6 text-muted">
        <p>{t("guestIntro")}</p>
        <p className="mt-1">{t("guestAccountRequirement")}</p>
        <Link
          className="focus-ring mt-3 inline-flex font-bold text-primary"
          href={`/${locale}`}
        >
          {t("continueAsGuest")}
        </Link>
      </div>
    </form>
  );
}

export function EmailConfirmationForm() {
  const locale = useLocale();
  const t = useTranslations("auth.emailConfirmation");
  const errors = useTranslations("auth.errors");
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
              {authErrorMessage(confirmation.error, errors)}
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function ResetPasswordForm() {
  const locale = useLocale();
  const t = useTranslations("auth.resetPassword");
  const validation = useTranslations("auth.resetPassword.validation");
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const token = searchParams.get("token");
  const isReset = Boolean(userId && token);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const forgot = useForm<ForgotPasswordValues>({
    resolver: zodResolver(createForgotPasswordSchema(validation)),
    defaultValues: { email: "" },
  });
  const reset = useForm<ResetPasswordValues>({
    resolver: zodResolver(createResetPasswordSchema(validation)),
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
          {t("accountLabel")}
        </p>
        <h1 className="mt-5 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
          {isReset ? t("createTitle") : t("recoverTitle")}
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-slate-200">
          {isReset ? t("createDescription") : t("recoverDescription")}
        </p>
        <div className="mt-9 grid gap-3 text-sm sm:grid-cols-2">
          <p className="rounded-xl border border-white/10 p-4">
            <ShieldCheck
              size={20}
              className="mb-3 text-[#79dfd0]"
              aria-hidden="true"
            />
            {t("secureLink")}
          </p>
          <p className="rounded-xl border border-white/10 p-4">
            <KeyRound
              size={20}
              className="mb-3 text-[#79dfd0]"
              aria-hidden="true"
            />
            {t("newPasswordFeature")}
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
          {isReset ? t("setTitle") : t("forgotTitle")}
        </h2>
        {isReset ? (
          <form
            onSubmit={reset.handleSubmit((values) =>
              updatePassword.mutate(values),
            )}
            className="mt-5 grid gap-4"
          >
            <Field
              label={t("newPassword")}
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
                  visible={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                />
              </span>
            </Field>
            <p className="text-xs leading-5 text-muted">
              {t("passwordRequirements")}
            </p>
            <Field
              label={t("confirmPassword")}
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
                  visible={showConfirmation}
                  onClick={() => setShowConfirmation((value) => !value)}
                />
              </span>
            </Field>
            <button
              className="focus-ring rounded-xl bg-primary px-4 py-3 font-bold text-slate-950 disabled:opacity-60"
              disabled={updatePassword.isPending}
            >
              {updatePassword.isPending ? t("saving") : t("savePassword")}
            </button>
            {updatePassword.isError && (
              <p role="alert" className="text-sm text-red-600">
                {updatePassword.error instanceof Error
                  ? updatePassword.error.message
                  : t("resetFailed")}
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
              label={t("email")}
              error={forgot.formState.errors.email?.message}
            >
              <input
                type="email"
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
                {...forgot.register("email")}
              />
            </Field>
            <button
              className="focus-ring rounded-xl bg-primary px-4 py-3 font-bold text-slate-950 disabled:opacity-60"
              disabled={requestReset.isPending}
            >
              {requestReset.isPending ? t("sending") : t("sendResetLink")}
            </button>
            {requestReset.isSuccess && (
              <p
                role="status"
                className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"
              >
                {t("resetSent")}
              </p>
            )}
            {requestReset.isError && (
              <p role="alert" className="text-sm text-red-600">
                {requestReset.error instanceof Error
                  ? requestReset.error.message
                  : t("sendFailed")}
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
          {t("backToSignIn")}
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
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("auth.passwordVisibility");
  return (
    <button
      type="button"
      className="focus-ring absolute inset-y-0 end-0 grid w-10 place-items-center text-muted hover:text-primary"
      onClick={onClick}
      aria-label={visible ? t("hide") : t("show")}
      aria-pressed={visible}
    >
      {visible ? <Eye size={19} /> : <EyeOff size={19} />}
    </button>
  );
}
