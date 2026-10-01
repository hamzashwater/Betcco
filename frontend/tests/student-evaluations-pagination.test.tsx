import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatLocalizedCurrency } from "@/i18n/number-format";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { EvaluationAppeals } from "@/features/student/evaluation-appeals";
import { StudentArea } from "@/features/student/student-area";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

function renderWithProviders(
  node: React.ReactNode,
  locale: "en" | "ar" = "en",
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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

const evaluation = (
  id: string,
  status: string,
  price: number,
  modes: { isRetake?: boolean; isResit?: boolean } = {},
  overrides: Record<string, unknown> = {},
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
  ...overrides,
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
  it.each(["en", "ar"] as const)(
    "offers the %s standard-draft resume route while preserving Retake and Resit actions",
    async (locale) => {
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
      renderWithProviders(<StudentArea segment={["evaluations"]} />, locale);

      const resume = await screen.findByRole("link", {
        name: locale === "ar" ? "متابعة تجهيز التقييم" : "Continue evaluation",
      });
      expect(resume).toHaveAttribute(
        "href",
        "/" + locale + "/student/evaluations/new?resume=standard-draft",
      );
      expect(
        screen.getByRole("link", {
          name:
            locale === "ar"
              ? "متابعة تجهيز إعادة التقييم"
              : "Continue Resit preparation",
        }),
      ).toHaveAttribute(
        "href",
        "/" + locale + "/student/evaluations/resit-draft",
      );
      expect(
        screen.getByText(locale === "ar" ? "طلب Retake" : "Retake evaluation"),
      ).toBeVisible();
      expect(
        screen.getAllByRole("link", {
          name:
            locale === "ar" ? "متابعة تجهيز التقييم" : "Continue evaluation",
        }),
      ).toHaveLength(1);
    },
  );

  it.each(["en", "ar"] as const)(
    "renders %s result, feedback, evidence, and deadline copy without translating server values",
    async (locale) => {
      const labels =
        locale === "ar"
          ? {
              title: "طلبات التقييم",
              resit: "مراجعة Resit نهائية",
              original: "الطلب الأصلي: original",
              retake: "طلب Retake",
              passOnly: "النتيجة محدودة بـ Pass",
              results: "المعايير التي حققتها في المهمة",
              current: "النتيجة التقديرية الحالية من BETCCO",
              resitResult: "النتيجة الاستشارية النهائية للـ Resit",
              final: "النتيجة التقديرية النهائية من BETCCO",
              section: "القسم A: Pass",
              achieved: "مُحقَّق",
              notAchieved: "غير مُحقَّق بعد",
              guidance:
                "هذه نتيجة إرشادية من BETCCO لمساعدتك قبل التسليم الرسمي في المدرسة، وليست علامة رسمية.",
              evidence: "ملف الأدلة",
              feedback: "ملاحظات المعلم",
              deadline: "آخر موعد للمراجعة الثانية:",
              pending:
                "ستظهر النتيجة التقديرية وملاحظات المعلم بعد انتهاء مراجعة BETCCO.",
            }
          : {
              title: "Evaluation requests",
              resit: "Resit final review",
              original: "Original request: original",
              retake: "Retake evaluation",
              passOnly: "Pass-only outcome",
              results: "Criteria achieved in this task",
              current: "Current BETCCO estimated result",
              resitResult: "Final Resit advisory result",
              final: "Final BETCCO estimated result",
              section: "Section A: Pass",
              achieved: "Achieved",
              notAchieved: "Not achieved yet",
              guidance:
                "This is BETCCO guidance to help before your official school submission; it is not an official grade.",
              evidence: "Evidence portfolio",
              feedback: "Teacher feedback",
              deadline: "Revision check deadline:",
              pending:
                "Your estimated result and teacher feedback will appear after the BETCCO review.",
            };
      apiMock.mockImplementation((path: string) =>
        path === "/evaluations/mine?page=1&pageSize=20"
          ? Promise.resolve(
              page(
                [
                  evaluation(
                    "needs-revision",
                    "NeedsRevision",
                    10,
                    {},
                    {
                      calculatedGrade: "Merit",
                      effectiveRevisionDueAtUtc: "2030-01-02T15:00:00.000Z",
                      sectionResults: [{ section: "A", grade: "Pass" }],
                      results: [
                        {
                          criterionCode: "A.P1",
                          achievement: "Achieved",
                          evidence: null,
                          comment: "Server criterion comment",
                        },
                        {
                          criterionCode: "A.M1",
                          achievement: "NotAchieved",
                          evidence: null,
                          comment: null,
                        },
                      ],
                      evidence: [
                        {
                          criterionCode: "A.P1",
                          narrative: "Server evidence narrative",
                        },
                      ],
                      feedback: [
                        {
                          body: "Server teacher feedback",
                          requestsResubmission: true,
                          createdAtUtc: "2030-01-01T00:00:00.000Z",
                        },
                      ],
                    },
                  ),
                  evaluation(
                    "completed-resit",
                    "Completed",
                    20,
                    { isResit: true },
                    {
                      resitOfEvaluationRequestId: "original-request-1234",
                      calculatedGrade: "Distinction",
                      results: [
                        {
                          criterionCode: "B.P1",
                          achievement: "Achieved",
                          evidence: null,
                          comment: null,
                        },
                      ],
                    },
                  ),
                  evaluation(
                    "completed-standard",
                    "Completed",
                    30,
                    {},
                    {
                      calculatedGrade: "Pass",
                      results: [
                        {
                          criterionCode: "C.P1",
                          achievement: "Achieved",
                          evidence: null,
                          comment: null,
                        },
                      ],
                    },
                  ),
                  evaluation("completed-without-results", "Completed", 40),
                  evaluation("waiting", "Draft", 50),
                  evaluation("retake-completed", "Completed", 60, {
                    isRetake: true,
                  }),
                ],
                1,
                false,
              ),
            )
          : Promise.resolve([]),
      );
      renderWithProviders(<StudentArea segment={["evaluations"]} />, locale);
      expect(
        await screen.findByRole("heading", { name: labels.title }),
      ).toBeVisible();
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/evaluations/mine?page=1&pageSize=20",
        ),
      );
      expect(await screen.findByText("NeedsRevision")).toBeVisible();
      expect(screen.getByText(labels.resit)).toBeVisible();
      expect(screen.getByText(labels.original)).toBeVisible();
      expect(screen.getByText(labels.retake)).toBeVisible();
      expect(screen.getByText(labels.passOnly)).toBeVisible();
      expect(
        screen.getAllByRole("heading", { name: labels.results }),
      ).toHaveLength(3);
      expect(screen.getByText(labels.current)).toBeVisible();
      expect(screen.getByText(labels.resitResult)).toBeVisible();
      expect(screen.getByText(labels.final)).toBeVisible();
      expect(
        screen.getAllByText(matchesNormalizedText(labels.section)).at(-1),
      ).toBeVisible();
      expect(screen.getAllByText("Merit")).toHaveLength(1);
      expect(screen.getAllByText("Distinction")).toHaveLength(1);
      expect(screen.getAllByText("Pass")).toHaveLength(2);
      expect(screen.getAllByText(labels.achieved)).toHaveLength(3);
      expect(screen.getByText(labels.notAchieved)).toBeVisible();
      expect(screen.getByText("Server criterion comment")).toBeVisible();
      expect(screen.getAllByText(labels.guidance)).toHaveLength(3);
      expect(screen.getByText(labels.evidence)).toBeVisible();
      expect(screen.getByText("Server evidence narrative")).toBeVisible();
      expect(screen.getByText(labels.feedback)).toBeVisible();
      expect(screen.getByText("Server teacher feedback")).toBeVisible();
      expect(
        screen.getByText(
          matchesNormalizedText(
            labels.deadline +
              " " +
              formatLocalizedDateTime("2030-01-02T15:00:00.000Z", locale),
          ),
        ),
      ).toBeVisible();
      expect(screen.getByText(labels.pending)).toBeVisible();
      expect(screen.getByText("NeedsRevision")).toBeVisible();
      expect(screen.getAllByText("Completed")).toHaveLength(4);
    },
  );

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

  it.each(["en", "ar"] as const)(
    "shows %s pagination loading while fetching the next page",
    async (locale) => {
      const labels =
        locale === "ar"
          ? { more: "عرض المزيد من الطلبات", loading: "جارٍ التحميل…" }
          : { more: "Load more requests", loading: "Loading…" };
      let resolveNextPage: (value: ReturnType<typeof page>) => void = () => {};
      apiMock.mockImplementation((path: string) => {
        if (path === "/evaluations/mine?page=1&pageSize=20")
          return Promise.resolve(
            page([evaluation("latest", "Draft", 5)], 1, true),
          );
        if (path === "/evaluations/mine?page=2&pageSize=20")
          return new Promise<ReturnType<typeof page>>((resolve) => {
            resolveNextPage = resolve;
          });
        return Promise.resolve([]);
      });
      const user = userEvent.setup();
      renderWithProviders(<StudentArea segment={["evaluations"]} />, locale);
      await user.click(
        await screen.findByRole("button", { name: labels.more }),
      );
      const loading = screen.getByRole("button", { name: labels.loading });
      expect(loading).toBeDisabled();
      resolveNextPage(page([evaluation("older", "Draft", 7)], 2, false));
      expect(
        await screen.findByText(
          matchesNormalizedText(formatLocalizedCurrency(7, "JOD", locale)),
        ),
      ).toBeVisible();
    },
  );

  it.each(["en", "ar"] as const)(
    "localizes %s initial and next-page errors and keeps retry available",
    async (locale) => {
      const labels =
        locale === "ar"
          ? {
              initial: "تعذر تحميل الطلبات.",
              more: "عرض المزيد من الطلبات",
              nextError: "تعذر تحميل المزيد من الطلبات.",
            }
          : {
              initial: "Unable to load requests.",
              more: "Load more requests",
              nextError: "Unable to load more requests.",
            };
      apiMock.mockImplementation((path: string) =>
        path === "/evaluations/mine?page=1&pageSize=20"
          ? Promise.reject(new Error("Server request failure"))
          : Promise.resolve([]),
      );
      renderWithProviders(<StudentArea segment={["evaluations"]} />, locale);
      expect(
        await screen.findByText(labels.initial, {}, { timeout: 10_000 }),
      ).toBeVisible();
      cleanup();
      let nextPageAttempts = 0;
      apiMock.mockImplementation((path: string) => {
        if (path === "/evaluations/mine?page=1&pageSize=20")
          return Promise.resolve(
            page([evaluation("latest", "Draft", 5)], 1, true),
          );
        if (path === "/evaluations/mine?page=2&pageSize=20") {
          nextPageAttempts += 1;
          return nextPageAttempts <= 4
            ? Promise.reject(new Error("Server page failure"))
            : Promise.resolve(
                page([evaluation("older", "Draft", 7)], 2, false),
              );
        }
        return Promise.resolve([]);
      });
      const user = userEvent.setup();
      renderWithProviders(<StudentArea segment={["evaluations"]} />, locale);
      await user.click(
        await screen.findByRole("button", { name: labels.more }),
      );
      expect(
        await screen.findByRole("alert", {}, { timeout: 10_000 }),
      ).toHaveTextContent(labels.nextError);
      await user.click(screen.getByRole("button", { name: labels.more }));
      expect(
        await screen.findByText(
          matchesNormalizedText(formatLocalizedCurrency(7, "JOD", locale)),
        ),
      ).toBeVisible();
    },
    20_000,
  );

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

describe.each(["en", "ar"] as const)(
  "evaluation appeals localization in %s",
  (locale) => {
    const copy =
      locale === "ar"
        ? {
            title: "الاستئنافات الأكاديمية",
            released: "التقييم المنشور",
            outcome: "النتيجة",
            reason: "سبب الاستئناف",
            submit: "إرسال الاستئناف",
            appeals: "استئنافاتك",
            decision: "قرار المراجع: ",
            withdraw: "سحب الاستئناف",
            loadError: "تعذر تحميل الاستئنافات.",
          }
        : {
            title: "Academic appeals",
            released: "Released evaluation",
            outcome: "Outcome",
            reason: "Reason for appeal",
            submit: "Submit appeal",
            appeals: "Your appeals",
            decision: "Reviewer decision: ",
            withdraw: "Withdraw appeal",
            loadError: "Unable to load appeals.",
          };
    const completedId = "abcdefgh-1111-2222-3333-444444444444";
    const completed = evaluation(
      "abcdefgh-1111-2222-3333-444444444444",
      "Completed",
      5,
      {},
      {
        calculatedGrade: "Distinction",
      },
    );
    const submittedAppeal = {
      id: "appeal-1",
      evaluationRequestId: completedId,
      status: "Submitted",
      reason: "Raw student reason",
      decisionRationale: "Raw reviewer rationale",
      createdAtUtc: "2026-09-30T12:34:00Z",
      reviewedAtUtc: null,
      withdrawnAtUtc: null,
    };

    it("renders localized framing while preserving raw appeal values", async () => {
      apiMock.mockImplementation((path: string) => {
        if (path === "/evaluations/mine?page=1&pageSize=20")
          return Promise.resolve(page([completed], 1, false));
        if (path === "/evaluation-appeals/mine")
          return Promise.resolve([submittedAppeal]);
        return Promise.resolve([]);
      });
      renderWithProviders(<EvaluationAppeals />, locale);
      expect(
        await screen.findByRole("heading", { level: 1, name: copy.title }),
      ).toBeVisible();
      expect(
        await screen.findByRole("option", {
          name: `${copy.outcome} Distinction · abcdefgh`,
        }),
      ).toHaveValue(completedId);
      expect(screen.getByText("Submitted")).toBeVisible();
      expect(screen.getByText("Raw student reason")).toBeVisible();
      expect(
        screen.getByText(
          matchesNormalizedText(`${copy.decision}Raw reviewer rationale`),
        ),
      ).toBeVisible();
      expect(
        screen.getByText(
          matchesNormalizedText(
            formatLocalizedDateTime(submittedAppeal.createdAtUtc, locale),
          ),
        ),
      ).toBeVisible();
      expect(screen.getByRole("button", { name: copy.withdraw })).toBeVisible();
      expect(
        screen.queryByText(completedId, { exact: false }),
      ).not.toBeInTheDocument();
    });
    it("preserves the create contract and trims the submitted reason", async () => {
      apiMock.mockImplementation((path: string) => {
        if (path === "/evaluations/mine?page=1&pageSize=20")
          return Promise.resolve(page([completed], 1, false));
        if (path === "/evaluation-appeals/mine") return Promise.resolve([]);
        if (path === "/evaluation-appeals")
          return Promise.resolve(submittedAppeal);
        return Promise.resolve([]);
      });
      renderWithProviders(<EvaluationAppeals />, locale);
      const user = userEvent.setup();
      await screen.findByRole("option", {
        name: `${copy.outcome} Distinction · abcdefgh`,
      });
      await user.selectOptions(
        screen.getByLabelText(copy.released),
        completedId,
      );
      await user.type(
        screen.getByRole("textbox"),
        "  Documented appeal reason  ",
      );
      await user.click(screen.getByRole("button", { name: copy.submit }));
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith("/evaluation-appeals", {
          method: "POST",
          body: JSON.stringify({
            evaluationRequestId: completedId,
            reason: "Documented appeal reason",
          }),
        }),
      );
    });

    it("preserves withdraw and localizes appeal-load failures", async () => {
      let failAppeals = false;
      apiMock.mockImplementation((path: string) => {
        if (path === "/evaluations/mine?page=1&pageSize=20")
          return Promise.resolve(page([completed], 1, false));
        if (path === "/evaluation-appeals/mine")
          return failAppeals
            ? Promise.reject(new Error("private backend detail"))
            : Promise.resolve([submittedAppeal]);
        if (path === "/evaluation-appeals/appeal-1/withdraw")
          return Promise.resolve(undefined);
        return Promise.resolve([]);
      });
      const view = renderWithProviders(<EvaluationAppeals />, locale);
      await userEvent
        .setup()
        .click(await screen.findByRole("button", { name: copy.withdraw }));
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/evaluation-appeals/appeal-1/withdraw",
          { method: "POST" },
        ),
      );
      view.unmount();
      cleanup();
      apiMock.mockReset();
      failAppeals = true;
      apiMock.mockImplementation((path: string) => {
        if (path === "/evaluations/mine?page=1&pageSize=20")
          return Promise.resolve(page([completed], 1, false));
        if (path === "/evaluation-appeals/mine")
          return Promise.reject(new Error("private backend detail"));
        return Promise.resolve([]);
      });
      renderWithProviders(<EvaluationAppeals />, locale);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy.loadError,
      );
      expect(
        screen.queryByText("private backend detail"),
      ).not.toBeInTheDocument();
    });
  },
);
