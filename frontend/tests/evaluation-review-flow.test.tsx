import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { StudentArea } from "@/features/student/student-area";
import { TeacherArea } from "@/features/teacher/teacher-area";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

function renderWithProviders(
  node: React.ReactNode,
  locale: "en" | "ar" = "en",
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? arMessages : enMessages}
    >
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

describe("BETCCO assignment review flow", () => {
  it("shows the learner an advisory estimate and one revision check", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path !== "/evaluations/mine?page=1&pageSize=20")
        return Promise.resolve([]);
      return Promise.resolve({
        items: [
          {
            id: "evaluation-1",
            status: "NeedsRevision",
            price: 5,
            currency: "JOD",
            isRetake: false,
            retakeOfEvaluationRequestId: null,
            criteria: ["A.P1"],
            academic: null,
            selectedCriteria: ["A.P1"],
            submissionAttemptNumber: 1,
            calculatedGrade: "Pass",
            sectionResults: [{ section: "A", grade: "Pass" }],
            results: [
              {
                criterionCode: "A.P1",
                achievement: "Achieved",
                evidence: "Current evidence",
                comment: "Strengthen the example",
              },
            ],
            evidence: [],
            feedback: [
              {
                body: "Add one clearer example before your school submission.",
                requestsResubmission: true,
                createdAtUtc: "2026-09-25T17:00:00Z",
              },
            ],
          },
        ],
        page: 1,
        pageSize: 20,
        totalCount: 1,
        hasNextPage: false,
      });
    });

    renderWithProviders(<StudentArea segment={["evaluations"]} />);
    expect(
      await screen.findByText("Current BETCCO estimated result"),
    ).toBeVisible();
    expect(screen.getByText("Teacher feedback")).toBeVisible();
    expect(
      screen.getByText(
        "This is BETCCO guidance to help before your official school submission; it is not an official grade.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Submit revised assignment for checking"),
    ).toBeVisible();
  });

  it("lets the assigned teacher send feedback and open the one revision check", async () => {
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/evaluations/evaluation-1" && !options?.method)
        return Promise.resolve({
          id: "evaluation-1",
          status: "Assigned",
          isRetake: false,
          retakeOfEvaluationRequestId: null,
          studentComment: "Please review my work.",
          criteria: ["A.P1"],
          selectedCriteria: ["A.P1"],
          submissionAttemptNumber: 1,
          calculatedGrade: null,
          sectionResults: [],
          files: [],
          results: [],
          evidence: [],
          feedback: [],
        });
      if (
        path === "/evaluations/evaluation-1/review" &&
        options?.method === "POST"
      )
        return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    renderWithProviders(
      <TeacherArea segment={["evaluations", "evaluation-1"]} />,
    );
    const user = userEvent.setup();

    expect(await screen.findByText("BETCCO Initial Review")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Outcome"), "Achieved");
    await user.type(
      screen.getByLabelText("Teacher feedback"),
      "Add one clearer example before your school submission.",
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /Open the one revision check/,
      }),
    );
    await user.type(
      screen.getByLabelText("Revision check deadline"),
      "2030-01-03T12:00",
    );
    await user.click(
      screen.getByRole("button", { name: "Send review and feedback" }),
    );

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/evaluations/evaluation-1/review",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            results: [
              {
                criterionCode: "A.P1",
                achievement: "Achieved",
                evidence: null,
                comment: null,
              },
            ],
            feedback: "Add one clearer example before your school submission.",
            requestRevision: true,
            revisionDueAtUtc: new Date("2030-01-03T12:00").toISOString(),
          }),
        }),
      ),
    );
  });

  it("marks files uploaded after feedback as revised work for the final check", async () => {
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/evaluations/evaluation-1" && !options?.method)
        return Promise.resolve({
          id: "evaluation-1",
          status: "Assigned",
          isRetake: false,
          retakeOfEvaluationRequestId: null,
          studentComment: "Please review my revision.",
          criteria: ["A.P1"],
          selectedCriteria: ["A.P1"],
          submissionAttemptNumber: 2,
          calculatedGrade: "Pass",
          sectionResults: [{ section: "A", grade: "Pass" }],
          files: [
            {
              id: "file-original",
              originalFileName: "original.pdf",
              lengthBytes: 1024,
              createdAtUtc: "2026-09-25T16:00:00Z",
              scanStatus: "Clean",
            },
            {
              id: "file-revised",
              originalFileName: "revised.pdf",
              lengthBytes: 2048,
              createdAtUtc: "2026-09-25T18:00:00Z",
              scanStatus: "Clean",
            },
          ],
          results: [
            {
              criterionCode: "A.P1",
              achievement: "Achieved",
              evidence: "Current evidence",
              comment: "Review the revision",
            },
          ],
          evidence: [],
          feedback: [
            {
              body: "Please add one clearer example.",
              requestsResubmission: true,
              createdAtUtc: "2026-09-25T17:00:00Z",
            },
          ],
        });
      return Promise.resolve(undefined);
    });

    renderWithProviders(
      <TeacherArea segment={["evaluations", "evaluation-1"]} />,
    );

    expect(await screen.findByText("BETCCO Revision Check")).toBeVisible();
    expect(screen.getByText("revised.pdf")).toBeVisible();
    expect(screen.getByText("Revised file")).toBeVisible();
    expect(screen.getByText("original.pdf")).toBeVisible();
  });
});
