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
  it("sets a future target with an internal reason and filters overdue requests", async () => {
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === "PUT") return Promise.resolve(undefined);
      return Promise.resolve({
        items: path.includes("expectedCompletionState=Overdue")
          ? []
          : [
              {
                id: "12345678-1111-2222-3333-444444444444",
                status: "Assigned",
                updatedAtUtc: "2026-09-23T10:00:00Z",
                isRetake: false,
                qualificationCode: "Q",
                qualificationVersionCode: "V1",
                unitCode: "U1",
                unitEnglishTitle: "Unit",
                unitArabicTitle: "وحدة",
                evaluatorDisplayName: null,
                hasEligibleEvaluator: null,
                blockerCode: null,
                expectedCompletionAtUtc: null,
                expectedCompletionState: "NotSet",
              },
            ],
        page: 1,
        pageSize: 10,
        totalCount: path.includes("expectedCompletionState=Overdue") ? 0 : 1,
      });
    });
    renderQueue();
    const user = userEvent.setup();
    expect(await screen.findByText("Completion target not set")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Set completion target" }),
    );
    await user.type(
      screen.getByLabelText("Expected completion"),
      "2030-12-31T12:00",
    );
    await user.type(
      screen.getByLabelText("Internal reason"),
      "Coordination review",
    );
    await user.click(screen.getByRole("button", { name: "Save target" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/assessment-coordination/12345678-1111-2222-3333-444444444444/expected-completion",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const write = apiMock.mock.calls.find(
      ([, options]) => options?.method === "PUT",
    );
    expect(JSON.parse(write?.[1].body as string)).toEqual(
      expect.objectContaining({
        reason: "Coordination review",
      }),
    );
    expect(await screen.findByText("Completion target saved.")).toBeVisible();
    await user.selectOptions(
      screen.getByLabelText("Filter by completion target"),
      "Overdue",
    );
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/assessment-coordination/queue?page=1&pageSize=10&expectedCompletionState=Overdue",
      ),
    );
  });

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

  it("grants a staff-only reasonable adjustment for the one revision check deadline", async () => {
    const requestId = "12345678-1111-2222-3333-444444444444";
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path.includes("/reasonable-adjustments/revision-deadline")) {
        if (options?.method === "POST") return Promise.resolve(undefined);
        return Promise.resolve({
          evaluationRequestId: requestId,
          baseDueAtUtc: "2030-01-01T12:00:00Z",
          effectiveDueAtUtc: "2030-01-01T12:00:00Z",
          activeAdjustmentId: null,
          history: [],
        });
      }
      return Promise.resolve({
        items: [
          {
            id: requestId,
            status: "NeedsRevision",
            updatedAtUtc: "2026-09-23T10:00:00Z",
            isRetake: false,
            qualificationCode: "Q",
            qualificationVersionCode: "V1",
            unitCode: "U1",
            unitEnglishTitle: "Unit",
            unitArabicTitle: "وحدة",
            evaluatorDisplayName: "Assessor",
            hasEligibleEvaluator: null,
            blockerCode: null,
            expectedCompletionAtUtc: null,
            expectedCompletionState: "NotSet",
            revisionDueAtUtc: "2030-01-01T12:00:00Z",
            effectiveRevisionDueAtUtc: "2030-01-01T12:00:00Z",
            activeDeadlineAdjustmentId: null,
          },
        ],
        page: 1,
        pageSize: 10,
        totalCount: 1,
      });
    });

    renderQueue();
    const user = userEvent.setup();
    expect(
      await screen.findByText("One revision check deadline"),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Manage reasonable adjustment" }),
    );
    expect(await screen.findByText("No previous adjustments.")).toBeVisible();
    await user.type(
      screen.getByLabelText("Adjusted deadline"),
      "2030-01-03T12:00",
    );
    await user.type(
      screen.getByLabelText("Private staff reason"),
      "Approved access adjustment",
    );
    await user.click(screen.getByRole("button", { name: "Grant extension" }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        `/assessment-coordination/${requestId}/reasonable-adjustments/revision-deadline`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const write = apiMock.mock.calls.find(
      ([path, options]) =>
        path.includes("/reasonable-adjustments/revision-deadline") &&
        options?.method === "POST",
    );
    expect(JSON.parse(write?.[1].body as string)).toEqual(
      expect.objectContaining({ reason: "Approved access adjustment" }),
    );
  });
});
