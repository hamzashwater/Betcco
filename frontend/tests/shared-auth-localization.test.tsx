import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CookieConsent } from "@/components/cookie-consent";
import { SiteFooter } from "@/components/site-footer";
import { SiteNavigation } from "@/components/site-navigation";
import { MfaEnrollmentBoundary } from "@/features/auth/mfa-enrollment-boundary";
import {
  EmailConfirmationForm,
  LoginForm,
  RegisterForm,
  ResetPasswordForm,
} from "@/features/auth/auth-forms";
import { EmailChangeConfirmation } from "@/features/auth/email-change-confirmation";
import arabicMessages from "../messages/ar.json";
import englishMessages from "../messages/en.json";

const { apiMock, pathnameMock, routerMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  pathnameMock: { value: "/ar" },
  routerMock: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock.value,
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: apiMock,
}));

function renderLocalized(
  locale: "ar" | "en",
  messages: typeof arabicMessages | typeof englishMessages,
  node: React.ReactNode,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("shared shell localization", () => {
  it.each([
    [
      "ar",
      arabicMessages,
      "التنقل الأساسي",
      "الرئيسية",
      "التبديل إلى الإنجليزية",
      "/ar/terms",
    ],
    [
      "en",
      englishMessages,
      "Primary navigation",
      "Home",
      "Switch to Arabic",
      "/en/terms",
    ],
  ] as const)(
    "renders navigation and footer copy for %s",
    async (locale, messages, navLabel, homeLabel, switchLabel, termsHref) => {
      pathnameMock.value = `/${locale}`;
      apiMock.mockImplementation((path: string) => {
        if (path === "/auth/me") return Promise.reject(new Error("Signed out"));
        if (path.startsWith("/settings/public")) return Promise.resolve({});
        return Promise.resolve({ items: [] });
      });

      renderLocalized(
        locale,
        messages,
        <>
          <SiteNavigation />
          <SiteFooter />
        </>,
      );

      expect(
        await screen.findByRole("navigation", { name: navLabel }),
      ).toBeVisible();
      expect(screen.getByRole("link", { name: homeLabel })).toBeVisible();
      expect(screen.getByRole("link", { name: switchLabel })).toHaveAttribute(
        "href",
        `/${locale === "ar" ? "en" : "ar"}`,
      );
      expect(
        screen.getByRole("link", {
          name: locale === "ar" ? "الشروط والأحكام" : "Terms and conditions",
        }),
      ).toHaveAttribute("href", termsHref);
      expect(
        screen.getByRole("button", {
          name: locale === "ar" ? "إعدادات ملفات الارتباط" : "Cookie settings",
        }),
      ).toBeVisible();
    },
  );

  it.each([
    ["ar", arabicMessages, "خيارات ملفات تعريف الارتباط", "قبول الكل"],
    ["en", englishMessages, "Cookie choices", "Accept all"],
  ] as const)(
    "renders cookie consent copy for %s",
    async (locale, messages, title, accept) => {
      renderLocalized(locale, messages, <CookieConsent />);
      expect(await screen.findByRole("dialog", { name: title })).toBeVisible();
      expect(screen.getByRole("button", { name: accept })).toBeVisible();
    },
  );
});

describe("authentication form localization", () => {
  it.each([
    [
      "ar",
      arabicMessages,
      "تأكيد البريد الإلكتروني",
      "رابط تأكيد البريد غير مكتمل.",
    ],
    [
      "en",
      englishMessages,
      "Confirm your email",
      "The email-confirmation link is incomplete.",
    ],
  ] as const)(
    "renders email confirmation copy for %s",
    (locale, messages, title, missingLink) => {
      renderLocalized(locale, messages, <EmailConfirmationForm />);
      expect(screen.getByRole("heading", { name: title })).toBeVisible();
      expect(screen.getByRole("alert")).toHaveTextContent(missingLink);
    },
  );

  it.each([
    ["ar", arabicMessages, "تأكيد البريد الجديد", "الرابط غير مكتمل."],
    ["en", englishMessages, "Confirm new email", "This link is incomplete."],
  ] as const)(
    "renders email change confirmation copy for %s",
    (locale, messages, title, missingLink) => {
      renderLocalized(locale, messages, <EmailChangeConfirmation />);
      expect(screen.getByRole("heading", { name: title })).toBeVisible();
      expect(screen.getByRole("alert")).toHaveTextContent(missingLink);
    },
  );

  it.each([
    [
      "ar",
      arabicMessages,
      "جارٍ فتح إعداد المصادقة الثنائية…",
      "افتح أمان الحساب",
    ],
    [
      "en",
      englishMessages,
      "Opening multi-factor setup…",
      "Open account security",
    ],
  ] as const)(
    "renders MFA enrollment boundary copy for %s",
    async (locale, messages, opening, openSecurity) => {
      pathnameMock.value = `/${locale}/admin`;
      apiMock.mockResolvedValue({ requiresMfaEnrollment: true });
      renderLocalized(
        locale,
        messages,
        <MfaEnrollmentBoundary navigation={null}>
          <div>Protected workspace</div>
        </MfaEnrollmentBoundary>,
      );
      expect(await screen.findByText(opening)).toBeVisible();
      expect(screen.getByRole("link", { name: openSecurity })).toBeVisible();
      expect(screen.queryByText("Protected workspace")).not.toBeInTheDocument();
    },
  );

  it.each([
    ["ar", arabicMessages, "تسجيل الدخول", "البريد الإلكتروني", "دخول"],
    ["en", englishMessages, "Sign in", "Email", "Sign in"],
  ] as const)(
    "renders sign-in labels for %s",
    (locale, messages, title, email, submit) => {
      renderLocalized(locale, messages, <LoginForm />);
      expect(screen.getByRole("heading", { name: title })).toBeVisible();
      expect(screen.getByLabelText(email)).toBeVisible();
      expect(screen.getByRole("button", { name: submit })).toBeVisible();
    },
  );

  it.each([
    [
      "ar",
      arabicMessages,
      "أنشئ حسابًا جديدًا",
      "استعد الوصول إلى حسابك",
      "إرسال رابط الاستعادة",
    ],
    [
      "en",
      englishMessages,
      "Create your account",
      "Recover access to your account",
      "Send reset link",
    ],
  ] as const)(
    "renders registration and reset labels for %s",
    async (locale, messages, registerTitle, resetTitle, resetSubmit) => {
      apiMock.mockImplementation((path: string) =>
        path.startsWith("/legal/required")
          ? Promise.resolve([
              {
                slug: "terms",
                version: "1",
                title: "Terms",
                effectiveAtUtc: "2026-01-01",
              },
              {
                slug: "privacy",
                version: "1",
                title: "Privacy",
                effectiveAtUtc: "2026-01-01",
              },
            ])
          : Promise.reject(new Error(`Unexpected API path: ${path}`)),
      );
      const { unmount } = renderLocalized(locale, messages, <RegisterForm />);
      expect(
        screen.getByRole("heading", { name: registerTitle }),
      ).toBeVisible();
      unmount();

      renderLocalized(locale, messages, <ResetPasswordForm />);
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: resetTitle })).toBeVisible(),
      );
      expect(screen.getByRole("button", { name: resetSubmit })).toBeVisible();
    },
  );
});
