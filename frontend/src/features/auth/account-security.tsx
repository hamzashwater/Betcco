"use client";

import { ApiError, api, invalidateCsrfToken } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound,
  Laptop,
  LogOut,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccountLayout, type AccountRole } from "./account-layout";

type TwoFactorStatus = {
  isEnabled: boolean;
  hasAuthenticator: boolean;
  isRequired: boolean;
  recoveryCodesLeft: number;
};

type RecoveryCodesResponse = {
  recoveryCodes: string[];
  recoveryCodesLeft: number;
};

type CurrentUser = { roles: string[]; requiresMfaEnrollment: boolean };

function workspaceFor(roles: string[]) {
  if (roles.includes("Admin") || roles.includes("SystemAdmin"))
    return "admin/dashboard";
  if (roles.includes("SupportAdmin")) return "support/accounts";
  if (roles.includes("FinanceAdmin")) return "admin/wallet";
  if (roles.includes("Teacher")) return "teacher/dashboard";
  if (roles.includes("Student")) return "student/dashboard";
  return "";
}

type TwoFactorSetup = {
  sharedKey: string;
  authenticatorUri: string;
};

type AccountSession = {
  id: string;
  deviceName: string;
  browserName: string;
  ipAddress?: string;
  loggedInAtUtc: string;
  lastActiveAtUtc: string;
  isCurrent: boolean;
};

type SessionsResponse = { items: AccountSession[] };

function errorMessage(error: unknown, locale: string) {
  if (error instanceof ApiError && error.code === "TWO_FACTOR_INVALID") {
    return locale === "ar"
      ? "رمز تطبيق المصادقة غير صحيح أو انتهت صلاحيته."
      : "The authenticator code is invalid or expired.";
  }
  return error instanceof Error
    ? error.message
    : locale === "ar"
      ? "تعذر إتمام الطلب. حاول مرة أخرى."
      : "The request could not be completed. Please try again.";
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AccountSecurity({ role }: { role: AccountRole }) {
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [codesAcknowledged, setCodesAcknowledged] = useState(false);
  const [returnWorkspace, setReturnWorkspace] = useState<string | null>(null);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryAuthenticatorCode, setRecoveryAuthenticatorCode] =
    useState("");
  const [resetRecoveryCode, setResetRecoveryCode] = useState("");
  const [recoveryAction, setRecoveryAction] = useState<
    "regenerate" | "reset" | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const currentUser = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api<CurrentUser>("/auth/me"),
    retry: false,
  });
  const mandatory = currentUser.data?.requiresMfaEnrollment === true;

  const twoFactor = useQuery({
    queryKey: ["account-security", "two-factor"],
    queryFn: () => api<TwoFactorStatus>("/auth/two-factor"),
  });
  const sessions = useQuery({
    queryKey: ["account-security", "sessions"],
    queryFn: () => api<SessionsResponse>("/auth/sessions"),
    enabled: !mandatory && role !== "staff",
  });
  const refreshSecurity = () => {
    void queryClient.invalidateQueries({
      queryKey: ["account-security"],
    });
  };
  const signedOut = () => {
    invalidateCsrfToken();
    queryClient.clear();
    router.replace(`/${locale}/login`);
    router.refresh();
  };
  const startSetup = useMutation({
    mutationFn: () =>
      api<TwoFactorSetup>("/auth/two-factor/setup", { method: "POST" }),
    onSuccess: (result) => {
      setSetup(result);
      setVerificationCode("");
      setNotice(null);
      refreshSecurity();
    },
  });
  const enableTwoFactor = useMutation({
    mutationFn: async () => {
      const result = await api<RecoveryCodesResponse>(
        "/auth/two-factor/enable",
        {
          method: "POST",
          body: JSON.stringify({ code: verificationCode }),
        },
      );
      setRecoveryCodes(result.recoveryCodes);
    },
    onSuccess: async () => {
      setSetup(null);
      setVerificationCode("");
      setCodesAcknowledged(false);
      setNotice(
        locale === "ar"
          ? "تم تفعيل المصادقة الثنائية لهذا الحساب."
          : "Two-factor authentication is now enabled for this account.",
      );
      refreshSecurity();
      const user = await queryClient.fetchQuery({
        queryKey: ["current-user"],
        queryFn: () => api<CurrentUser>("/auth/me"),
        staleTime: 0,
      });
      if (mandatory) setReturnWorkspace(workspaceFor(user.roles));
    },
  });
  const regenerateCodes = useMutation({
    mutationFn: async () => {
      const result = await api<RecoveryCodesResponse>(
        "/auth/two-factor/recovery-codes/regenerate",
        {
          method: "POST",
          body: JSON.stringify({
            currentPassword: recoveryPassword,
            code: recoveryAuthenticatorCode,
          }),
        },
      );
      setRecoveryCodes(result.recoveryCodes);
    },
    onSuccess: () => {
      setCodesAcknowledged(false);
      setRecoveryAction(null);
      setRecoveryPassword("");
      setRecoveryAuthenticatorCode("");
      refreshSecurity();
    },
    onError: () => {
      setRecoveryPassword("");
      setRecoveryAuthenticatorCode("");
    },
  });
  const resetAuthenticator = useMutation({
    mutationFn: () =>
      api<{ requiresMfaEnrollment: boolean }>(
        "/auth/two-factor/reset-authenticator",
        {
          method: "POST",
          body: JSON.stringify({
            currentPassword: recoveryPassword,
            recoveryCode: resetRecoveryCode,
          }),
        },
      ),
    onSuccess: async (result) => {
      setRecoveryPassword("");
      setResetRecoveryCode("");
      setRecoveryAction(null);
      setRecoveryCodes(null);
      await queryClient.invalidateQueries({ queryKey: ["current-user"] });
      refreshSecurity();
      if (result.requiresMfaEnrollment) {
        router.replace(`/${locale}/staff/security`);
        router.refresh();
      }
    },
    onError: () => {
      setRecoveryPassword("");
      setResetRecoveryCode("");
    },
  });
  const disableTwoFactor = useMutation({
    mutationFn: () =>
      api<void>("/auth/two-factor/disable", {
        method: "POST",
        body: JSON.stringify({ code: disableCode }),
      }),
    onSuccess: () => {
      setDisableCode("");
      setNotice(
        locale === "ar"
          ? "تم إيقاف المصادقة الثنائية."
          : "Two-factor authentication has been disabled.",
      );
      refreshSecurity();
    },
  });
  const revokeSession = useMutation({
    mutationFn: (sessionId: string) =>
      api<{ currentSessionRevoked: boolean }>(`/auth/sessions/${sessionId}`, {
        method: "DELETE",
      }),
    onSuccess: (result) => {
      if (result.currentSessionRevoked) {
        signedOut();
        return;
      }
      setNotice(
        locale === "ar"
          ? "تم تسجيل خروج الجهاز."
          : "The device was signed out.",
      );
      refreshSecurity();
    },
  });
  const logoutAll = useMutation({
    mutationFn: () =>
      api<void>("/auth/sessions/logout-all", { method: "POST" }),
    onSuccess: signedOut,
  });
  const logout = useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onSuccess: signedOut,
  });
  const logoutOthers = useMutation({
    mutationFn: () =>
      api<{ revokedCount: number }>("/auth/sessions/logout-others", {
        method: "POST",
      }),
    onSuccess: ({ revokedCount }) => {
      setNotice(
        locale === "ar"
          ? `تم إنهاء ${revokedCount} من الجلسات الأخرى.`
          : `${revokedCount} other sessions signed out.`,
      );
      refreshSecurity();
    },
  });
  const changePassword = useMutation({
    mutationFn: () =>
      api<void>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice(
        locale === "ar"
          ? "تم تغيير كلمة المرور وإنهاء الجلسات الأخرى."
          : "Password changed and other sessions signed out.",
      );
      refreshSecurity();
    },
  });
  const busy =
    startSetup.isPending ||
    enableTwoFactor.isPending ||
    regenerateCodes.isPending ||
    resetAuthenticator.isPending ||
    disableTwoFactor.isPending ||
    revokeSession.isPending ||
    logoutAll.isPending ||
    logoutOthers.isPending ||
    changePassword.isPending;

  return (
    <AccountLayout role={role} active="security">
      {mandatory && (
        <div
          className="card mt-6 grid gap-4 border border-primary/40 p-5 sm:p-6"
          role="status"
        >
          <p className="text-lg font-black">
            {locale === "ar"
              ? "المصادقة الثنائية إلزامية لهذا الحساب الإداري قبل متابعة استخدام صلاحيات الإدارة."
              : "Multi-factor authentication is required for this staff account before administrative access can continue."}
          </p>
          <p className="text-sm text-muted">
            {locale === "ar"
              ? "أعدّ تطبيق المصادقة أدناه ثم أكّد الرمز. يمكنك تسجيل الخروج في أي وقت."
              : "Set up an authenticator app below and verify its code. You can sign out at any time."}
          </p>
          <button
            type="button"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
            className="focus-ring inline-flex w-fit items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-bold disabled:opacity-60"
          >
            <LogOut size={16} aria-hidden="true" />
            {locale === "ar" ? "تسجيل الخروج" : "Sign out"}
          </button>
          {logout.isError && (
            <p role="alert" className="text-sm text-red-600">
              {errorMessage(logout.error, locale)}
            </p>
          )}
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="mt-5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
        >
          {notice}
        </p>
      )}

      {!mandatory && (
        <form
          className="card mt-6 grid min-w-0 gap-4 p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            setNotice(null);
            if (newPassword === confirmPassword) changePassword.mutate();
          }}
        >
          <h2 className="text-xl font-black">
            {locale === "ar" ? "تغيير كلمة المرور" : "Change password"}
          </h2>
          <p className="text-sm text-muted">
            {locale === "ar"
              ? "سيُطلب منك تسجيل الدخول من جديد على أجهزتك الأخرى."
              : "Your other devices will need to sign in again."}
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid min-w-0 gap-1 text-sm font-bold">
              <span>
                {locale === "ar" ? "كلمة المرور الحالية" : "Current password"}
              </span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="focus-ring w-full min-w-0 rounded-xl border border-border bg-transparent px-3 py-2"
              />
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-bold">
              <span>
                {locale === "ar" ? "كلمة المرور الجديدة" : "New password"}
              </span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="focus-ring w-full min-w-0 rounded-xl border border-border bg-transparent px-3 py-2"
              />
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-bold">
              <span>
                {locale === "ar" ? "تأكيد كلمة المرور" : "Confirm new password"}
              </span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="focus-ring w-full min-w-0 rounded-xl border border-border bg-transparent px-3 py-2"
              />
            </label>
          </div>
          {confirmPassword && newPassword !== confirmPassword && (
            <p role="alert" className="text-sm text-red-600">
              {locale === "ar"
                ? "كلمتا المرور غير متطابقتين."
                : "Passwords do not match."}
            </p>
          )}
          {changePassword.isError && (
            <p role="alert" className="text-sm text-red-600">
              {errorMessage(changePassword.error, locale)}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || newPassword !== confirmPassword}
            className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60"
          >
            {locale === "ar" ? "حفظ كلمة المرور" : "Save password"}
          </button>
        </form>
      )}

      <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="card min-w-0 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <ShieldCheck size={23} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-black text-foreground">
                {locale === "ar"
                  ? "المصادقة الثنائية"
                  : "Two-factor authentication"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {twoFactor.data?.isEnabled
                  ? locale === "ar"
                    ? "مفعّلة. ستحتاج رمزًا من تطبيق المصادقة بعد إدخال كلمة المرور."
                    : "Enabled. A code from your authenticator app is required after your password."
                  : mandatory
                    ? locale === "ar"
                      ? "أعدّ تطبيق المصادقة وأكّد الرمز للمتابعة."
                      : "Set up an authenticator app and verify the code to continue."
                    : locale === "ar"
                      ? "نوصي بها خصوصًا للمعلمين والأدمن."
                      : "We especially recommend this for teachers and administrators."}
              </p>
            </div>
          </div>

          {twoFactor.isPending ? (
            <p className="mt-5 text-sm text-muted">…</p>
          ) : twoFactor.isError ? (
            <p role="alert" className="mt-5 text-sm text-red-600">
              {errorMessage(twoFactor.error, locale)}
            </p>
          ) : null}

          {recoveryCodes && (
            <div
              className="mt-5 grid min-w-0 gap-3 rounded-xl border border-primary/50 p-4"
              role="region"
              aria-label={
                locale === "ar"
                  ? "رموز الاسترداد الجديدة"
                  : "New recovery codes"
              }
            >
              <h3 className="font-black">
                {locale === "ar"
                  ? "احفظ رموز الاسترداد الآن"
                  : "Save your recovery codes now"}
              </h3>
              <p className="text-sm text-muted">
                {locale === "ar"
                  ? "تظهر هذه الرموز الآن فقط. احفظها في مكان آمن غير متصل بالإنترنت. يمكن استخدام كل رمز مرة واحدة."
                  : "These codes are shown only now. Store them securely offline. Each code can be used once."}
              </p>
              <ul
                dir="ltr"
                className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2"
              >
                {recoveryCodes.map((code) => (
                  <li
                    key={code}
                    className="min-w-0 break-all rounded-lg border border-border p-2 font-mono text-sm"
                  >
                    {code}
                  </li>
                ))}
              </ul>
              <p className="text-sm font-bold">
                {locale === "ar"
                  ? `الرموز المتبقية: ${recoveryCodes.length}`
                  : `Codes remaining: ${recoveryCodes.length}`}
              </p>
              <button
                type="button"
                className="focus-ring w-fit rounded-lg border border-border px-3 py-2 text-sm font-bold"
                onClick={() =>
                  void navigator.clipboard.writeText(recoveryCodes.join("\n"))
                }
              >
                {locale === "ar" ? "نسخ الكل" : "Copy all"}
              </button>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={codesAcknowledged}
                  onChange={(event) =>
                    setCodesAcknowledged(event.target.checked)
                  }
                />
                {locale === "ar"
                  ? "حفظت الرموز في مكان آمن"
                  : "I saved these codes securely"}
              </label>
              <button
                type="button"
                disabled={!codesAcknowledged}
                className="focus-ring w-fit rounded-lg bg-primary px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-60"
                onClick={() => {
                  setRecoveryCodes(null);
                  if (returnWorkspace) {
                    router.replace(`/${locale}/${returnWorkspace}`);
                    router.refresh();
                  }
                }}
              >
                {locale === "ar" ? "متابعة" : "Continue"}
              </button>
            </div>
          )}

          {twoFactor.data?.isEnabled && !recoveryCodes && (
            <div className="mt-5 grid gap-3">
              <p className="text-sm font-bold">
                {locale === "ar"
                  ? `رموز الاسترداد المتبقية: ${twoFactor.data.recoveryCodesLeft}`
                  : `Recovery codes remaining: ${twoFactor.data.recoveryCodesLeft}`}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="focus-ring rounded-lg border border-border px-3 py-2 text-sm font-bold"
                  onClick={() => setRecoveryAction("regenerate")}
                >
                  {locale === "ar"
                    ? "إنشاء رموز استرداد جديدة"
                    : "Generate new recovery codes"}
                </button>
                <button
                  type="button"
                  className="focus-ring rounded-lg border border-border px-3 py-2 text-sm font-bold"
                  onClick={() => setRecoveryAction("reset")}
                >
                  {locale === "ar"
                    ? "فقدت تطبيق المصادقة؟"
                    : "Lost your authenticator?"}
                </button>
              </div>
              {recoveryAction && (
                <form
                  className="grid gap-3 rounded-xl border border-border p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (recoveryAction === "regenerate")
                      regenerateCodes.mutate();
                    else resetAuthenticator.mutate();
                  }}
                >
                  <h3 className="font-black">
                    {recoveryAction === "regenerate"
                      ? locale === "ar"
                        ? "إنشاء رموز جديدة"
                        : "Generate new codes"
                      : locale === "ar"
                        ? "إعادة إعداد تطبيق المصادقة"
                        : "Reset authenticator"}
                  </h3>
                  <p className="text-sm text-muted">
                    {recoveryAction === "regenerate"
                      ? locale === "ar"
                        ? "إنشاء رموز جديدة يبطل جميع الرموز القديمة."
                        : "Generating new codes invalidates all old codes."
                      : locale === "ar"
                        ? "ستحتاج كلمة مرورك ورمز استرداد غير مستخدم. ستعيد إعداد تطبيق المصادقة بعد ذلك."
                        : "Enter your password and an unused recovery code. You will set up a new authenticator afterward."}
                  </p>
                  <label className="grid gap-1 text-sm font-bold">
                    {locale === "ar"
                      ? "كلمة المرور الحالية"
                      : "Current password"}
                    <input
                      type="password"
                      autoComplete="current-password"
                      required
                      value={recoveryPassword}
                      onChange={(event) =>
                        setRecoveryPassword(event.target.value)
                      }
                      className="focus-ring min-w-0 rounded-lg border border-border bg-transparent px-3 py-2"
                    />
                  </label>
                  {recoveryAction === "regenerate" ? (
                    <label className="grid gap-1 text-sm font-bold">
                      {locale === "ar"
                        ? "رمز تطبيق المصادقة"
                        : "Authenticator code"}
                      <input
                        required
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={recoveryAuthenticatorCode}
                        onChange={(event) =>
                          setRecoveryAuthenticatorCode(
                            event.target.value.replace(/\D/g, ""),
                          )
                        }
                        className="focus-ring min-w-0 rounded-lg border border-border bg-transparent px-3 py-2"
                      />
                    </label>
                  ) : (
                    <label className="grid gap-1 text-sm font-bold">
                      {locale === "ar"
                        ? "رمز استرداد غير مستخدم"
                        : "Unused recovery code"}
                      <input
                        required
                        autoComplete="off"
                        value={resetRecoveryCode}
                        onChange={(event) =>
                          setResetRecoveryCode(event.target.value)
                        }
                        className="focus-ring min-w-0 rounded-lg border border-border bg-transparent px-3 py-2"
                      />
                    </label>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={busy}
                      className="focus-ring rounded-lg bg-primary px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-60"
                    >
                      {locale === "ar" ? "تأكيد" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      className="focus-ring rounded-lg border border-border px-4 py-2 text-sm"
                      onClick={() => {
                        setRecoveryAction(null);
                        setRecoveryPassword("");
                        setResetRecoveryCode("");
                        setRecoveryAuthenticatorCode("");
                      }}
                    >
                      {locale === "ar" ? "إلغاء" : "Cancel"}
                    </button>
                  </div>
                  {(regenerateCodes.isError || resetAuthenticator.isError) && (
                    <p role="alert" className="text-sm text-red-600">
                      {errorMessage(
                        regenerateCodes.error ?? resetAuthenticator.error,
                        locale,
                      )}
                    </p>
                  )}
                </form>
              )}
            </div>
          )}

          {twoFactor.data?.isEnabled &&
          !twoFactor.data.isRequired &&
          !recoveryCodes ? (
            <form
              className="mt-5 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  window.confirm(
                    locale === "ar"
                      ? "هل تريد إيقاف المصادقة الثنائية؟ سيقل مستوى حماية حسابك."
                      : "Disable two-factor authentication? This reduces account protection.",
                  )
                )
                  disableTwoFactor.mutate();
              }}
            >
              <label className="grid gap-1 text-sm font-bold">
                {locale === "ar"
                  ? "رمز تطبيق المصادقة للتأكيد"
                  : "Authenticator code to confirm"}
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={disableCode}
                  onChange={(event) =>
                    setDisableCode(event.target.value.replace(/\D/g, ""))
                  }
                  className="rounded-lg border border-border bg-transparent px-3 py-2 text-start font-mono tracking-[0.25em]"
                />
              </label>
              <button
                disabled={busy}
                className="focus-ring rounded-xl border border-red-500/45 px-4 py-3 text-sm font-black text-red-600 hover:bg-red-500/10 disabled:opacity-60"
              >
                {locale === "ar"
                  ? "إيقاف المصادقة الثنائية"
                  : "Disable two-factor authentication"}
              </button>
              {disableTwoFactor.isError && (
                <p role="alert" className="text-sm text-red-600">
                  {errorMessage(disableTwoFactor.error, locale)}
                </p>
              )}
            </form>
          ) : twoFactor.data?.isEnabled ? null : !setup ? (
            <div className="mt-5">
              <button
                type="button"
                disabled={busy}
                onClick={() => startSetup.mutate()}
                className="focus-ring inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-60"
              >
                <KeyRound size={17} aria-hidden="true" />
                {locale === "ar"
                  ? "إعداد تطبيق المصادقة"
                  : "Set up an authenticator app"}
              </button>
              {startSetup.isError && (
                <p role="alert" className="mt-3 text-sm text-red-600">
                  {errorMessage(startSetup.error, locale)}
                </p>
              )}
            </div>
          ) : (
            <form
              className="mt-5 grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                enableTwoFactor.mutate();
              }}
            >
              <ol className="grid list-decimal gap-2 ps-5 text-sm leading-6 text-muted">
                <li>
                  {locale === "ar"
                    ? "افتح Google Authenticator أو Microsoft Authenticator أو أي تطبيق TOTP موثوق."
                    : "Open Google Authenticator, Microsoft Authenticator, or another trusted TOTP app."}
                </li>
                <li>
                  {locale === "ar"
                    ? "أضف حسابًا يدويًا والصق المفتاح التالي. لا تشاركه مع أي شخص."
                    : "Add an account manually and enter the key below. Never share it."}
                </li>
              </ol>
              <code
                dir="ltr"
                className="overflow-x-auto rounded-xl border border-primary/35 bg-primary/10 px-4 py-3 text-center font-mono text-sm font-black tracking-[0.12em] text-foreground"
              >
                {setup.sharedKey}
              </code>
              <a
                href={setup.authenticatorUri}
                className="focus-ring text-sm font-bold text-primary underline underline-offset-4"
              >
                {locale === "ar"
                  ? "فتح تطبيق المصادقة بهذا الحساب"
                  : "Open this account in your authenticator app"}
              </a>
              <label className="grid gap-1 text-sm font-bold">
                {locale === "ar"
                  ? "أدخل الرمز المكوّن من 6 أرقام"
                  : "Enter the 6-digit code"}
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(event) =>
                    setVerificationCode(event.target.value.replace(/\D/g, ""))
                  }
                  className="rounded-lg border border-border bg-transparent px-3 py-2 text-start font-mono tracking-[0.25em]"
                />
              </label>
              <button
                disabled={busy || verificationCode.length !== 6}
                className="focus-ring rounded-xl bg-primary px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-60"
              >
                {locale === "ar" ? "تأكيد التفعيل" : "Confirm and enable"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setSetup(null)}
                className="focus-ring text-sm font-bold text-muted hover:text-foreground"
              >
                {locale === "ar" ? "إلغاء" : "Cancel"}
              </button>
              {enableTwoFactor.isError && (
                <p role="alert" className="text-sm text-red-600">
                  {errorMessage(enableTwoFactor.error, locale)}
                </p>
              )}
            </form>
          )}
        </section>

        {!mandatory && (
          <section className="card min-w-0 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary/15 text-secondary">
                  <Laptop size={23} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-xl font-black text-foreground">
                    {locale === "ar" ? "الجلسات النشطة" : "Active sessions"}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {locale === "ar"
                      ? "يمكنك إنهاء أي جهاز لا تعرفه فورًا."
                      : "End any device you do not recognise immediately."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={
                    busy ||
                    !sessions.data?.items.some((session) => !session.isCurrent)
                  }
                  onClick={() => {
                    if (
                      window.confirm(
                        locale === "ar"
                          ? "إنهاء جميع الجلسات الأخرى مع إبقاء هذا الجهاز متصلاً؟"
                          : "Sign out all other devices and keep this device signed in?",
                      )
                    )
                      logoutOthers.mutate();
                  }}
                  className="focus-ring shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-black disabled:opacity-60"
                >
                  {locale === "ar"
                    ? "إنهاء الأجهزة الأخرى"
                    : "Sign out other devices"}
                </button>
                <button
                  type="button"
                  disabled={busy || !sessions.data?.items.length}
                  onClick={() => {
                    if (
                      window.confirm(
                        locale === "ar"
                          ? "سيتم تسجيل خروجك من جميع الأجهزة، بما فيها هذا الجهاز. هل تريد المتابعة؟"
                          : "You will be signed out from every device, including this one. Continue?",
                      )
                    )
                      logoutAll.mutate();
                  }}
                  className="focus-ring shrink-0 rounded-lg border border-red-500/45 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-500/10 disabled:opacity-60"
                >
                  {locale === "ar" ? "إنهاء الكل" : "Sign out all"}
                </button>
              </div>
            </div>
            <div className="mt-5 grid gap-3">
              {sessions.isPending ? (
                <p className="text-sm text-muted">…</p>
              ) : sessions.isError ? (
                <p role="alert" className="text-sm text-red-600">
                  {errorMessage(sessions.error, locale)}
                </p>
              ) : sessions.data?.items.length ? (
                sessions.data.items.map((session) => (
                  <article
                    key={session.id}
                    className="rounded-xl border border-border bg-white/5 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <Smartphone
                          className="mt-0.5 shrink-0 text-primary"
                          size={19}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="font-black text-foreground">
                            {session.deviceName}
                            {session.isCurrent && (
                              <span className="ms-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                                {locale === "ar" ? "هذا الجهاز" : "This device"}
                              </span>
                            )}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {session.browserName}
                            {session.ipAddress ? ` · ${session.ipAddress}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {locale === "ar" ? "آخر نشاط: " : "Last active: "}
                            {formatDate(session.lastActiveAtUtc, locale)}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {locale === "ar" ? "تسجيل الدخول: " : "Signed in: "}
                            {formatDate(session.loggedInAtUtc, locale)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              session.isCurrent
                                ? locale === "ar"
                                  ? "سيتم تسجيل خروجك من هذا الجهاز. هل تريد المتابعة؟"
                                  : "You will be signed out on this device. Continue?"
                                : locale === "ar"
                                  ? "هل تريد إنهاء هذه الجلسة؟"
                                  : "End this session?",
                            )
                          )
                            revokeSession.mutate(session.id);
                        }}
                        className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-black text-red-600 hover:bg-red-500/10 disabled:opacity-60"
                      >
                        <LogOut size={15} aria-hidden="true" />
                        {locale === "ar" ? "إنهاء" : "Sign out"}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted">
                  {locale === "ar"
                    ? "ستظهر هنا الأجهزة عند تسجيل الدخول التالي."
                    : "Devices will appear here after the next sign-in."}
                </p>
              )}
            </div>
            {revokeSession.isError && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {errorMessage(revokeSession.error, locale)}
              </p>
            )}
            {logoutAll.isError && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {errorMessage(logoutAll.error, locale)}
              </p>
            )}
            {logoutOthers.isError && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {errorMessage(logoutOthers.error, locale)}
              </p>
            )}
          </section>
        )}
      </div>
    </AccountLayout>
  );
}
