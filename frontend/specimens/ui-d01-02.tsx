import CoursesPage from "@/app/[locale]/courses/page";
import {
  ActionCard,
  DashboardHeader,
  MetricCard,
} from "@/components/dashboard/dashboard-ui";
import { SupportCenter } from "@/features/support/support-center";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import ar from "../messages/ar.json";
import en from "../messages/en.json";

// Isolated, synthetic UI-contract specimen; never imported by a product route.
// The browser harness supplies fixed ticket/catalogue responses. No backend,
// authentication, payment, entitlement or persistence evidence is implied.
export function ColorSurfaceSpecimen({
  locale,
  view,
}: {
  locale: "en" | "ar";
  view: "catalogue" | "dashboard" | "support" | "foundation";
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      }),
  );
  const messages = locale === "ar" ? ar : en;
  const copy = messages.teacherWorkspace.dashboard;
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone="UTC"
      now={new Date("2026-10-01T00:00:00Z")}
    >
      <QueryClientProvider client={client}>
        <main lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
          {view === "catalogue" && <CoursesPage />}
          {view === "support" && (
            <div className="shell py-8">
              <SupportCenter mode="admin" />
            </div>
          )}
          {view === "dashboard" && (
            <div className="shell grid gap-4 py-8">
              <DashboardHeader
                eyebrow={copy.eyebrow}
                title={copy.title}
                description={copy.description}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                {(["primary", "secondary", "accent", "warm"] as const).map(
                  (tone, index) => (
                    <MetricCard
                      key={tone}
                      label={copy.drafts}
                      value={index + 1}
                      detail={copy.draftsDetail}
                      icon={BookOpen}
                      tone={tone}
                    />
                  ),
                )}
              </div>
              <ActionCard
                title={copy.myCourses}
                description={copy.myCoursesDescription}
                icon={BookOpen}
              >
                <a href={`/${locale}/teacher/courses`}>{copy.myCourses}</a>
              </ActionCard>
            </div>
          )}
          {view === "foundation" && <FoundationRoles locale={locale} />}
        </main>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}

function FoundationRoles({ locale }: { locale: "en" | "ar" }) {
  const arabic = locale === "ar";
  return (
    <div className="bg-surface-canvas p-6 text-text-primary" data-level="0">
      <h1 className="text-2xl font-bold">
        {arabic ? "عينات الألوان والأسطح" : "Color and surface specimens"}
      </h1>
      <section className="mt-4 bg-surface-section" data-level="1">
        <h2 className="text-xl font-semibold">
          {arabic ? "مجموعة منطقية" : "Logical section"}
        </h2>
        <p className="text-text-secondary">
          {arabic ? "نص مساند واضح" : "Readable supporting text"}
        </p>
        <p className="text-text-muted">
          {arabic ? "بيانات وصفية" : "Metadata"}
        </p>
        <a className="text-text-link underline" href="#panel">
          {arabic ? "عرض التفاصيل" : "View details"}
        </a>
        <div
          id="panel"
          className="mt-4 border border-border-subtle bg-surface-panel p-4"
          data-level="2"
        >
          <h3>{arabic ? "سطح عمل معتم" : "Opaque working panel"}</h3>
          <button
            type="button"
            className="focus-ring mt-3 block bg-surface-row p-3 text-start hover:bg-surface-row-hover active:bg-surface-row-pressed"
            data-level="3"
          >
            {arabic ? "عنصر تفاعلي" : "Interactive item"}
          </button>
          <button
            type="button"
            aria-pressed="true"
            className="focus-ring mt-3 block border-s-4 border-border-selected! bg-selection-surface p-3 text-selection-text"
          >
            <span aria-hidden="true">✓ </span>
            {arabic ? "العنصر المحدد" : "Selected item"}
          </button>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              data-primary="approved"
              className="focus-ring min-h-11 bg-action-primary-surface px-4 py-3 text-action-primary-foreground hover:bg-action-primary-surface-hover active:bg-action-primary-surface-pressed"
            >
              {arabic ? "متابعة" : "Continue"}
            </button>
            <button
              type="button"
              disabled
              className="min-h-11 bg-action-disabled px-4 py-3 text-action-disabled-text"
            >
              {arabic ? "غير متاح" : "Unavailable"}
            </button>
            <button
              type="button"
              disabled
              aria-busy="true"
              className="min-h-11 bg-action-pending px-4 py-3 text-action-pending-text"
            >
              {arabic ? "جارٍ الحفظ…" : "Saving…"}
            </button>
          </div>
        </div>
      </section>
      <div
        className="mt-4 border border-border-interactive! bg-surface-overlay p-4 shadow-overlay"
        data-level="4"
      >
        {arabic ? "عينة سطح نافذة معتم" : "Opaque overlay plane specimen"}
      </div>
      <div className="mt-4 grid gap-3">
        <p className="bg-success-surface p-3 text-success">
          <span aria-hidden="true">✓ </span>
          {arabic ? "نجاح — تم الحفظ" : "Success — saved"}
        </p>
        <p className="bg-warning-surface p-3 text-warning">
          <span aria-hidden="true">! </span>
          {arabic ? "تنبيه — يحتاج إلى انتباه" : "Warning — attention needed"}
        </p>
        <p className="bg-danger-surface p-3 text-danger">
          <span aria-hidden="true">× </span>
          {arabic ? "خطأ — أعد المحاولة" : "Error — retry required"}
        </p>
        <p className="bg-info-surface p-3 text-info">
          <span aria-hidden="true">i </span>
          {arabic ? "معلومة — راجع التفاصيل" : "Information — review details"}
        </p>
      </div>
    </div>
  );
}
