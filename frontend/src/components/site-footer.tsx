"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import {
  publicBrandSettingsQueryKey,
  resolveBrandSettings,
  type BrandSettings,
} from "@/lib/brand";
import { BrandLogo } from "@/components/brand-logo";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

export function SiteFooter() {
  const locale = useLocale();
  const t = useTranslations();
  const footer = useTranslations("footer");
  const settings = useQuery({
    queryKey: publicBrandSettingsQueryKey(locale),
    queryFn: () => api<BrandSettings>(`/settings/public?locale=${locale}`),
    staleTime: 60_000,
  });
  const brand = resolveBrandSettings(locale, settings.data);
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
          <p className="mt-2">{footer("description")}</p>
        </div>
        <div className="grid content-start gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
          {legalLinks(footer).map((link) => (
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
            {footer("cookieSettings")}
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

function legalLinks(footer: ReturnType<typeof useTranslations<"footer">>) {
  return [
    { href: "terms", label: footer("links.terms") },
    { href: "privacy", label: footer("links.privacy") },
    { href: "refunds", label: footer("links.refunds") },
    { href: "copyright", label: footer("links.copyright") },
    {
      href: "student-agreement",
      label: footer("links.studentAgreement"),
    },
    {
      href: "teacher-agreement",
      label: footer("links.teacherAgreement"),
    },
    { href: "minors", label: footer("links.minors") },
    { href: "cookies", label: footer("links.cookies") },
    { href: "complaints", label: footer("links.complaints") },
    { href: "privacy-center", label: footer("links.privacyCenter") },
    {
      href: "security",
      label: footer("links.security"),
    },
    { href: "contact", label: footer("links.contact") },
    { href: "platform-rating", label: footer("links.platformRating") },
    { href: "guide", label: footer("links.guide") },
    {
      href: "faq",
      label: footer("links.faq"),
    },
  ];
}
