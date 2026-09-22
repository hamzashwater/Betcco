import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("lets LIV select only a server-offered scope and sends a staff rationale without a price", async () => {
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/retakes/eligible")
        return Promise.resolve([
          {
            originalEvaluationRequestId: "original-1",
            studentUserId: "student-1",
            unmetPassCriteria: ["A.P1"],
            academic: {
              unitCode: "U1",
              unitEnglishTitle: "Unit",
              unitArabicTitle: "وحدة",
              assessmentCode: "ORIGINAL",
              assessmentEnglishTitle: "Original assessment",
              assessmentArabicTitle: "التقييم الأصلي",
            },
            availableScopes: [
              {
                assessmentScopeId: "scope-1",
                assessmentCode: "RETAKE",
                assessmentEnglishTitle: "Retake assignment",
                assessmentArabicTitle: "مهمة الإعادة",
                criterionCodes: ["A.P1"],
              },
            ],
          },
        ]);
      if (
        path === "/retakes/original-1/authorize" &&
        options?.method === "POST"
      )
        return Promise.resolve({ retakeEvaluationRequestId: "retake-1" });
      return Promise.reject(new Error("unexpected request"));
    });
    renderWithProviders(<RetakeManagement />, "en");
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByLabelText("Retake assignment"),
      "scope-1",
    );
    await user.type(
      screen.getByLabelText("Required staff rationale"),
      "LIV rationale",
    );
    await user.click(
      screen.getByRole("button", { name: "Authorize and create Retake" }),
    );
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/retakes/original-1/authorize",
        expect.objectContaining({
          body: JSON.stringify({
            retakeAssessmentScopeId: "scope-1",
            reason: "LIV rationale",
          }),
        }),
      ),
    );
    expect(await screen.findByText(/retake-1/)).toBeVisible();
    const authorizeCall = apiMock.mock.calls.find(
      ([path]) => path === "/retakes/original-1/authorize",
    );
    expect(String(authorizeCall?.[1]?.body)).not.toContain("price");
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
