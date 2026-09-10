"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { defaultBrand, type BrandSettings } from "@/lib/brand";
import { BrandLogo } from "@/components/brand-logo";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

export function SiteFooter() {
  const locale = useLocale();
  const t = useTranslations();
  const settings = useQuery({
    queryKey: ["settings", locale],
    queryFn: () => api<BrandSettings>(`/settings/public?locale=${locale}`),
    staleTime: 60_000,
  });
  const brand = { ...defaultBrand, ...settings.data };
  return (
    <footer className="elevated-surface mt-auto border-t border-border backdrop-blur-xl">
      <div className="shell grid gap-8 py-10 md:grid-cols-[0.9fr_1fr_1.25fr]">
        <div>
          <div className="w-44">
            <BrandLogo
              variant="horizontal"
              src={brand.Logo}
              alt={brand.BrandName}
              className="brand-logo-on-light w-full"
            />
            <BrandLogo
              variant="dark"
              src={brand.DarkModeLogo}
              alt={brand.BrandName}
              className="brand-logo-on-dark w-full"
            />
          </div>
          <p className="mt-2 text-sm text-muted">
            {brand.BrandTagline || t("tagline")}
          </p>
        </div>
        <div className="text-sm text-muted">
          <p className="font-semibold text-foreground">{brand.BrandName}</p>
          <p className="mt-2">
            {locale === "ar"
              ? "منصة تعليمية مستقلة متخصصة في طلاب BTEC."
              : "An independent educational platform focused on BTEC students."}
          </p>
        </div>
        <div className="grid content-start gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
          {legalLinks(locale).map((link) => (
            <Link
              key={link.href}
              className="focus-ring hover:text-primary"
              href={`/${locale}/${link.href}`}
            >
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new Event("betcco:open-cookie-settings"))
            }
            className="focus-ring text-start hover:text-primary"
          >
            {locale === "ar" ? "إعدادات ملفات الارتباط" : "Cookie settings"}
          </button>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="shell flex flex-col items-center justify-between gap-1.5 py-2.5 text-center text-[11px] leading-4 text-muted sm:flex-row sm:gap-6 sm:text-start">
          <p>{t("copyright").replace("BETCCO", brand.BrandName)}</p>
          <p className="max-w-3xl">{brand.BtecDisclaimer}</p>
        </div>
      </div>
    </footer>
  );
}

function legalLinks(locale: string) {
  const ar = locale === "ar";
  return [
    { href: "terms", label: ar ? "الشروط والأحكام" : "Terms and conditions" },
    { href: "privacy", label: ar ? "سياسة الخصوصية" : "Privacy policy" },
    { href: "refunds", label: ar ? "الدفع والاسترداد" : "Payment and refunds" },
    { href: "copyright", label: ar ? "حقوق النشر" : "Copyright" },
    {
      href: "student-agreement",
      label: ar ? "اتفاقية الطالب" : "Student agreement",
    },
    {
      href: "teacher-agreement",
      label: ar ? "اتفاقية المعلم" : "Teacher agreement",
    },
    { href: "minors", label: ar ? "حماية القاصرين" : "Minors protection" },
    { href: "cookies", label: ar ? "ملفات تعريف الارتباط" : "Cookies" },
    { href: "complaints", label: ar ? "الشكاوى" : "Complaints" },
    { href: "privacy-center", label: ar ? "مركز الخصوصية" : "Privacy centre" },
    {
      href: "security",
      label: ar ? "الإبلاغ عن ثغرة أمنية" : "Report a vulnerability",
    },
    { href: "contact", label: ar ? "اتصل بنا" : "Contact us" },
    { href: "platform-rating", label: ar ? "تقييم BETCCO" : "Rate BETCCO" },
    { href: "guide", label: ar ? "دليل الاستخدام" : "User guide" },
    {
      href: "faq",
      label: ar ? "الأسئلة الشائعة" : "Frequently asked questions",
    },
  ];
}
