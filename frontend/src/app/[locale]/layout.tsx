import { SiteFooter } from "@/components/site-footer";
import { SiteNavigation } from "@/components/site-navigation";
import { CookieConsent } from "@/components/cookie-consent";
import { DeepSpaceBackground } from "@/components/visual/deep-space-background";
import { ScrollProgress } from "@/components/visual/scroll-progress";
import { AnalyticsTracker } from "@/components/analytics-tracker";
import { PwaRegister } from "@/components/pwa-register";
import { Providers } from "@/components/providers";
import { MfaEnrollmentBoundary } from "@/features/auth/mfa-enrollment-boundary";
import { routing } from "@/i18n/routing";
import { defaultBrand, publicBrandSettingsQueryKey } from "@/lib/brand";
import { getPublicBrandSettings } from "@/lib/public-brand-settings.server";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { notFound } from "next/navigation";
import { baseMetadata } from "@/lib/site-metadata";
import "../globals.css";

type Props = Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const metadata = await getTranslations({ locale, namespace: "siteMetadata" });
  const title = metadata("title", { brand: defaultBrand.BrandName });
  const description = metadata("description", {
    brand: defaultBrand.BrandName,
  });
  const base = process.env.NEXT_PUBLIC_APP_URL;
  return {
    ...baseMetadata,
    title,
    description,
    metadataBase: base ? new URL(base) : baseMetadata.metadataBase,
    openGraph: {
      title,
      description,
      type: "website",
      locale: locale === "ar" ? "ar_JO" : "en_US",
      images: [{ url: `/${locale}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
    alternates: {
      canonical: `/${locale}`,
      languages: { ar: "/ar", en: "/en" },
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [messages, brandSettings] = await Promise.all([
    getMessages(),
    getPublicBrandSettings(locale),
  ]);
  const t = await getTranslations("navigation.accessibility");
  const metadata = await getTranslations({ locale, namespace: "siteMetadata" });
  const queryClient = new QueryClient();
  queryClient.setQueryData(publicBrandSettingsQueryKey(locale), brandSettings);
  const publicBase =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_PUBLIC_URL;
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: defaultBrand.BrandName,
    url: publicBase ? `${publicBase.replace(/\/$/, "")}/${locale}` : undefined,
    description: metadata("organizationDescription"),
  }).replace(/</g, "\\u003c");
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      suppressHydrationWarning
    >
      <body className="min-h-screen">
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('betcco-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}",
          }}
        />
        <NextIntlClientProvider messages={messages} locale={locale}>
          <Providers dehydratedState={dehydrate(queryClient)}>
            <DeepSpaceBackground />
            <div className="group/role-shell relative z-10 flex min-h-screen flex-col">
              <MfaEnrollmentBoundary
                navigation={
                  <>
                    <a className="skip-link" href="#main-content">
                      {t("skipToMainContent")}
                    </a>
                    <SiteNavigation />
                  </>
                }
              >
                <main
                  id="main-content"
                  tabIndex={-1}
                  className="page-backdrop min-w-0 flex-1 lg:group-has-[[data-staff-shell=teacher]]/role-shell:ms-60 lg:group-has-[[data-staff-shell=admin]]/role-shell:ms-64"
                >
                  {children}
                </main>
              </MfaEnrollmentBoundary>
              <div className="lg:group-has-[[data-staff-shell=teacher]]/role-shell:ms-60 lg:group-has-[[data-staff-shell=admin]]/role-shell:ms-64">
                <SiteFooter />
              </div>
            </div>
            <ScrollProgress />
            <CookieConsent />
            <AnalyticsTracker />
            <PwaRegister />
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: structuredData }}
            />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
