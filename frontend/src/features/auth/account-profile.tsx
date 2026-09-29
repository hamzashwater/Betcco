"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Phone, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccountLayout, type AccountRole } from "./account-layout";
import { StudentEmailChange } from "./student-email-change";

type Profile = {
  displayName: string;
  email: string;
  phone: string | null;
  countryCode?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  marketingConsent: boolean;
};

export function AccountProfile({
  role,
  aside,
}: {
  role: AccountRole;
  aside?: React.ReactNode;
}) {
  const t = useTranslations("auth.accountProfile");
  const client = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const profile = useQuery({
    queryKey: ["account-profile"],
    queryFn: () => api<Profile>("/auth/profile"),
  });
  const save = useMutation({
    mutationFn: (form: {
      displayName: string;
      phone: string;
      marketingConsent: boolean;
    }) =>
      api<Profile>("/auth/profile", {
        method: "PUT",
        body: JSON.stringify({
          displayName: form.displayName.trim(),
          phone: form.phone.trim() || null,
          marketingConsent: form.marketingConsent,
        }),
      }),
    onSuccess: (result) => {
      client.setQueryData(["account-profile"], result);
      void client.invalidateQueries({ queryKey: ["current-user"] });
      setNotice(t("saved"));
    },
  });

  return (
    <AccountLayout role={role} active="profile">
      <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <form
          className="card min-w-0 p-5 sm:p-7"
          onSubmit={(event) => {
            event.preventDefault();
            setNotice(null);
            const values = new FormData(event.currentTarget);
            save.mutate({
              displayName: String(values.get("displayName") ?? ""),
              phone: String(values.get("phone") ?? ""),
              marketingConsent: values.get("marketingConsent") === "on",
            });
          }}
        >
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <UserRound size={22} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-black">{t("basicDetails")}</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {t("description")}
              </p>
            </div>
          </div>
          {profile.isPending ? (
            <p className="mt-6 text-sm text-muted" aria-busy="true">
              {t("loading")}
            </p>
          ) : profile.isError || !profile.data ? (
            <div className="mt-6" role="alert">
              <p className="text-sm text-red-600">{t("loadError")}</p>
              <button
                type="button"
                onClick={() => void profile.refetch()}
                className="focus-ring mt-3 text-sm font-bold text-primary"
              >
                {t("retry")}
              </button>
            </div>
          ) : (
            <div key={profile.data.email} className="mt-6 grid gap-4">
              <label className="grid gap-1.5 text-sm font-bold">
                <span>{t("name")}</span>
                <span className="relative">
                  <UserRound
                    size={18}
                    aria-hidden="true"
                    className="pointer-events-none absolute start-3 top-3 text-muted"
                  />
                  <input
                    required
                    minLength={2}
                    maxLength={160}
                    name="displayName"
                    defaultValue={profile.data.displayName}
                    className="focus-ring w-full min-w-0 rounded-xl border border-border bg-transparent py-2.5 ps-10 pe-3 text-foreground"
                  />
                </span>
              </label>
              <label className="grid gap-1.5 text-sm font-bold">
                <span>{t("email")}</span>
                <span className="relative">
                  <AtSign
                    size={18}
                    aria-hidden="true"
                    className="pointer-events-none absolute start-3 top-3 text-muted"
                  />
                  <input
                    readOnly
                    value={profile.data.email ?? ""}
                    aria-label={t("email")}
                    aria-describedby="managed-email-help"
                    className="w-full min-w-0 rounded-xl border border-border bg-muted/35 py-2.5 ps-10 pe-3 text-muted"
                  />
                </span>
                <span
                  id="managed-email-help"
                  className="text-xs font-normal leading-5 text-muted"
                >
                  {role === "student"
                    ? t("studentEmailHelp")
                    : t("managedEmailHelp")}
                </span>
              </label>
              <label className="grid gap-1.5 text-sm font-bold">
                <span>{t("phoneOptional")}</span>
                <span className="relative">
                  <Phone
                    size={18}
                    aria-hidden="true"
                    className="pointer-events-none absolute start-3 top-3 text-muted"
                  />
                  <input
                    inputMode="tel"
                    maxLength={40}
                    name="phone"
                    defaultValue={profile.data.phone ?? ""}
                    className="focus-ring w-full min-w-0 rounded-xl border border-border bg-transparent py-2.5 ps-10 pe-3 text-foreground"
                  />
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm leading-6">
                <input
                  type="checkbox"
                  name="marketingConsent"
                  defaultChecked={profile.data.marketingConsent}
                  className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
                />
                <span>{t("marketingConsent")}</span>
              </label>
              <button
                type="submit"
                disabled={save.isPending}
                className="focus-ring rounded-xl bg-primary px-4 py-3 text-sm font-black text-slate-950 disabled:cursor-wait disabled:opacity-60"
              >
                {save.isPending ? t("saving") : t("saveDetails")}
              </button>
              {notice && (
                <p
                  role="status"
                  className="text-sm text-emerald-700 dark:text-emerald-300"
                >
                  {notice}
                </p>
              )}
              {save.isError && (
                <p role="alert" className="text-sm text-red-600">
                  {save.error instanceof Error
                    ? save.error.message
                    : t("saveError")}
                </p>
              )}
            </div>
          )}
        </form>
        {aside ?? (
          <aside className="card min-w-0 self-start p-5 sm:p-7">
            <div className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
              <AtSign size={22} aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-xl font-black">
              {role === "teacher"
                ? t("teacherAccount")
                : role === "support"
                  ? t("supportAccount")
                  : t("adminAccount")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {t("accountSecurityDescription")}
            </p>
          </aside>
        )}
      </div>
      {role === "student" && <StudentEmailChange />}
    </AccountLayout>
  );
}
