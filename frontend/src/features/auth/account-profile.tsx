"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Phone, UserRound } from "lucide-react";
import { useLocale } from "next-intl";
import { useState } from "react";
import { AccountLayout, type AccountRole } from "./account-layout";

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
  const locale = useLocale();
  const client = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
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
      setNotice(
        locale === "ar" ? "تم حفظ بيانات الحساب." : "Account details saved.",
      );
    },
  });
  const requestEmailChange = useMutation({
    mutationFn: () =>
      api<void>("/auth/email-change/request", {
        method: "POST",
        body: JSON.stringify({ newEmail, currentPassword: emailPassword }),
      }),
    onSuccess: () => {
      setNewEmail("");
      setEmailPassword("");
      setEmailNotice(
        locale === "ar"
          ? "أرسلنا رابط التحقق إلى البريد الجديد. صلاحيته ساعة واحدة."
          : "A confirmation link was sent to the new address. It expires in one hour.",
      );
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
              <h2 className="text-xl font-black">
                {locale === "ar" ? "البيانات الأساسية" : "Basic details"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {locale === "ar"
                  ? "يمكنك تحديث اسمك ورقم هاتفك وتفضيل الرسائل التسويقية."
                  : "Update your name, phone number, and marketing preference."}
              </p>
            </div>
          </div>
          {profile.isPending ? (
            <p className="mt-6 text-sm text-muted" aria-busy="true">
              {locale === "ar" ? "جارٍ تحميل البيانات…" : "Loading details…"}
            </p>
          ) : profile.isError || !profile.data ? (
            <div className="mt-6" role="alert">
              <p className="text-sm text-red-600">
                {locale === "ar"
                  ? "تعذر تحميل بيانات الحساب."
                  : "Your account details could not be loaded."}
              </p>
              <button
                type="button"
                onClick={() => void profile.refetch()}
                className="focus-ring mt-3 text-sm font-bold text-primary"
              >
                {locale === "ar" ? "إعادة المحاولة" : "Try again"}
              </button>
            </div>
          ) : (
            <div key={profile.data.email} className="mt-6 grid gap-4">
              <label className="grid gap-1.5 text-sm font-bold">
                <span>{locale === "ar" ? "الاسم" : "Name"}</span>
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
                <span>{locale === "ar" ? "البريد الإلكتروني" : "Email"}</span>
                <span className="relative">
                  <AtSign
                    size={18}
                    aria-hidden="true"
                    className="pointer-events-none absolute start-3 top-3 text-muted"
                  />
                  <input
                    readOnly
                    value={profile.data.email ?? ""}
                    className="w-full min-w-0 rounded-xl border border-border bg-muted/35 py-2.5 ps-10 pe-3 text-muted"
                  />
                </span>
                <span className="text-xs font-normal leading-5 text-muted">
                  {role === "student"
                    ? locale === "ar"
                      ? "استخدم إجراء تغيير البريد الآمن أدناه."
                      : "Use the secure change email action below."
                    : locale === "ar"
                      ? "تُدير الإدارة بريد هذا الحساب."
                      : "Administration manages this account's email."}
                </span>
              </label>
              <label className="grid gap-1.5 text-sm font-bold">
                <span>
                  {locale === "ar"
                    ? "رقم الهاتف (اختياري)"
                    : "Phone (optional)"}
                </span>
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
                    : locale === "ar"
                      ? "تعذر حفظ البيانات."
                      : "Your details could not be saved."}
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
                ? locale === "ar"
                  ? "حساب المعلم"
                  : "Teacher account"
                : role === "support"
                  ? locale === "ar"
                    ? "حساب مساعد الإدارة"
                    : "Support administrator account"
                  : locale === "ar"
                    ? "حساب الأدمن"
                    : "Admin account"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {locale === "ar"
                ? "تظهر هنا بيانات حسابك الفعلية. لحماية حسابك، راجع المصادقة الثنائية والأجهزة المسجّلة الدخول من تبويب الأمان."
                : "Your account details come from your live profile. Review two-factor authentication and signed-in devices on the Security tab."}
            </p>
          </aside>
        )}
      </div>
      {role === "student" && (
        <form
          className="card mt-5 grid min-w-0 gap-4 p-5 sm:p-7"
          onSubmit={(event) => {
            event.preventDefault();
            setEmailNotice(null);
            requestEmailChange.mutate();
          }}
        >
          <h2 className="text-xl font-black">
            {locale === "ar" ? "تغيير البريد الإلكتروني" : "Change email"}
          </h2>
          <p className="text-sm text-muted">
            {locale === "ar"
              ? "تحقق من ملكية البريد الجديد قبل تغيير بيانات الدخول. سيتطلب التأكيد تسجيل دخول جديدًا."
              : "Verify the new address before it becomes your sign-in email. Confirmation will sign you out."}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-bold">
              <span>{locale === "ar" ? "البريد الجديد" : "New email"}</span>
              <input
                type="email"
                required
                maxLength={320}
                autoComplete="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                className="focus-ring min-w-0 rounded-xl border border-border bg-transparent px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold">
              <span>
                {locale === "ar" ? "كلمة المرور الحالية" : "Current password"}
              </span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={emailPassword}
                onChange={(event) => setEmailPassword(event.target.value)}
                className="focus-ring min-w-0 rounded-xl border border-border bg-transparent px-3 py-2"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={requestEmailChange.isPending}
            className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60"
          >
            {locale === "ar" ? "إرسال رابط التحقق" : "Send confirmation link"}
          </button>
          {emailNotice && (
            <p role="status" className="text-sm text-emerald-700">
              {emailNotice}
            </p>
          )}
          {requestEmailChange.isError && (
            <p role="alert" className="text-sm text-red-600">
              {requestEmailChange.error instanceof Error
                ? requestEmailChange.error.message
                : locale === "ar"
                  ? "تعذر إرسال الرابط."
                  : "Unable to send the link."}
            </p>
          )}
        </form>
      )}
    </AccountLayout>
  );
}
