import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import enMessages from "../messages/en.json";
import arMessages from "../messages/ar.json";
import {
  StudentResitDetail,
  StudentResitOpportunities,
} from "@/features/student/student-resit-workflow";
import { StudentArea } from "@/features/student/student-area";

const push = vi.hoisted(() => vi.fn());
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  ApiError: class ApiError extends Error {},
}));

function renderPage(node: React.ReactNode, locale: "en" | "ar" = "en") {
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

const authorized = {
  authorizationId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  originalEvaluationRequestId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  resitEvaluationRequestId: null,
  authorizedAtUtc: "2026-09-27T00:00:00Z",
  activatedAtUtc: null,
  state: "Authorized",
  academic: null,
};

afterEach(() => {
  cleanup();
  apiMock.mockReset();
  push.mockReset();
});

describe("student Resit workflow", () => {
  it("keeps authorization discovery available when evaluation history fails", async () => {
    apiMock.mockImplementation((path: string) =>
      path.includes("/resit-authorizations")
        ? Promise.resolve({
            items: [authorized],
            page: 1,
            pageSize: 10,
            hasNextPage: false,
          })
        : Promise.reject(new Error("history unavailable")),
    );
    renderPage(<StudentArea segment={["evaluations"]} />);
    expect(
      await screen.findByRole("button", { name: "Start Resit" }),
    ).toBeVisible();
  });

  it.each(["en", "ar"] as const)(
    "activates an owned opportunity bodylessly and opens its draft in %s",
    async (locale) => {
      apiMock.mockImplementation((path: string) =>
        path.includes("/activate")
          ? Promise.resolve({
              status: "AlreadyActivated",
              resitEvaluationRequestId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
            })
          : Promise.resolve({
              items: [authorized],
              page: 1,
              pageSize: 10,
              hasNextPage: false,
            }),
      );
      renderPage(<StudentResitOpportunities />, locale);
      await userEvent.setup().click(
        await screen.findByRole("button", {
          name: locale === "ar" ? "بدء إعادة التقييم" : "Start Resit",
        }),
      );
      await waitFor(() =>
        expect(push).toHaveBeenCalledWith(
          `/${locale}/student/evaluations/cccccccc-cccc-cccc-cccc-cccccccccccc`,
        ),
      );
      expect(apiMock).toHaveBeenCalledWith(
        `/student/resit-authorizations/${authorized.authorizationId}/activate`,
        { method: "POST" },
      );
      expect(apiMock).toHaveBeenCalledWith(
        "/student/resit-authorizations?page=1&pageSize=10",
      );
    },
  );

  it("shows activated and revoked states without an activation action or staff rationale", async () => {
    apiMock.mockResolvedValue({
      items: [
        {
          ...authorized,
          state: "Activated",
          resitEvaluationRequestId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        },
        {
          ...authorized,
          authorizationId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
          state: "Revoked",
        },
      ],
      page: 1,
      pageSize: 10,
      hasNextPage: false,
    });
    renderPage(<StudentResitOpportunities />);
    expect(
      await screen.findByRole("link", { name: "Open Resit draft" }),
    ).toHaveAttribute(
      "href",
      "/en/student/evaluations/cccccccc-cccc-cccc-cccc-cccccccccccc",
    );
    expect(
      screen.getByText("This Resit opportunity is no longer available."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Start Resit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/rationale|revocation reason/i),
    ).not.toBeInTheDocument();
  });

  it("persists fresh files, criterion evidence and originality without any payment call", async () => {
    let detail = {
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      status: "Draft",
      isResit: true,
      resitOfEvaluationRequestId: authorized.originalEvaluationRequestId,
      academic: null,
      criteria: ["A.P1"],
      files: [] as {
        id: string;
        originalFileName: string;
        scanStatus: string;
        createdAtUtc: string;
      }[],
      evidence: [] as { criterionCode: string; narrative: string }[],
      hasAuthenticityDeclaration: false,
      calculatedGrade: null,
      sectionResults: [],
      results: [],
      feedback: [],
    };
    apiMock.mockImplementation((path: string) => {
      if (path === `/evaluations/${detail.id}`) return Promise.resolve(detail);
      if (path.endsWith("/files"))
        detail = {
          ...detail,
          files: [
            {
              id: "file-1",
              originalFileName: "fresh.pdf",
              scanStatus: "Clean",
              createdAtUtc: "2026-09-27T00:00:00Z",
            },
          ],
        };
      if (path.endsWith("/evidence"))
        detail = {
          ...detail,
          evidence: [{ criterionCode: "A.P1", narrative: "Fresh work" }],
        };
      if (path.endsWith("/authenticity-declaration"))
        detail = { ...detail, hasAuthenticityDeclaration: true };
      return Promise.resolve(undefined);
    });
    renderPage(<StudentResitDetail evaluationId={detail.id} />);
    expect(await screen.findByText("Prepare Resit evidence")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Choose Fresh Resit files"), {
      target: {
        files: [
          new File(["content"], "fresh.pdf", { type: "application/pdf" }),
        ],
      },
    });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Upload files" }));
    expect(await screen.findByText(/fresh.pdf · Clean/)).toBeVisible();
    await userEvent
      .setup()
      .type(
        screen.getByRole("textbox", { name: "Evidence for A.P1" }),
        "Fresh work",
      );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Save evidence" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        `/evaluations/${detail.id}/evidence`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await userEvent.setup().click(screen.getByRole("checkbox"));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Confirm originality" }));
    expect(await screen.findByText("Originality confirmed")).toBeVisible();
    expect(screen.getByText("Preparation complete.")).toBeVisible();
    expect(
      screen.getByText(/Payment and submission will become available/),
    ).toBeVisible();
    expect(
      apiMock.mock.calls.some(([path]) =>
        /\/checkout|included-credit|\/payments\//.test(path),
      ),
    ).toBe(false);
  });

  it("keeps completed Resit results separate and blocks revision UI for corrupted Resit state", async () => {
    const historyItem = {
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      status: "Completed",
      price: 5,
      currency: "JOD",
      isRetake: false,
      isResit: true,
      resitOfEvaluationRequestId: authorized.originalEvaluationRequestId,
      criteria: ["A.P1"],
      academic: null,
      selectedCriteria: [],
      submissionAttemptNumber: 1,
      revisionDueAtUtc: null,
      effectiveRevisionDueAtUtc: null,
      calculatedGrade: "Pass",
      sectionResults: [{ section: "Outcome", grade: "Pass" }],
      results: [
        {
          criterionCode: "A.P1",
          achievement: "Achieved",
          evidence: null,
          comment: null,
        },
      ],
      evidence: [],
      feedback: [
        {
          body: "Final feedback",
          requestsResubmission: false,
          createdAtUtc: "2026-09-27T00:00:00Z",
        },
      ],
    };
    apiMock.mockImplementation((path: string) =>
      path.includes("/resit-authorizations")
        ? Promise.resolve({
            items: [],
            page: 1,
            pageSize: 10,
            hasNextPage: false,
          })
        : Promise.resolve({
            items: [historyItem],
            page: 1,
            pageSize: 20,
            totalCount: 1,
            hasNextPage: false,
          }),
    );
    const view = renderPage(<StudentArea segment={["evaluations"]} />);
    expect(
      await screen.findByText("Final Resit advisory result"),
    ).toBeVisible();
    expect(screen.getByText("Original request: bbbbbbbb")).toBeVisible();
    expect(screen.getByText("Final feedback")).toBeVisible();
    expect(screen.getByText(/not an official grade/)).toBeVisible();
    expect(
      screen.queryByText("Submit revised assignment for checking"),
    ).not.toBeInTheDocument();
    view.unmount();

    apiMock.mockImplementation((path: string) =>
      path.includes("/resit-authorizations")
        ? Promise.resolve({
            items: [],
            page: 1,
            pageSize: 10,
            hasNextPage: false,
          })
        : Promise.resolve({
            items: [{ ...historyItem, status: "NeedsRevision" }],
            page: 1,
            pageSize: 20,
            totalCount: 1,
            hasNextPage: false,
          }),
    );
    renderPage(<StudentArea segment={["evaluations"]} />);
    expect(await screen.findByText("Resit final review")).toBeVisible();
    expect(
      screen.queryByText("Submit revised assignment for checking"),
    ).not.toBeInTheDocument();
    cleanup();

    apiMock.mockImplementation((path: string) =>
      path.includes("/resit-authorizations")
        ? Promise.resolve({
            items: [],
            page: 1,
            pageSize: 10,
            hasNextPage: false,
          })
        : Promise.resolve({
            items: [{ ...historyItem, status: "Draft", isRetake: true }],
            page: 1,
            pageSize: 20,
            totalCount: 1,
            hasNextPage: false,
          }),
    );
    renderPage(<StudentArea segment={["evaluations"]} />);
    expect(
      await screen.findByRole("link", { name: "Continue Resit preparation" }),
    ).toBeVisible();
    expect(
      screen.queryByText("Submit and pay for Retake"),
    ).not.toBeInTheDocument();
  });
});
