"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ShieldCheck, UserRound } from "lucide-react";

export type AccountRole = "student" | "teacher" | "support" | "admin" | "staff";

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
  const t = useTranslations("auth.accountLayout");
  const profileHref = `/${locale}/${role}/${role === "student" ? "account" : "profile"}`;
  const securityHref = `/${locale}/${role}/security`;
  return (
    <section className="shell min-w-0 py-8 sm:py-10">
      <header className="overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#11354c] via-[#11283c] to-[#0c1a2a] px-5 py-7 text-white shadow-lg sm:px-8 sm:py-9">
        <p className="text-xs font-black tracking-[0.16em] text-[#79dfd0]">
          {t("brandLabel")}
        </p>
        <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
          {active === "profile" ? t("profileTitle") : t("securityTitle")}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">
          {active === "profile"
            ? t("profileDescription")
            : t("securityDescription")}
        </p>
      </header>
      {role !== "staff" && (
        <nav
          aria-label={t("settingsLabel")}
          className="mt-5 flex flex-wrap gap-2"
        >
          <Link
            href={profileHref}
            aria-current={active === "profile" ? "page" : undefined}
            className={`focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${active === "profile" ? "bg-primary text-slate-950" : "border border-border text-foreground hover:bg-primary/10"}`}
          >
            <UserRound size={17} aria-hidden="true" />
            {t("profile")}
          </Link>
          <Link
            href={securityHref}
            aria-current={active === "security" ? "page" : undefined}
            className={`focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${active === "security" ? "bg-primary text-slate-950" : "border border-border text-foreground hover:bg-primary/10"}`}
          >
            <ShieldCheck size={17} aria-hidden="true" />
            {t("security")}
          </Link>
        </nav>
      )}
      {children}
    </section>
  );
}
