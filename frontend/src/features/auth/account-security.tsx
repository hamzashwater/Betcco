"use client";

import { formatLocalizedDateTime } from "@/i18n/date-time";
import { ApiError, api, invalidateCsrfToken } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound,
  Laptop,
  LogOut,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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

type AccountSecurityTranslations = ReturnType<
  typeof useTranslations<"auth.accountSecurity">
>;

function errorMessage(error: unknown, t: AccountSecurityTranslations) {
  if (error instanceof ApiError && error.code === "TWO_FACTOR_INVALID") {
    return t("errors.twoFactorInvalid");
  }
  return error instanceof Error ? error.message : t("errors.requestFailed");
}

function formatDate(value: string, locale: string) {
  return formatLocalizedDateTime(value, locale);
}

export function AccountSecurity({ role }: { role: AccountRole }) {
  const locale = useLocale();
  const t = useTranslations("auth.accountSecurity");
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
      setNotice(t("messages.twoFactorEnabled"));
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
      setNotice(t("messages.twoFactorDisabled"));
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
      setNotice(t("messages.deviceSignedOut"));
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
      setNotice(t("messages.otherSessionsSignedOut", { count: revokedCount }));
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
      setNotice(t("messages.passwordChanged"));
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
          <p className="text-lg font-black">{t("staffRequiredTitle")}</p>
          <p className="text-sm text-muted">{t("staffRequiredDescription")}</p>
          <button
            type="button"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
            className="focus-ring inline-flex w-fit items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-bold disabled:opacity-60"
          >
            <LogOut size={16} aria-hidden="true" />
            {t("signOut")}
          </button>
          {logout.isError && (
            <p role="alert" className="text-sm text-red-600">
              {errorMessage(logout.error, t)}
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
          <h2 className="text-xl font-black">{t("password.title")}</h2>
          <p className="text-sm text-muted">{t("password.description")}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid min-w-0 gap-1 text-sm font-bold">
              <span>{t("password.current")}</span>
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
              <span>{t("password.new")}</span>
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
              <span>{t("password.confirm")}</span>
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
              {t("password.mismatch")}
            </p>
          )}
          {changePassword.isError && (
            <p role="alert" className="text-sm text-red-600">
              {errorMessage(changePassword.error, t)}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || newPassword !== confirmPassword}
            className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60"
          >
            {t("password.save")}
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
                {t("mfa.title")}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {twoFactor.data?.isEnabled
                  ? t("mfa.enabledDescription")
                  : mandatory
                    ? t("mfa.requiredDescription")
                    : t("mfa.recommendedDescription")}
              </p>
            </div>
          </div>

          {twoFactor.isPending ? (
            <p className="mt-5 text-sm text-muted">…</p>
          ) : twoFactor.isError ? (
            <p role="alert" className="mt-5 text-sm text-red-600">
              {errorMessage(twoFactor.error, t)}
            </p>
          ) : null}

          {recoveryCodes && (
            <div
              className="mt-5 grid min-w-0 gap-3 rounded-xl border border-primary/50 p-4"
              role="region"
              aria-label={t("mfa.recoveryRegion")}
            >
              <h3 className="font-black">{t("mfa.recoveryTitle")}</h3>
              <p className="text-sm text-muted">
                {t("mfa.recoveryDescription")}
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
                {t("mfa.remainingCodes", { count: recoveryCodes.length })}
              </p>
              <button
                type="button"
                className="focus-ring w-fit rounded-lg border border-border px-3 py-2 text-sm font-bold"
                onClick={() =>
                  void navigator.clipboard.writeText(recoveryCodes.join("\n"))
                }
              >
                {t("mfa.copyAll")}
              </button>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={codesAcknowledged}
                  onChange={(event) =>
                    setCodesAcknowledged(event.target.checked)
                  }
                />
                {t("mfa.savedSecurely")}
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
                {t("mfa.continue")}
              </button>
            </div>
          )}

          {twoFactor.data?.isEnabled && !recoveryCodes && (
            <div className="mt-5 grid gap-3">
              <p className="text-sm font-bold">
                {t("mfa.codesLeft", {
                  count: twoFactor.data.recoveryCodesLeft,
                })}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="focus-ring rounded-lg border border-border px-3 py-2 text-sm font-bold"
                  onClick={() => setRecoveryAction("regenerate")}
                >
                  {t("mfa.generateCodes")}
                </button>
                <button
                  type="button"
                  className="focus-ring rounded-lg border border-border px-3 py-2 text-sm font-bold"
                  onClick={() => setRecoveryAction("reset")}
                >
                  {t("mfa.lostAuthenticator")}
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
                      ? t("mfa.generateNewCodes")
                      : t("mfa.resetAuthenticator")}
                  </h3>
                  <p className="text-sm text-muted">
                    {recoveryAction === "regenerate"
                      ? t("mfa.generateCodesWarning")
                      : t("mfa.resetAuthenticatorDescription")}
                  </p>
                  <label className="grid gap-1 text-sm font-bold">
                    {t("password.current")}
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
                      {t("mfa.authenticatorCode")}
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
                      {t("mfa.unusedRecoveryCode")}
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
                      {t("mfa.confirm")}
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
                      {t("mfa.cancel")}
                    </button>
                  </div>
                  {(regenerateCodes.isError || resetAuthenticator.isError) && (
                    <p role="alert" className="text-sm text-red-600">
                      {errorMessage(
                        regenerateCodes.error ?? resetAuthenticator.error,
                        t,
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
                if (window.confirm(t("mfa.disableWarning")))
                  disableTwoFactor.mutate();
              }}
            >
              <label className="grid gap-1 text-sm font-bold">
                {t("mfa.authenticatorCodeConfirm")}
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
                {t("mfa.disable")}
              </button>
              {disableTwoFactor.isError && (
                <p role="alert" className="text-sm text-red-600">
                  {errorMessage(disableTwoFactor.error, t)}
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
                {t("mfa.setup")}
              </button>
              {startSetup.isError && (
                <p role="alert" className="mt-3 text-sm text-red-600">
                  {errorMessage(startSetup.error, t)}
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
                <li>{t("mfa.setupStepOne")}</li>
                <li>{t("mfa.setupStepTwo")}</li>
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
                {t("mfa.openAuthenticator")}
              </a>
              <label className="grid gap-1 text-sm font-bold">
                {t("mfa.enterCode")}
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
                {t("mfa.confirmEnable")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setSetup(null)}
                className="focus-ring text-sm font-bold text-muted hover:text-foreground"
              >
                {t("mfa.cancel")}
              </button>
              {enableTwoFactor.isError && (
                <p role="alert" className="text-sm text-red-600">
                  {errorMessage(enableTwoFactor.error, t)}
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
                    {t("sessions.title")}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {t("sessions.description")}
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
                    if (window.confirm(t("sessions.signOutOthersConfirmation")))
                      logoutOthers.mutate();
                  }}
                  className="focus-ring shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-black disabled:opacity-60"
                >
                  {t("sessions.signOutOthers")}
                </button>
                <button
                  type="button"
                  disabled={busy || !sessions.data?.items.length}
                  onClick={() => {
                    if (window.confirm(t("sessions.signOutAllConfirmation")))
                      logoutAll.mutate();
                  }}
                  className="focus-ring shrink-0 rounded-lg border border-red-500/45 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-500/10 disabled:opacity-60"
                >
                  {t("sessions.signOutAll")}
                </button>
              </div>
            </div>
            <div className="mt-5 grid gap-3">
              {sessions.isPending ? (
                <p className="text-sm text-muted">…</p>
              ) : sessions.isError ? (
                <p role="alert" className="text-sm text-red-600">
                  {errorMessage(sessions.error, t)}
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
                                {t("sessions.currentDevice")}
                              </span>
                            )}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {session.browserName}
                            {session.ipAddress ? ` · ${session.ipAddress}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {t("sessions.lastActive")}
                            {formatDate(session.lastActiveAtUtc, locale)}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {t("sessions.signedIn")}
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
                                ? t("sessions.signOutCurrentConfirmation")
                                : t("sessions.signOutSessionConfirmation"),
                            )
                          )
                            revokeSession.mutate(session.id);
                        }}
                        className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-black text-red-600 hover:bg-red-500/10 disabled:opacity-60"
                      >
                        <LogOut size={15} aria-hidden="true" />
                        {t("sessions.signOut")}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted">
                  {t("sessions.empty")}
                </p>
              )}
            </div>
            {revokeSession.isError && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {errorMessage(revokeSession.error, t)}
              </p>
            )}
            {logoutAll.isError && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {errorMessage(logoutAll.error, t)}
              </p>
            )}
            {logoutOthers.isError && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {errorMessage(logoutOthers.error, t)}
              </p>
            )}
          </section>
        )}
      </div>
    </AccountLayout>
  );
}
