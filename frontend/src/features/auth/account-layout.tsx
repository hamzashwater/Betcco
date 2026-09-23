"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { ShieldCheck, UserRound } from "lucide-react";

export type AccountRole = "student" | "teacher" | "admin";

export function AccountLayout({
  role,
  active,
  children,
}: {
  role: AccountRole;
  active: "profile" | "security";
  children: React.ReactNode;
}) {
  const locale = useLocale();
  const profileHref = `/${locale}/${role}/${role === "student" ? "account" : "profile"}`;
  const securityHref = `/${locale}/${role}/security`;
  return (
    <section className="shell min-w-0 py-8 sm:py-10">
      <header className="overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#11354c] via-[#11283c] to-[#0c1a2a] px-5 py-7 text-white shadow-lg sm:px-8 sm:py-9">
        <p className="text-xs font-black tracking-[0.16em] text-[#79dfd0]">
          BETCCO ACCOUNT
        </p>
        <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
          {active === "profile"
            ? locale === "ar"
              ? "الملف الشخصي"
              : "Your profile"
            : locale === "ar"
              ? "أمان الحساب والجلسات"
              : "Account security and sessions"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">
          {active === "profile"
            ? locale === "ar"
              ? "راجع بيانات حسابك وحدّث المعلومات التي يدعمها النظام."
              : "Review your account details and update the information this account supports."
            : locale === "ar"
              ? "فعّل تطبيق المصادقة وراجع الأجهزة المسجّلة الدخول."
              : "Set up an authenticator app and review signed-in devices."}
        </p>
      </header>
      <nav
        aria-label={locale === "ar" ? "إعدادات الحساب" : "Account settings"}
        className="mt-5 flex flex-wrap gap-2"
      >
        <Link
          href={profileHref}
          aria-current={active === "profile" ? "page" : undefined}
          className={`focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${active === "profile" ? "bg-primary text-slate-950" : "border border-border text-foreground hover:bg-primary/10"}`}
        >
          <UserRound size={17} aria-hidden="true" />
          {locale === "ar" ? "الملف الشخصي" : "Profile"}
        </Link>
        <Link
          href={securityHref}
          aria-current={active === "security" ? "page" : undefined}
          className={`focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${active === "security" ? "bg-primary text-slate-950" : "border border-border text-foreground hover:bg-primary/10"}`}
        >
          <ShieldCheck size={17} aria-hidden="true" />
          {locale === "ar" ? "أمان الحساب" : "Security"}
        </Link>
      </nav>
      {children}
    </section>
  );
}
