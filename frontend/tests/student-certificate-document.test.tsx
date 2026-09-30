import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { formatLocalizedDate } from "@/i18n/date-time";
import { StudentArea } from "@/features/student/student-area";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

type Locale = "ar" | "en";
const verificationCode = "CERT /RAW";
const issuedAtUtc = "2026-09-21T13:45:00Z";

const copy = {
  en: {
    error:
      "The certificate could not be found, or you do not have permission to view it.",
    back: "My certificates",
    print: "Print certificate",
    type: "Certificate of Completion",
    completion:
      "has successfully completed the core learning requirements for the following BETCCO course:",
    issueDate: "Issue date",
    certificateId: "Certificate ID",
    qrAlt: "Certificate verification QR code",
    qrHelp: "Scan to verify this certificate",
    disclaimer:
      "This is a BETCCO completion certificate. It is not a Pearson certificate or official Pearson BTEC accreditation.",
  },
  ar: {
    error: "تعذّر العثور على الشهادة أو لا تملك صلاحية عرضها.",
    back: "شهاداتي",
    print: "طباعة الشهادة",
    type: "شهادة إكمال",
    completion:
      "أتم بنجاح متطلبات التعلّم الأساسية في الدورة التالية على منصة BETCCO:",
    issueDate: "تاريخ الإصدار",
    certificateId: "رقم الشهادة",
    qrAlt: "رمز QR للتحقق من الشهادة",
    qrHelp: "امسح الرمز للتحقق من الشهادة",
    disclaimer:
      "هذه شهادة إكمال صادرة من BETCCO وليست شهادة Pearson أو اعتمادًا رسميًا من Pearson BTEC.",
  },
};

function certificateData() {
  return {
    studentName: "Raw Student Name",
    courseTitle: "Raw Server Course Title",
    issuedAtUtc,
    verificationCode,
  };
}

function renderCertificate(locale: Locale) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? arMessages : enMessages}
    >
      <QueryClientProvider client={client}>
        <StudentArea segment={["certificates", verificationCode]} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return client;
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
  vi.restoreAllMocks();
});

describe("student certificate document localization", () => {
  it.each(["en", "ar"] as const)(
    "renders localized static copy and preserves raw server fields and contracts in %s",
    async (locale) => {
      apiMock.mockResolvedValue(certificateData());
      const client = renderCertificate(locale);
      const text = copy[locale];

      expect(
        await screen.findByRole("heading", {
          level: 1,
          name: "Raw Student Name",
        }),
      ).toBeVisible();
      expect(screen.getByText("Raw Server Course Title")).toBeVisible();
      for (const value of [
        text.type,
        text.completion,
        text.issueDate,
        text.certificateId,
        text.qrHelp,
        text.disclaimer,
        "BETCCO",
      ])
        expect(screen.getByText(value)).toBeVisible();

      const requestPath =
        "/student-tools/my-certificates/CERT%20%2FRAW?locale=" + locale;
      expect(apiMock).toHaveBeenCalledWith(requestPath);
      const cachedQuery = client
        .getQueryCache()
        .getAll()
        .find((query) => query.queryKey[0] === "my-certificate");
      expect(cachedQuery?.queryKey).toEqual([
        "my-certificate",
        verificationCode,
        locale,
      ]);

      const backLink = screen
        .getAllByRole("link", { name: text.back })
        .find(
          (link) =>
            link.getAttribute("href") === `/${locale}/student/certificates`,
        );
      expect(backLink).toBeVisible();
      const print = vi.spyOn(window, "print").mockImplementation(() => {});
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: text.print }));
      expect(print).toHaveBeenCalledOnce();

      const id = screen.getByText(verificationCode);
      expect(id).toHaveAttribute("dir", "ltr");
      const qr = screen.getByRole("img", { name: text.qrAlt });
      expect(qr).toHaveAttribute(
        "src",
        "/api/v1/student-tools/certificates/CERT%20%2FRAW/qr",
      );
      expect(qr).toHaveAttribute("width", "120");
      expect(qr).toHaveAttribute("height", "120");
      expect(qr).toHaveClass("size-28");
      expect(
        screen.getByText(
          formatLocalizedDate(issuedAtUtc, locale, { dateStyle: "long" }),
        ),
      ).toBeVisible();
      expect(screen.queryByText(issuedAtUtc)).not.toBeInTheDocument();
    },
  );

  it.each(["en", "ar"] as const)(
    "localizes missing certificate data and API failures without exposing backend details in %s",
    async (locale) => {
      apiMock.mockResolvedValue(undefined);
      renderCertificate(locale);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy[locale].error,
      );
      expect(
        screen.queryByText("Raw authorization diagnostic"),
      ).not.toBeInTheDocument();

      cleanup();
      apiMock.mockRejectedValue(new Error("Raw authorization diagnostic"));
      renderCertificate(locale);
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(copy[locale].error);
      expect(alert).not.toHaveTextContent("Raw authorization diagnostic");
    },
  );
});
