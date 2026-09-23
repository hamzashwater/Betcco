import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import enMessages from "../messages/en.json";
import arMessages from "../messages/ar.json";
import { AssessmentCoordinationQueue } from "@/features/admin/assessment-coordination-queue";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: apiMock,
}));

function renderQueue(locale: "en" | "ar" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? arMessages : enMessages}
    >
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <AssessmentCoordinationQueue />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

describe("Assessment coordination queue", () => {
  it("shows bounded requests and uses a server-side status filter", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve({
        items: path.includes("status=Assigned")
          ? []
          : [
              {
                id: "12345678-1111-2222-3333-444444444444",
                status: "PendingAssignment",
                updatedAtUtc: "2026-09-23T10:00:00Z",
                isRetake: true,
                qualificationCode: "Q",
                qualificationVersionCode: "V1",
                unitCode: "U1",
                unitEnglishTitle: "Unit",
                unitArabicTitle: "وحدة",
                evaluatorDisplayName: null,
                hasEligibleEvaluator: true,
                blockerCode: null,
              },
            ],
        page: 1,
        pageSize: 10,
        totalCount: path.includes("status=Assigned") ? 0 : 1,
      }),
    );
    renderQueue();
    expect(await screen.findByText(/Q V1 · U1 Unit/)).toBeVisible();
    expect(screen.getByText("Retake")).toBeVisible();
    expect(screen.getByText(/eligible evaluator is available/)).toBeVisible();
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText("Filter by status"),
      "Assigned",
    );
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/assessment-coordination/queue?page=1&pageSize=10&status=Assigned",
      ),
    );
    expect(
      await screen.findByText("No requests match this status."),
    ).toBeVisible();
  });

  it("shows a localized mapping blocker in Arabic", async () => {
    apiMock.mockResolvedValue({
      items: [
        {
          id: "12345678-1111-2222-3333-444444444444",
          status: "PendingAssignment",
          updatedAtUtc: "2026-09-23T10:00:00Z",
          isRetake: false,
          qualificationCode: null,
          qualificationVersionCode: null,
          unitCode: null,
          unitEnglishTitle: null,
          unitArabicTitle: null,
          evaluatorDisplayName: null,
          hasEligibleEvaluator: null,
          blockerCode: "AcademicMappingRequired",
        },
      ],
      page: 1,
      pageSize: 10,
      totalCount: 1,
    });
    renderQueue("ar");
    expect(
      await screen.findByText("يلزم ربط أكاديمي معتمد قبل الإسناد."),
    ).toBeVisible();
    expect(screen.getByLabelText("تصفية حسب الحالة")).toBeVisible();
  });
});
