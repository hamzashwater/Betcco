import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatLocalizedCurrency } from "@/i18n/number-format";
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

const evaluation = (
  id: string,
  status: string,
  price: number,
  modes: { isRetake?: boolean; isResit?: boolean } = {},
) => ({
  id,
  status,
  price,
  currency: "JOD",
  isRetake: modes.isRetake ?? false,
  isResit: modes.isResit ?? false,
  retakeOfEvaluationRequestId: modes.isRetake ? "original-request" : null,
  resitOfEvaluationRequestId: modes.isResit ? "original-request" : null,
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

function matchesNormalizedText(expected: string) {
  const normalizedExpected = expected.replace(/\s+/gu, " ").trim();
  return (_content: string, element: Element | null) =>
    element?.textContent?.replace(/\s+/gu, " ").trim() === normalizedExpected;
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

describe("student evaluation pagination", () => {
  it("offers the standard-draft resume route while preserving Retake and Resit actions", async () => {
    apiMock.mockImplementation((path: string) =>
      path === "/evaluations/mine?page=1&pageSize=20"
        ? Promise.resolve(
            page(
              [
                evaluation("standard-draft", "Draft", 5),
                evaluation("retake-draft", "Draft", 7, { isRetake: true }),
                evaluation("resit-draft", "Draft", 9, { isResit: true }),
              ],
              1,
              false,
            ),
          )
        : Promise.resolve([]),
    );
    renderWithProviders(<StudentArea segment={["evaluations"]} />);

    const resume = await screen.findByRole("link", {
      name: "Continue evaluation",
    });
    expect(resume).toHaveAttribute(
      "href",
      "/en/student/evaluations/new?resume=standard-draft",
    );
    expect(
      screen.getByRole("link", { name: "Continue Resit preparation" }),
    ).toHaveAttribute("href", "/en/student/evaluations/resit-draft");
    expect(screen.getByText("Retake evaluation")).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: "Continue evaluation" }),
    ).toHaveLength(1);
  });

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

    const firstPageAmount = matchesNormalizedText(
      formatLocalizedCurrency(5, "JOD", "en"),
    );
    const secondPageAmount = matchesNormalizedText(
      formatLocalizedCurrency(7, "JOD", "en"),
    );
    expect(await screen.findByText(firstPageAmount)).toBeVisible();
    expect(screen.queryByText(secondPageAmount)).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Load more requests" }));
    expect(await screen.findByText(secondPageAmount)).toBeVisible();
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
