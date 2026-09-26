import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import enMessages from "../messages/en.json";
import { EvaluationAppeals } from "@/features/student/evaluation-appeals";
import { StudentArea } from "@/features/student/student-area";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

function renderWithProviders(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const evaluation = (id: string, status: string, price: number) => ({
  id,
  status,
  price,
  currency: "JOD",
  isRetake: false,
  retakeOfEvaluationRequestId: null,
  criteria: [],
  academic: null,
  selectedCriteria: [],
  submissionAttemptNumber: 1,
  revisionDueAtUtc: null,
  effectiveRevisionDueAtUtc: null,
  calculatedGrade: status === "Completed" ? "Pass" : null,
  sectionResults: [],
  results: [],
  evidence: [],
  feedback: [],
});

const page = (
  items: ReturnType<typeof evaluation>[],
  number: number,
  hasNextPage: boolean,
) => ({
  items,
  page: number,
  pageSize: 20,
  totalCount: 2,
  hasNextPage,
});

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

describe("student evaluation pagination", () => {
  it("loads older evaluation cards only when requested", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/evaluations/mine?page=1&pageSize=20")
        return Promise.resolve(
          page([evaluation("latest", "Draft", 5)], 1, true),
        );
      if (path === "/evaluations/mine?page=2&pageSize=20")
        return Promise.resolve(
          page([evaluation("older", "Draft", 7)], 2, false),
        );
      return Promise.resolve([]);
    });
    renderWithProviders(<StudentArea segment={["evaluations"]} />);

    expect(await screen.findByText("5.000 JOD")).toBeVisible();
    expect(screen.queryByText("7.000 JOD")).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Load more requests" }));
    expect(await screen.findByText("7.000 JOD")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Load more requests" }),
    ).not.toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(
      "/evaluations/mine?page=2&pageSize=20",
    );
  });

  it("keeps older completed evaluations reachable in the appeal selector", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/evaluations/mine?page=1&pageSize=20")
        return Promise.resolve(
          page([evaluation("latest-draft", "Draft", 5)], 1, true),
        );
      if (path === "/evaluations/mine?page=2&pageSize=20")
        return Promise.resolve(
          page([evaluation("older-completed", "Completed", 7)], 2, false),
        );
      if (path === "/evaluation-appeals/mine") return Promise.resolve([]);
      return Promise.resolve([]);
    });
    renderWithProviders(<EvaluationAppeals />);

    expect(
      await screen.findByRole("button", { name: "Load more evaluations" }),
    ).toBeVisible();
    expect(
      screen.queryByText(
        "There are no released evaluations available for appeal right now.",
      ),
    ).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Load more evaluations" }));
    expect(
      await screen.findByRole("option", { name: /Outcome Pass/ }),
    ).toBeVisible();
  });
});
