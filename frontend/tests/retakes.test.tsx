import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { RetakeManagement } from "@/features/admin/retake-management";
import { StudentArea } from "@/features/student/student-area";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

function renderWithProviders(node: React.ReactNode, locale: "en" | "ar") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? arMessages : enMessages}
    >
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        {node}
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

describe("ASSESS Retakes", () => {
  it("retires new Retake creation while preserving legacy history messaging", () => {
    renderWithProviders(<RetakeManagement />, "en");

    expect(screen.getByText("Legacy Retakes")).toBeVisible();
    expect(
      screen.getByText(/BETCCO no longer creates new Retake requests/i),
    ).toBeVisible();
    expect(
      screen.getByText(
        /Historical Retake records remain available for reading and audit/i,
      ),
    ).toBeVisible();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it.each(["en", "ar"] as const)(
    "labels the independent student Retake payment state without exposing staff rationale in %s",
    async (locale) => {
      apiMock.mockResolvedValue([
        {
          id: "retake-1",
          status: "Draft",
          price: 5,
          currency: "JOD",
          isRetake: true,
          retakeOfEvaluationRequestId: "original-1",
          criteria: ["A.P1"],
          academic: null,
          selectedCriteria: [],
          calculatedGrade: null,
          sectionResults: [],
          results: [],
          evidence: [],
          feedback: [],
          reason: "Private LIV rationale",
        },
      ]);
      renderWithProviders(<StudentArea segment={["evaluations"]} />, locale);
      expect(
        await screen.findByText(
          locale === "ar" ? "طلب Retake" : "Retake evaluation",
        ),
      ).toBeVisible();
      expect(
        screen.getByText(
          locale === "ar" ? "تسليم ودفع Retake" : "Submit and pay for Retake",
        ),
      ).toBeVisible();
      expect(
        screen.getByText(
          locale === "ar" ? "النتيجة محدودة بـ Pass" : "Pass-only outcome",
        ),
      ).toBeVisible();
      expect(
        screen.queryByText("Private LIV rationale"),
      ).not.toBeInTheDocument();
    },
  );
});
