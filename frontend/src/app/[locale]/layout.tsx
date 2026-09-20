import { SiteFooter } from "@/components/site-footer";
import { SiteNavigation } from "@/components/site-navigation";
import { CookieConsent } from "@/components/cookie-consent";
import { DeepSpaceBackground } from "@/components/visual/deep-space-background";
import { ScrollProgress } from "@/components/visual/scroll-progress";
import { AnalyticsTracker } from "@/components/analytics-tracker";
import { PwaRegister } from "@/components/pwa-register";
import { Providers } from "@/components/providers";
import { routing } from "@/i18n/routing";
import { defaultBrand, publicBrandSettingsQueryKey } from "@/lib/brand";
import { getPublicBrandSettings } from "@/lib/public-brand-settings.server";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

type Props = Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const title =
    locale === "ar"
      ? `${defaultBrand.BrandName} | تعلّم. طبّق. حقق المعايير.`
      : `${defaultBrand.BrandName} | Learn. Apply. Achieve.`;
  const description =
    locale === "ar"
      ? `منصة ${defaultBrand.BrandName} التعليمية الذكية لطلاب BTEC.`
      : `${defaultBrand.BrandName} is an intelligent learning platform for BTEC students.`;
  const base = process.env.NEXT_PUBLIC_APP_URL;
  return {
    title,
    description,
    metadataBase: base ? new URL(base) : undefined,
    openGraph: {
      title,
      description,
      type: "website",
      locale: locale === "ar" ? "ar_JO" : "en_US",
      images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
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
  const queryClient = new QueryClient();
  queryClient.setQueryData(publicBrandSettingsQueryKey(locale), brandSettings);
  const publicBase =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_PUBLIC_URL;
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: defaultBrand.BrandName,
    url: publicBase ? `${publicBase.replace(/\/$/, "")}/${locale}` : undefined,
    description:
      locale === "ar"
        ? "منصة تعليمية مستقلة تدعم طلاب BTEC بالتعلم والمهام ومعايير التقييم."
        : "An independent educational platform supporting BTEC learners with courses, assignments, and assessment criteria.",
  }).replace(/</g, "\\u003c");
  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <Providers dehydratedState={dehydrate(queryClient)}>
        <DeepSpaceBackground />
        <div
          dir={locale === "ar" ? "rtl" : "ltr"}
          lang={locale}
          className="relative z-10 flex min-h-screen flex-col"
        >
          <SiteNavigation />
          <a className="skip-link" href="#main-content">
            {locale === "ar"
              ? "الانتقال إلى المحتوى الرئيسي"
              : "Skip to main content"}
          </a>
          <main
            id="main-content"
            tabIndex={-1}
            className="page-backdrop flex-1"
          >
            {children}
          </main>
          <SiteFooter />
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
  );
}
