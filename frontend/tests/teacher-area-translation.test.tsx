import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { TeacherArea } from "@/features/teacher/teacher-area";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import {
  formatLocalizedCurrency,
  formatLocalizedPercentage,
} from "@/i18n/number-format";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

type Locale = "ar" | "en";
const clients: QueryClient[] = [];
function renderArea(segment: string[], locale: Locale) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const messages = locale === "ar" ? arMessages : enMessages;
  const view = render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <TeacherArea segment={segment} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...view, client, copy: messages.teacherWorkspace };
}

const courses = [
  {
    id: "raw-course",
    arabicTitle: "عنوان الخادم",
    englishTitle: "Server course title",
    status: "Draft",
    price: 10,
    isFree: false,
    hasCover: true,
    moduleCount: 1,
    lessonCount: 2,
  },
];
const analytics = {
  courses: 1,
  students: 7,
  pendingReviews: 2,
  averageLessonProgress: 36.5,
  studentsAtRisk: [],
  studentsAtRiskCount: 0,
};
const wallet = {
  availableBalance: 25.125,
  totalEarned: 35.125,
  totalWithdrawn: -10,
  currency: "JOD",
  transactions: [
    {
      id: "raw-transaction",
      type: "Credit",
      amount: 35.125,
      currency: "JOD",
      description: "RAW transaction وصف",
      createdAtUtc: "2026-09-25T12:00:00Z",
    },
  ],
  payouts: [
    {
      id: "raw-payout",
      amount: 10,
      currency: "JOD",
      method: "BankTransfer",
      destinationMasked: "RAW **1234",
      status: "Pending",
      reviewNote: "RAW reviewer note",
      createdAtUtc: "2026-09-25T12:00:00Z",
    },
  ],
};
const detail = {
  id: "evaluation-1",
  status: "Assigned",
  isRetake: false,
  isResit: false,
  resitOfEvaluationRequestId: null as string | null,
  retakeOfEvaluationRequestId: null as string | null,
  studentComment: "RAW student note ملاحظة",
  criteria: ["A.P1"],
  selectedCriteria: ["A.P1"],
  submissionAttemptNumber: 1,
  revisionDueAtUtc: null,
  effectiveRevisionDueAtUtc: null,
  calculatedGrade: "RAW grade",
  sectionResults: [{ section: "B", grade: "RAW section grade" }],
  files: [
    {
      id: "raw-file",
      originalFileName: "RAW ملف.pdf",
      lengthBytes: 2048,
      createdAtUtc: "2026-09-25T18:00:00Z",
      scanStatus: "RAW scan",
    },
  ],
  results: [] as {
    criterionCode: string;
    achievement: string;
    evidence: string;
    comment: string;
  }[],
  evidence: [{ criterionCode: "A.P1", narrative: "RAW evidence نص" }],
  feedback: [
    {
      body: "RAW feedback تعليق",
      requestsResubmission: true,
      createdAtUtc: "2026-09-25T17:00:00Z",
    },
  ],
};
function mockDetail(value = detail) {
  apiMock.mockImplementation((path: string, options?: RequestInit) => {
    if (path === "/evaluations/evaluation-1" && !options?.method)
      return Promise.resolve(value);
    if (options?.method === "POST") return Promise.resolve(undefined);
    throw new Error(`Unexpected endpoint: ${path}`);
  });
}
function writes(path: string) {
  return apiMock.mock.calls.filter(
    ([url, options]) => url === path && options?.method === "POST",
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  apiMock.mockReset();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
});

describe.each(["en", "ar"] as const)(
  "Teacher area translation and contracts (%s)",
  (locale) => {
    it("renders dashboard messages, server course titles, metrics, exact query keys and destinations", async () => {
      apiMock.mockImplementation((path: string) =>
        Promise.resolve(path === "/teacher/courses" ? courses : analytics),
      );
      const { client, copy } = renderArea([], locale);
      expect(
        screen.getByRole("heading", {
          name: locale === "ar" ? "لوحة المعلم" : "Teacher dashboard",
        }),
      ).toBeVisible();
      expect(
        await screen.findByText(
          locale === "ar" ? "عنوان الخادم" : "Server course title",
        ),
      ).toBeVisible();
      for (const key of [
        "drafts",
        "publishedCourses",
        "enrolledStudents",
        "averageProgress",
        "studentsNeedingAttention",
      ] as const)
        expect(screen.getByText(copy.dashboard[key])).toBeVisible();
      expect(
        screen.getByText(formatLocalizedPercentage(36.5, locale)),
      ).toBeVisible();
      expect(apiMock).toHaveBeenCalledWith("/teacher/courses");
      expect(apiMock).toHaveBeenCalledWith("/teacher/analytics");
      expect(client.getQueryData(["teacher-courses"])).toEqual(courses);
      expect(client.getQueryData(["teacher-analytics"])).toEqual(analytics);
      const destinations = screen
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"));
      for (const target of ["courses", "courses/new", "evaluations", "wallet"])
        expect(destinations).toContain(`/${locale}/teacher/${target}`);
      expect(screen.getAllByText(copy.shared.open)).toHaveLength(4);
    });

    it("preserves dashboard pending metrics and empty/error fallbacks", async () => {
      const pending = deferred<unknown>();
      apiMock.mockReturnValue(pending.promise);
      const { container, client, copy } = renderArea([], locale);
      expect(screen.getAllByText("—")).toHaveLength(7);
      await act(async () => pending.resolve([]));
      await act(async () => {
        client.setQueryData(["teacher-analytics"], analytics);
      });
      await waitFor(() =>
        expect(container.querySelector('[aria-busy="true"]')).toBeNull(),
      );
      expect(screen.getByText(copy.dashboard.drafts)).toBeVisible();
      expect(screen.queryByText("Server course title")).not.toBeInTheDocument();
      // The dashboard owns no separate error alert; the existing course summary does.
      apiMock.mockRejectedValue(new Error("RAW fetch failure"));
      await act(async () => {
        await client.refetchQueries();
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(
        locale === "ar"
          ? "تعذر تحميل دوراتك"
          : "Your courses could not be loaded.",
      );
      expect(
        screen.getByRole("heading", { name: copy.dashboard.title }),
      ).toBeVisible();
    });

    it("renders wallet messages, formatted money/dates and raw transaction/payout values", async () => {
      apiMock.mockResolvedValue(wallet);
      const { client, copy } = renderArea(["wallet"], locale);
      expect(await screen.findByLabelText(copy.wallet.amount)).toHaveAttribute(
        "min",
        "0.001",
      );
      expect(screen.getByLabelText(copy.wallet.amount)).toHaveAttribute(
        "max",
        "25.125",
      );
      expect(screen.getByLabelText(copy.wallet.amount)).toHaveAttribute(
        "step",
        "0.001",
      );
      expect(
        screen.getByText(wallet.transactions[0].description),
      ).toBeVisible();
      expect(
        screen.getByText(
          formatLocalizedDateTime(wallet.transactions[0].createdAtUtc, locale),
        ),
      ).toBeVisible();
      expect(
        screen.getByText(
          (_, element) =>
            element?.textContent ===
            formatLocalizedCurrency(wallet.availableBalance, "JOD", locale),
        ),
      ).toBeVisible();
      expect(
        screen.getByText(`${copy.wallet.bankTransfer} — RAW **1234`),
      ).toBeVisible();
      expect(screen.getByText("Pending — RAW reviewer note")).toBeVisible();
      expect(screen.getByText(copy.wallet.teacherShare)).toBeVisible();
      expect(apiMock).toHaveBeenCalledWith("/teacher/wallet");
      expect(client.getQueryData(["teacher-wallet"])).toEqual(wallet);
      const methods = within(
        screen.getByLabelText(copy.wallet.method),
      ).getAllByRole("option");
      expect(methods.map((option) => option.getAttribute("value"))).toEqual([
        "BankTransfer",
        "EWallet",
      ]);
    });

    it("reuses a withdrawal key after failure, clears fields/key on success and invalidates only the wallet", async () => {
      const firstKey = "11111111-1111-4111-8111-111111111111";
      const nextKey = "22222222-2222-4222-8222-222222222222";
      const uuid = vi
        .spyOn(crypto, "randomUUID")
        .mockReturnValueOnce(firstKey)
        .mockReturnValueOnce(nextKey);
      const pending = deferred<unknown>();
      let attempts = 0;
      apiMock.mockImplementation((path: string, options?: RequestInit) => {
        if (path === "/teacher/wallet") return Promise.resolve(wallet);
        if (
          path === "/teacher/wallet/withdrawals" &&
          options?.method === "POST"
        ) {
          attempts += 1;
          return attempts === 1
            ? Promise.reject(new Error("RAW withdrawal failure"))
            : attempts === 2
              ? pending.promise
              : Promise.resolve({});
        }
        throw new Error(`Unexpected endpoint: ${path}`);
      });
      const { client, copy } = renderArea(["wallet"], locale);
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const user = userEvent.setup();
      const amount = await screen.findByLabelText(copy.wallet.amount);
      await user.type(amount, "2.125");
      await user.selectOptions(
        screen.getByLabelText(copy.wallet.method),
        "EWallet",
      );
      const destination = screen.getByLabelText(copy.wallet.eWalletDestination);
      await user.type(destination, "RAW-wallet-1234");
      await user.click(
        screen.getByRole("button", { name: copy.wallet.submit }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "RAW withdrawal failure",
      );
      expect(uuid).toHaveBeenCalledTimes(1);
      expect(amount).toHaveValue(2.125);
      await user.click(
        screen.getByRole("button", { name: copy.wallet.submit }),
      );
      expect(
        await screen.findByRole("button", { name: copy.wallet.submitting }),
      ).toBeDisabled();
      expect(
        writes("/teacher/wallet/withdrawals").map(([, options]) =>
          JSON.parse(options.body),
        ),
      ).toEqual([
        {
          amount: 2.125,
          method: "EWallet",
          destination: "RAW-wallet-1234",
          idempotencyKey: firstKey,
        },
        {
          amount: 2.125,
          method: "EWallet",
          destination: "RAW-wallet-1234",
          idempotencyKey: firstKey,
        },
      ]);
      await act(async () => pending.resolve({}));
      await waitFor(() => expect(amount).toHaveValue(null));
      expect(destination).toHaveValue("");
      expect(invalidate).toHaveBeenCalledExactlyOnceWith({
        queryKey: ["teacher-wallet"],
      });
      expect(
        apiMock.mock.calls.filter(([path]) => path === "/teacher/wallet"),
      ).toHaveLength(2);
      await user.type(amount, "1");
      await user.type(destination, "RAW-next-5678");
      await user.click(
        screen.getByRole("button", { name: copy.wallet.submit }),
      );
      await waitFor(() =>
        expect(writes("/teacher/wallet/withdrawals")).toHaveLength(3),
      );
      expect(
        JSON.parse(writes("/teacher/wallet/withdrawals")[2][1].body)
          .idempotencyKey,
      ).toBe(nextKey);
      expect(uuid).toHaveBeenCalledTimes(2);
    });

    it("localizes wallet empty/non-Error mutation states and preserves zero-balance disablement", async () => {
      apiMock.mockImplementation((path: string) =>
        path === "/teacher/wallet"
          ? Promise.resolve({ ...wallet, transactions: [], payouts: [] })
          : Promise.reject("unstructured"),
      );
      const { client, copy } = renderArea(["wallet"], locale);
      expect(await screen.findByText(copy.wallet.noTransactions)).toBeVisible();
      expect(screen.getByText(copy.wallet.noWithdrawals)).toBeVisible();
      const user = userEvent.setup();
      await user.type(screen.getByLabelText(copy.wallet.amount), "1");
      await user.type(
        screen.getByLabelText(copy.wallet.bankDestination),
        "RAW-bank-1234",
      );
      await user.click(
        screen.getByRole("button", { name: copy.wallet.submit }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy.wallet.submitError,
      );
      await act(async () => {
        client.setQueryData(["teacher-wallet"], {
          ...wallet,
          availableBalance: 0,
        });
      });
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: copy.wallet.submit }),
        ).toBeDisabled(),
      );
    });

    it.each(["wallet", "evaluations", "review"] as const)(
      "preserves loading and localized fetch error for %s",
      async (area) => {
        const pending = deferred<unknown>();
        apiMock.mockReturnValue(pending.promise);
        const segment =
          area === "review" ? ["evaluations", "evaluation-1"] : [area];
        const { container, copy } = renderArea(segment, locale);
        expect(container.querySelector('[aria-busy="true"]')).toHaveTextContent(
          copy.shared.loading,
        );
        await act(async () => pending.reject(new Error("RAW backend error")));
        expect(await screen.findByRole("alert")).toHaveTextContent(
          area === "wallet"
            ? copy.wallet.loadError
            : area === "evaluations"
              ? copy.evaluations.loadError
              : copy.evaluationReview.unavailable,
        );
        expect(screen.queryByText("RAW backend error")).not.toBeInTheDocument();
      },
    );

    it("renders exactly assigned evaluations with raw statuses/notes and existing review links", async () => {
      const assigned = [
        { ...detail, id: "standard", filesCount: 2 },
        {
          ...detail,
          id: "resit",
          isResit: true,
          resitOfEvaluationRequestId: "original-raw-request",
          studentComment: "",
          filesCount: 1,
        },
        { ...detail, id: "historical", isRetake: true, filesCount: 0 },
      ];
      apiMock.mockResolvedValue(assigned);
      const { client, copy } = renderArea(["evaluations"], locale);
      expect(
        await screen.findByText(copy.evaluations.assignedEvaluation),
      ).toBeVisible();
      expect(screen.getByText(copy.evaluations.resitFinalReview)).toBeVisible();
      expect(screen.getByText(copy.evaluations.assignedRetake)).toBeVisible();
      expect(screen.getByText(copy.shared.noStudentNote)).toBeVisible();
      expect(
        screen.getByText(`${copy.shared.originalRequest} original`),
      ).toBeVisible();
      expect(screen.getAllByText(detail.studentComment)).toHaveLength(2);
      expect(screen.getAllByText("Assigned")).toHaveLength(3);
      expect(
        screen.getAllByRole("link").map((link) => link.getAttribute("href")),
      ).toEqual(
        assigned.map((item) => `/${locale}/teacher/evaluations/${item.id}`),
      );
      expect(apiMock).toHaveBeenCalledExactlyOnceWith("/evaluations/assigned");
      expect(client.getQueryData(["teacher-evaluations"])).toEqual(assigned);
    });

    it("localizes the empty evaluation list without inventing pagination", async () => {
      apiMock.mockResolvedValue([]);
      const { copy } = renderArea(["evaluations"], locale);
      expect(await screen.findByText(copy.evaluations.empty)).toBeVisible();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(apiMock).toHaveBeenCalledExactlyOnceWith("/evaluations/assigned");
    });

    it("preserves section/band grouping, raw criterion codes, selection order and criteria-plan refetch", async () => {
      mockDetail({
        ...detail,
        criteria: ["B.D1", "B.M1", "B.P2", "B.P1", "X"],
        selectedCriteria: [],
      });
      const { client, copy } = renderArea(
        ["evaluations", "evaluation-1"],
        locale,
      );
      expect(
        await screen.findByRole("heading", {
          name:
            locale === "ar"
              ? "مراجعة مهمة الطالب"
              : "Student assignment review",
        }),
      ).toBeVisible();
      expect(
        screen.getByText(locale === "ar" ? "القسم B" : "Section B"),
      ).toBeVisible();
      for (const key of [
        "passCriteria",
        "meritCriteria",
        "distinctionCriteria",
        "additionalCriteria",
      ] as const)
        expect(screen.getByText(copy.evaluationReview[key])).toBeVisible();
      const checkboxes = screen.getAllByRole("checkbox");
      expect(
        checkboxes.map((box) => box.closest("label")?.textContent),
      ).toEqual(["X", "P1", "P2", "M1", "D1"]);
      const button = screen.getByRole("button", {
        name: copy.evaluationReview.confirmCriteria,
      });
      expect(button).toBeDisabled();
      const user = userEvent.setup();
      await user.click(screen.getByRole("checkbox", { name: "P1" }));
      await user.click(screen.getByRole("checkbox", { name: "M1" }));
      await user.click(screen.getByRole("checkbox", { name: "D1" }));
      expect(
        screen.getByText(locale === "ar" ? "1 من 2 محدد" : "1 of 2 selected"),
      ).toBeVisible();
      await user.click(button);
      await waitFor(() =>
        expect(writes("/evaluations/evaluation-1/criteria-plan")).toHaveLength(
          1,
        ),
      );
      expect(
        JSON.parse(
          writes("/evaluations/evaluation-1/criteria-plan")[0][1].body,
        ),
      ).toEqual({ criterionCodes: ["B.P1", "B.M1", "B.D1"] });
      await waitFor(() =>
        expect(
          apiMock.mock.calls.filter(
            ([path, options]) =>
              path === "/evaluations/evaluation-1" && !options?.method,
          ),
        ).toHaveLength(2),
      );
      expect(
        client.getQueryData(["teacher-evaluation", "evaluation-1"]),
      ).toMatchObject({ criteria: ["B.D1", "B.M1", "B.P2", "B.P1", "X"] });
    });

    it("keeps review guards, criterion payload, feedback trimming, revision deadline and success reset/refetch", async () => {
      mockDetail();
      const { copy } = renderArea(["evaluations", "evaluation-1"], locale);
      const outcome = await screen.findByLabelText(
        copy.evaluationReview.outcome,
      );
      const submit = screen.getByRole("button", {
        name: copy.evaluationReview.submitReview,
      });
      expect(submit).toBeDisabled();
      fireEvent.submit(submit.closest("form")!);
      expect(writes("/evaluations/evaluation-1/review")).toHaveLength(0);
      const user = userEvent.setup();
      await user.selectOptions(outcome, "PartiallyAchieved");
      expect(submit).toBeDisabled();
      expect(
        within(outcome)
          .getAllByRole("option")
          .map((option) => option.getAttribute("value")),
      ).toEqual([
        "",
        "Achieved",
        "PartiallyAchieved",
        "NotAchieved",
        "NotApplicable",
      ]);
      await user.type(
        screen.getByLabelText(copy.evaluationReview.evidence),
        "RAW teacher evidence دليل",
      );
      await user.type(
        screen.getByLabelText(copy.evaluationReview.comment),
        "RAW teacher comment",
      );
      const feedback = screen.getByLabelText(copy.evaluationReview.feedback);
      expect(feedback).toHaveAttribute("maxLength", "4000");
      expect(feedback).toHaveAttribute(
        "placeholder",
        copy.evaluationReview.feedbackPlaceholder,
      );
      await user.type(feedback, "  RAW teacher feedback  ");
      expect(submit).toBeEnabled();
      await user.click(
        screen.getByRole("checkbox", {
          name: new RegExp(copy.evaluationReview.openRevision),
        }),
      );
      expect(submit).toBeDisabled();
      const deadline = screen.getByLabelText(
        copy.evaluationReview.revisionDeadline,
      );
      fireEvent.change(deadline, { target: { value: "2030-01-03T12:00" } });
      await user.click(submit);
      await waitFor(() =>
        expect(writes("/evaluations/evaluation-1/review")).toHaveLength(1),
      );
      expect(
        JSON.parse(writes("/evaluations/evaluation-1/review")[0][1].body),
      ).toEqual({
        results: [
          {
            criterionCode: "A.P1",
            achievement: "PartiallyAchieved",
            evidence: "RAW teacher evidence دليل",
            comment: "RAW teacher comment",
          },
        ],
        feedback: "RAW teacher feedback",
        requestRevision: true,
        revisionDueAtUtc: new Date("2030-01-03T12:00").toISOString(),
      });
      expect(await screen.findByRole("status")).toHaveTextContent(
        copy.evaluationReview.reviewSuccess,
      );
      expect(feedback).toHaveValue("");
      expect(outcome).toHaveValue("");
      expect(screen.getByRole("checkbox")).not.toBeChecked();
      expect(
        screen.queryByLabelText(copy.evaluationReview.revisionDeadline),
      ).not.toBeInTheDocument();
      expect(screen.getByText(detail.studentComment)).toBeVisible();
      expect(screen.getByText(detail.evidence[0].narrative)).toBeVisible();
      expect(screen.getByRole("link", { name: /RAW ملف.pdf/ })).toHaveAttribute(
        "href",
        "/api/v1/evaluations/evaluation-1/files/raw-file",
      );
      expect(screen.getByText(/RAW scan/)).toBeVisible();
      expect(
        screen.getByRole("link", { name: copy.evaluationReview.back }),
      ).toHaveAttribute("href", `/${locale}/teacher/evaluations`);
      await waitFor(() =>
        expect(
          apiMock.mock.calls.filter(
            ([path]) => path === "/evaluations/evaluation-1",
          ),
        ).toHaveLength(2),
      );
    });

    it.each(["resit", "retake", "revision"] as const)(
      "preserves %s review behavior and mutation contract",
      async (kind) => {
        mockDetail({
          ...detail,
          isResit: kind === "resit",
          isRetake: kind === "retake",
          submissionAttemptNumber: kind === "revision" ? 2 : 1,
          resitOfEvaluationRequestId:
            kind === "resit" ? "original-raw-request" : null,
          results: [
            {
              criterionCode: "A.P1",
              achievement: "Achieved",
              evidence: "RAW stored evidence",
              comment: "RAW stored comment",
            },
          ],
        });
        const { copy } = renderArea(["evaluations", "evaluation-1"], locale);
        expect(
          await screen.findByLabelText(copy.evaluationReview.outcome),
        ).toHaveValue("Achieved");
        expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
        const user = userEvent.setup();
        if (kind === "retake") {
          expect(screen.getByText("Historical Retake")).toBeVisible();
          expect(
            screen.getByText(copy.evaluationReview.historicalRetakeDescription),
          ).toBeVisible();
          expect(
            screen.queryByLabelText(copy.evaluationReview.feedback),
          ).not.toBeInTheDocument();
        } else {
          expect(
            screen.getByRole("button", {
              name:
                kind === "resit"
                  ? copy.evaluationReview.submitReview
                  : copy.evaluationReview.submitRevision,
            }),
          ).toBeDisabled();
          await user.type(
            screen.getByLabelText(copy.evaluationReview.feedback),
            "RAW final feedback",
          );
          expect(
            screen.getByText(
              kind === "resit"
                ? copy.evaluationReview.resitEyebrow
                : copy.evaluationReview.finalRevision,
            ),
          ).toBeVisible();
        }
        if (kind === "revision")
          expect(
            screen.getByText(copy.evaluationReview.revisedFile),
          ).toBeVisible();
        if (kind === "resit")
          expect(
            screen.getByText(`${copy.shared.originalRequest} original`),
          ).toBeVisible();
        await user.click(
          screen.getByRole("button", {
            name:
              kind === "retake"
                ? copy.evaluationReview.submitRetake
                : kind === "resit"
                  ? copy.evaluationReview.submitReview
                  : copy.evaluationReview.submitRevision,
          }),
        );
        const endpoint = `/evaluations/evaluation-1/${kind === "retake" ? "results" : "review"}`;
        await waitFor(() => expect(writes(endpoint)).toHaveLength(1));
        const results = [
          {
            criterionCode: "A.P1",
            achievement: "Achieved",
            evidence: "RAW stored evidence",
            comment: "RAW stored comment",
          },
        ];
        expect(JSON.parse(writes(endpoint)[0][1].body)).toEqual(
          kind === "retake"
            ? results
            : {
                results,
                feedback: "RAW final feedback",
                requestRevision: false,
                revisionDueAtUtc: null,
              },
        );
        expect(await screen.findByRole("status")).toHaveTextContent(
          kind === "retake"
            ? copy.evaluationReview.retakeSuccess
            : copy.evaluationReview.reviewSuccess,
        );
        expect(
          apiMock.mock.calls.some(([path]) =>
            /retakes|checkout|authenticity-declaration|resubmit|payments/.test(
              path,
            ),
          ),
        ).toBe(false);
      },
    );

    it.each(["NeedsRevision", "UnderReview"])(
      "preserves the %s summary and raw server grade/feedback",
      async (status) => {
        mockDetail({ ...detail, status });
        const { copy } = renderArea(["evaluations", "evaluation-1"], locale);
        expect(await screen.findByRole("status")).toHaveTextContent(
          status === "NeedsRevision"
            ? copy.evaluationReview.awaitingRevision
            : copy.evaluationReview.awaitingApproval,
        );
        expect(screen.getByText("RAW grade")).toBeVisible();
        if (status === "NeedsRevision")
          expect(screen.getByText("RAW feedback تعليق")).toBeVisible();
        else {
          expect(
            screen.getByText(locale === "ar" ? "القسم B:" : "Section B:"),
          ).toBeVisible();
          expect(screen.getByText("RAW section grade")).toBeVisible();
        }
        expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
      },
    );

    it.each(["plan", "review"] as const)(
      "localizes %s non-Error failures while preserving Error messages",
      async (kind) => {
        let rawError = false;
        const value = {
          ...detail,
          selectedCriteria: kind === "plan" ? [] : ["A.P1"],
        };
        apiMock.mockImplementation((path: string, options?: RequestInit) =>
          options?.method === "POST"
            ? Promise.reject(
                rawError ? new Error("RAW server rejection") : "unstructured",
              )
            : Promise.resolve(value),
        );
        const { copy } = renderArea(["evaluations", "evaluation-1"], locale);
        await screen.findByRole("heading", {
          name: copy.evaluationReview.title,
        });
        const user = userEvent.setup();
        if (kind === "plan")
          await user.click(screen.getByRole("checkbox", { name: "P1" }));
        else {
          await user.selectOptions(
            screen.getByLabelText(copy.evaluationReview.outcome),
            "NotAchieved",
          );
          await user.type(
            screen.getByLabelText(copy.evaluationReview.feedback),
            "RAW feedback",
          );
        }
        const button = screen.getByRole("button", {
          name:
            kind === "plan"
              ? copy.evaluationReview.confirmCriteria
              : copy.evaluationReview.submitReview,
        });
        await user.click(button);
        expect(await screen.findByRole("alert")).toHaveTextContent(
          locale === "ar" ? "فشل الطلب." : "Request failed.",
        );
        rawError = true;
        await user.click(button);
        await waitFor(() =>
          expect(screen.getByRole("alert")).toHaveTextContent(
            "RAW server rejection",
          ),
        );
      },
    );

    it("localizes missing student note, files and criterion evidence without manufacturing data", async () => {
      mockDetail({ ...detail, studentComment: "", files: [], evidence: [] });
      const { copy } = renderArea(["evaluations", "evaluation-1"], locale);
      expect(await screen.findByText(copy.shared.noStudentNote)).toBeVisible();
      expect(screen.getByText(copy.evaluationReview.noFiles)).toBeVisible();
      expect(
        screen.getByText(copy.evaluationReview.noWrittenEvidence),
      ).toBeVisible();
    });
  },
);
