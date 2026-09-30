import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  act,
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
import { ApiError } from "@/lib/api";
import { formatLocalizedDate } from "@/i18n/date-time";
import { formatLocalizedCurrency } from "@/i18n/number-format";

const push = vi.hoisted(() => vi.fn());
const formattedJodFive = new Intl.NumberFormat("en-JO", {
  style: "currency",
  currency: "JOD",
  currencyDisplay: "code",
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
}).format(5);
const resitPriceText =
  `Server-owned Resit review price: ${formattedJodFive}. Any applicable tax is calculated at checkout.`
    .replace(/\s+/gu, " ")
    .trim();
const matchesResitPrice = (_content: string, element: Element | null) =>
  element?.textContent?.replace(/\s+/gu, " ").trim() === resitPriceText;
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: apiMock,
}));

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderPage(
  node: React.ReactNode,
  locale: "en" | "ar" = "en",
  client = createClient(),
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? arMessages : enMessages}
    >
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
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

describe.each(["en", "ar"] as const)("Resit opportunities in %s", (locale) => {
  const copy =
    locale === "ar"
      ? {
          title: "فرص إعادة التقييم",
          loading: "جارٍ تحميل الفرص…",
          loadError: "تعذر تحميل فرص إعادة التقييم.",
          empty: "لا توجد فرص إعادة تقييم حاليًا.",
          cardTitle: "فرصة إعادة التقييم",
          originalRequest: "الطلب الأصلي",
          description:
            "مراجعة استشارية نهائية مستقلة من BETCCO بملفات وأدلة جديدة ودفع منفصل لاحقًا.",
          start: "بدء إعادة التقييم",
          previous: "السابق",
          next: "التالي",
        }
      : {
          title: "Resit opportunities",
          loading: "Loading opportunities…",
          loadError: "Unable to load Resit opportunities.",
          empty: "No Resit opportunities available.",
          cardTitle: "Resit opportunity",
          originalRequest: "Original request",
          description:
            "One separate final BETCCO advisory review with fresh files and evidence. Separate payment follows later.",
          start: "Start Resit",
          previous: "Previous",
          next: "Next",
        };

  it("renders translated copy and server-owned academic data without expanding IDs", async () => {
    apiMock.mockResolvedValue({
      items: [
        {
          ...authorized,
          academic: {
            qualificationCode: "Q-CODE",
            qualificationArabicName: "مؤهل من الخادم",
            qualificationEnglishName: "Server qualification",
            unitCode: "U-CODE",
            unitArabicTitle: "وحدة من الخادم",
            unitEnglishTitle: "Server unit",
            assessmentCode: "A-CODE",
            assessmentArabicTitle: "تقييم من الخادم",
            assessmentEnglishTitle: "Server assessment",
          },
        },
      ],
      page: 1,
      pageSize: 10,
      hasNextPage: false,
    });
    renderPage(<StudentResitOpportunities />, locale);
    expect(screen.getByRole("region", { name: copy.title })).toBeVisible();
    expect(screen.getByRole("heading", { name: copy.title })).toBeVisible();
    expect(
      await screen.findByRole("button", { name: copy.start }),
    ).toBeEnabled();
    expect(screen.getByText(copy.cardTitle)).toBeVisible();
    expect(screen.getByText(copy.description)).toBeVisible();
    expect(screen.getByText(`${copy.originalRequest}: bbbbbbbb`)).toBeVisible();
    expect(
      screen.queryByText(authorized.originalEvaluationRequestId, {
        exact: false,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(formatLocalizedDate(authorized.authorizedAtUtc, locale)),
    ).toBeVisible();
    expect(
      screen.getByText(
        locale === "ar"
          ? "Q-CODE · U-CODE · وحدة من الخادم · تقييم من الخادم"
          : "Q-CODE · U-CODE · Server unit · Server assessment",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: copy.previous })).toBeDisabled();
    expect(screen.getByRole("button", { name: copy.next })).toBeDisabled();
  });

  it("localizes loading and empty states", async () => {
    let resolvePage!: (value: unknown) => void;
    apiMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );
    renderPage(<StudentResitOpportunities />, locale);
    expect(screen.getByRole("status")).toHaveTextContent(copy.loading);
    await act(async () =>
      resolvePage({ items: [], page: 1, pageSize: 10, hasNextPage: false }),
    );
    expect(await screen.findByText(copy.empty)).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("localizes a query failure without presenting it as empty or exposing details", async () => {
    apiMock.mockRejectedValue(new Error("private staff rationale"));
    renderPage(<StudentResitOpportunities />, locale);
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.loadError);
    expect(screen.queryByText(copy.empty)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/private staff rationale/),
    ).not.toBeInTheDocument();
  });

  it("preserves page size, query identity, and Previous/Next behavior", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve({
        items: [authorized],
        page: path.includes("page=2") ? 2 : 1,
        pageSize: 10,
        hasNextPage: !path.includes("page=2"),
      }),
    );
    const client = createClient();
    renderPage(<StudentResitOpportunities />, locale, client);
    await screen.findByRole("button", { name: copy.start });
    expect(screen.getByRole("button", { name: copy.previous })).toBeDisabled();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: copy.next }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: copy.next })).toBeDisabled(),
    );
    expect(apiMock).toHaveBeenCalledWith(
      "/student/resit-authorizations?page=2&pageSize=10",
    );
    expect(
      client.getQueryData(["student", "resit-authorizations", 2]),
    ).toMatchObject({ page: 2 });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: copy.previous }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: copy.previous }),
      ).toBeDisabled(),
    );
    expect(
      client.getQueryData(["student", "resit-authorizations", 1]),
    ).toMatchObject({ page: 1 });
  });

  it("disables activation while pending and waits for both invalidations before navigation", async () => {
    let resolveActivation!: (value: unknown) => void;
    const activation = new Promise((resolve) => {
      resolveActivation = resolve;
    });
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/activate")
        ? activation
        : Promise.resolve({
            items: [authorized],
            page: 1,
            pageSize: 10,
            hasNextPage: false,
          }),
    );
    const client = createClient();
    let resolveAuthorizations!: () => void;
    let resolveEvaluations!: () => void;
    const invalidate = vi
      .spyOn(client, "invalidateQueries")
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveAuthorizations = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveEvaluations = resolve;
        }),
      );
    renderPage(<StudentResitOpportunities />, locale, client);
    const button = await screen.findByRole("button", { name: copy.start });
    await userEvent.setup().click(button);
    expect(button).toBeDisabled();
    expect(apiMock).toHaveBeenCalledWith(
      `/student/resit-authorizations/${authorized.authorizationId}/activate`,
      { method: "POST" },
    );
    await act(async () =>
      resolveActivation({
        status: "Activated",
        resitEvaluationRequestId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      }),
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(invalidate).toHaveBeenNthCalledWith(1, {
      queryKey: ["student", "resit-authorizations"],
    });
    expect(invalidate).toHaveBeenNthCalledWith(2, {
      queryKey: ["evaluations", "mine"],
    });
    expect(push).not.toHaveBeenCalled();
    await act(async () => resolveAuthorizations());
    expect(push).not.toHaveBeenCalled();
    await act(async () => resolveEvaluations());
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/${locale}/student/evaluations/cccccccc-cccc-cccc-cccc-cccccccccccc`,
      ),
    );
  });

  const privateDetail =
    "private staff rationale, revocation reason, LIV internal notes";
  it.each([
    [
      "non-ApiError",
      () => new Error(privateDetail),
      "تعذر بدء إعادة التقييم. حاول مجددًا.",
      "Unable to start the Resit. Please retry.",
    ],
    [
      "404 takes precedence over code",
      () => new ApiError(404, privateDetail, "RESIT_AUTHORIZATION_REVOKED"),
      "الفرصة غير متاحة. حدّث الصفحة.",
      "Opportunity unavailable. Refresh the page.",
    ],
    [
      "RESIT_AUTHORIZATION_REVOKED",
      () => new ApiError(409, privateDetail, "RESIT_AUTHORIZATION_REVOKED"),
      "فرصة إعادة التقييم هذه لم تعد متاحة.",
      "This Resit opportunity is no longer available.",
    ],
    [
      "RESIT_ORIGINAL_NO_LONGER_VALID",
      () => new ApiError(409, privateDetail, "RESIT_ORIGINAL_NO_LONGER_VALID"),
      "لم يعد الطلب الأصلي مؤهلًا لإعادة التقييم.",
      "The original request is no longer eligible for Resit.",
    ],
    [
      "RESIT_ACADEMIC_SNAPSHOT_INVALID",
      () => new ApiError(409, privateDetail, "RESIT_ACADEMIC_SNAPSHOT_INVALID"),
      "تعذر قراءة بيانات التقييم الأصلية. تواصل مع الدعم.",
      "The original assessment details are unavailable. Contact support.",
    ],
    [
      "RESIT_ACTIVATION_CONFLICT",
      () => new ApiError(409, privateDetail, "RESIT_ACTIVATION_CONFLICT"),
      "تغيرت حالة الفرصة. حدّث الصفحة وحاول مجددًا.",
      "This opportunity changed. Refresh and try again.",
    ],
    [
      "unknown ApiError code",
      () => new ApiError(500, privateDetail, "UNKNOWN_CODE"),
      "تعذر بدء إعادة التقييم. حاول مجددًا.",
      "Unable to start the Resit. Please retry.",
    ],
  ] as const)(
    "localizes %s without raw backend details",
    async (_name, createError, arabic, english) => {
      apiMock.mockImplementation((path: string) =>
        path.endsWith("/activate")
          ? Promise.reject(createError())
          : Promise.resolve({
              items: [authorized],
              page: 1,
              pageSize: 10,
              hasNextPage: false,
            }),
      );
      renderPage(<StudentResitOpportunities />, locale);
      await userEvent
        .setup()
        .click(await screen.findByRole("button", { name: copy.start }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        locale === "ar" ? arabic : english,
      );
      expect(
        screen.queryByText(/rationale|revocation reason|LIV internal notes/i),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/UNKNOWN_CODE|RESIT_/)).not.toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
    },
  );
});

describe.each(["en", "ar"] as const)(
  "Resit detail localization in %s",
  (locale) => {
    const copy =
      locale === "ar"
        ? {
            back: "العودة إلى الطلبات",
            loading: "جارٍ تحميل الطلب…",
            unavailable: "طلب إعادة التقييم غير متاح.",
            title: "مراجعة Resit نهائية",
            status: "الحالة",
            originalRequest: "الطلب الأصلي",
            draftTitle: "تجهيز أدلة إعادة التقييم",
            fileLabel: "ملفات إعادة التقييم الجديدة",
            savedFiles: "الملفات المحفوظة",
            noFiles: "لم تُرفع ملفات بعد.",
            evidenceTitle: "أدلة المعايير",
            evidenceLabel: "دليل A.P1",
            declaration:
              "أقر بأن الملفات والأدلة المقدمة تخصني وأنني ذكرت مصادر المساعدة المسموح بها.",
            paidTitle: "مراجعة Resit مدفوعة",
            paymentMethod: "طريقة الدفع",
            card: "بطاقة بنكية",
            bankTransfer: "تحويل بنكي",
            eWallet: "محفظة إلكترونية",
            continuePayment: "المتابعة إلى الدفع",
            pendingTitle: "الدفع قيد الانتظار",
            pendingHelp:
              "تحقق من سجل دفعاتك أو تواصل مع الدعم إذا بقيت الحالة معلقة. لا تبدأ دفعة أخرى.",
            completedTitle: "النتيجة الاستشارية النهائية للـ Resit",
            disclaimer:
              "هذه نتيجة إرشادية من BETCCO وليست نتيجة رسمية من الجهة التعليمية.",
            awaiting: "ستظهر النتيجة بعد اكتمال المراجعة.",
          }
        : {
            back: "Back to evaluations",
            loading: "Loading request…",
            unavailable: "Resit request unavailable.",
            title: "Resit final review",
            status: "Status",
            originalRequest: "Original request",
            draftTitle: "Prepare Resit evidence",
            fileLabel: "Fresh Resit files",
            savedFiles: "Saved files",
            noFiles: "No files uploaded yet.",
            evidenceTitle: "Criterion evidence",
            evidenceLabel: "Evidence for A.P1",
            declaration:
              "I declare these files and evidence are my own and acknowledge permitted sources of help.",
            paidTitle: "Paid Resit review",
            paymentMethod: "Payment method",
            card: "Bank card",
            bankTransfer: "Bank transfer",
            eWallet: "E-wallet",
            continuePayment: "Continue to payment",
            pendingTitle: "Payment pending",
            pendingHelp:
              "Check your payment history or contact support if this remains pending. Do not start another payment.",
            completedTitle: "Final Resit advisory result",
            disclaimer:
              "This is a BETCCO advisory result, not an official school or awarding body result.",
            awaiting: "The result will appear after review is complete.",
          };

    function detail(status: string) {
      return {
        id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        status,
        price: 5,
        currency: "JOD",
        isResit: true,
        resitOfEvaluationRequestId: authorized.originalEvaluationRequestId,
        academic: null,
        criteria: ["A.P1"],
        files: [],
        evidence: [],
        hasAuthenticityDeclaration: false,
        calculatedGrade: null,
        sectionResults: [],
        results: [],
        feedback: [],
      };
    }

    it("renders localized Draft copy while preserving raw identifiers, state, criterion, and server price", async () => {
      const data = detail("Draft");
      apiMock.mockResolvedValue(data);
      renderPage(<StudentResitDetail evaluationId={data.id} />, locale);

      expect(
        await screen.findByRole("heading", { level: 1, name: copy.title }),
      ).toBeVisible();
      expect(screen.getByRole("link", { name: copy.back })).toHaveAttribute(
        "href",
        `/${locale}/student/evaluations`,
      );
      expect(screen.getByText(`${copy.status}: Draft`)).toBeVisible();
      expect(
        screen.getByText(`${copy.originalRequest}: bbbbbbbb`),
      ).toBeVisible();
      expect(screen.getByText(copy.draftTitle)).toBeVisible();
      expect(screen.getByText(copy.fileLabel)).toBeVisible();
      expect(screen.getByText(copy.savedFiles)).toBeVisible();
      expect(screen.getByText(copy.noFiles)).toBeVisible();
      expect(screen.getByText(copy.evidenceTitle)).toBeVisible();
      expect(
        screen.getByRole("textbox", { name: copy.evidenceLabel }),
      ).toBeVisible();
      expect(screen.getByText(copy.declaration)).toBeVisible();
      expect(screen.getByText(copy.paidTitle)).toBeVisible();
      expect(screen.getByText(copy.paymentMethod)).toBeVisible();
      expect(screen.getByRole("option", { name: copy.card })).toHaveValue(
        "Card",
      );
      expect(
        screen.getByRole("option", { name: copy.bankTransfer }),
      ).toHaveValue("BankTransfer");
      expect(screen.getByRole("option", { name: copy.eWallet })).toHaveValue(
        "EWallet",
      );
      expect(
        screen.getByRole("button", { name: copy.continuePayment }),
      ).toBeDisabled();
      const formattedPrice = formatLocalizedCurrency(5, "JOD", locale);
      const expectedPrice = (
        locale === "ar"
          ? `السعر المحدد من الخادم: ${formattedPrice}. تُحسب أي ضريبة مطبقة عند الدفع.`
          : `Server-owned Resit review price: ${formattedPrice}. Any applicable tax is calculated at checkout.`
      )
        .replace(/\s+/gu, " ")
        .trim();
      expect(
        screen.getByText(
          (_content, element) =>
            element?.textContent?.replace(/\s+/gu, " ").trim() ===
            expectedPrice,
        ),
      ).toBeVisible();
    });

    it("localizes loading and unavailable states", async () => {
      apiMock.mockReturnValue(new Promise(() => {}));
      const view = renderPage(
        <StudentResitDetail evaluationId="loading-id" />,
        locale,
      );
      expect(screen.getByRole("status")).toHaveTextContent(copy.loading);
      view.unmount();

      apiMock.mockReset();
      apiMock.mockResolvedValue({ ...detail("Draft"), isResit: false });
      renderPage(<StudentResitDetail evaluationId="not-resit-id" />, locale);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy.unavailable,
      );
    });

    it("localizes PendingPayment and awaiting-review states", async () => {
      apiMock.mockResolvedValue(detail("PendingPayment"));
      const pending = renderPage(
        <StudentResitDetail evaluationId="pending-id" />,
        locale,
      );
      expect(
        await screen.findByRole("heading", { name: copy.pendingTitle }),
      ).toBeVisible();
      expect(screen.getByText(copy.pendingHelp)).toBeVisible();
      pending.unmount();

      apiMock.mockReset();
      apiMock.mockResolvedValue(detail("PendingAssignment"));
      renderPage(<StudentResitDetail evaluationId="review-id" />, locale);
      expect(await screen.findByText(copy.awaiting)).toBeVisible();
    });

    it("localizes completed framing while preserving raw result and feedback values", async () => {
      apiMock.mockResolvedValue({
        ...detail("Completed"),
        calculatedGrade: "Raw Grade",
        sectionResults: [
          { section: "Raw Section", grade: "Raw Section Grade" },
        ],
        results: [
          {
            criterionCode: "A.P1",
            achievement: "Raw Achievement",
            comment: "Raw Comment",
          },
        ],
        feedback: [
          { body: "Raw Feedback", createdAtUtc: "2026-09-30T00:00:00Z" },
        ],
      });
      renderPage(<StudentResitDetail evaluationId="completed-id" />, locale);

      expect(
        await screen.findByRole("heading", { name: copy.completedTitle }),
      ).toBeVisible();
      expect(screen.getByText("Raw Grade")).toBeVisible();
      expect(screen.getByText("Raw Section: Raw Section Grade")).toBeVisible();
      expect(
        screen.getByText("A.P1: Raw Achievement · Raw Comment"),
      ).toBeVisible();
      expect(screen.getByText("Raw Feedback")).toBeVisible();
      expect(screen.getByText(copy.disclaimer)).toBeVisible();
    });
  },
);

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

  it.each(["en", "ar"] as const)(
    "shows activated and revoked states without an activation action or staff rationale in %s",
    async (locale) => {
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
            rationale: "private staff rationale",
            revocationReason: "private revocation reason",
            internalNotes: "private LIV internal notes",
          },
        ],
        page: 1,
        pageSize: 10,
        hasNextPage: false,
      });
      renderPage(<StudentResitOpportunities />, locale);
      expect(
        await screen.findByRole("link", {
          name:
            locale === "ar" ? "فتح مسودة إعادة التقييم" : "Open Resit draft",
        }),
      ).toHaveAttribute(
        "href",
        `/${locale}/student/evaluations/cccccccc-cccc-cccc-cccc-cccccccccccc`,
      );
      expect(
        screen.getByText(
          locale === "ar"
            ? "فرصة إعادة التقييم هذه لم تعد متاحة."
            : "This Resit opportunity is no longer available.",
        ),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", {
          name: locale === "ar" ? "بدء إعادة التقييم" : "Start Resit",
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/rationale|revocation reason|LIV internal notes/i),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          locale === "ar"
            ? "تم التفعيل · طلب إعادة التقييم: cccccccc"
            : "Activated · Resit request: cccccccc",
        ),
      ).toBeVisible();
      expect(
        screen.queryByText("cccccccc-cccc-cccc-cccc-cccccccccccc", {
          exact: false,
        }),
      ).not.toBeInTheDocument();
    },
  );

  it("persists fresh files, criterion evidence and originality before payment", async () => {
    let detail = {
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      status: "Draft",
      price: 5,
      currency: "JOD",
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
    expect(screen.getByText(matchesResitPrice)).toBeVisible();
    expect(
      apiMock.mock.calls.some(([path]) =>
        /\/checkout|included-credit|\/payments\//.test(path),
      ),
    ).toBe(false);
  });

  it("submits paid Resit checkout without included credit and confirms a fake development payment", async () => {
    const id = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    let status = "Draft";
    apiMock.mockImplementation((path: string) => {
      if (path === `/evaluations/${id}`)
        return Promise.resolve({
          id,
          status,
          price: 5,
          currency: "JOD",
          isResit: true,
          resitOfEvaluationRequestId: authorized.originalEvaluationRequestId,
          academic: null,
          criteria: [],
          files: [
            {
              id: "file-1",
              originalFileName: "fresh.pdf",
              scanStatus: "Clean",
              createdAtUtc: "2026-09-27T00:00:00Z",
            },
          ],
          evidence: [],
          hasAuthenticityDeclaration: true,
          calculatedGrade: null,
          sectionResults: [],
          results: [],
          feedback: [],
        });
      if (path.endsWith("/checkout")) {
        status = "PendingPayment";
        return Promise.resolve({
          includedCreditApplied: false,
          paymentId: "payment-1",
          provider: "FakeCard",
          redirectUrl: null,
          total: 5,
          currency: "JOD",
        });
      }
      return Promise.resolve(undefined);
    });
    renderPage(<StudentResitDetail evaluationId={id} />);
    expect(await screen.findByText(matchesResitPrice)).toBeVisible();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Continue to payment" }));
    expect(
      await screen.findByText(/Development test payment only/),
    ).toBeVisible();
    const checkout = apiMock.mock.calls.find(
      ([path]) => path === `/evaluations/${id}/checkout`,
    );
    expect(checkout).toBeDefined();
    expect(checkout?.[1].headers["Idempotency-Key"]).toBeTruthy();
    expect(JSON.parse(checkout?.[1].body)).toEqual({
      paymentMethod: "Card",
      expectIncludedCredit: false,
    });
    expect(
      apiMock.mock.calls.some(([path]) => path.includes("/included-credit")),
    ).toBe(false);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Complete test payment" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/payments/fake/confirm",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/en/student/evaluations"),
    );
  });

  it("rejects an impossible included-credit checkout result and keeps payment unavailable without readiness", async () => {
    const id = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    let ready = false;
    apiMock.mockImplementation((path: string) => {
      if (path === `/evaluations/${id}`)
        return Promise.resolve({
          id,
          status: "Draft",
          price: 5,
          currency: "JOD",
          isResit: true,
          resitOfEvaluationRequestId: authorized.originalEvaluationRequestId,
          academic: null,
          criteria: [],
          files: ready
            ? [
                {
                  id: "file-1",
                  originalFileName: "fresh.pdf",
                  scanStatus: "Clean",
                  createdAtUtc: "2026-09-27T00:00:00Z",
                },
              ]
            : [],
          evidence: [],
          hasAuthenticityDeclaration: ready,
          calculatedGrade: null,
          sectionResults: [],
          results: [],
          feedback: [],
        });
      if (path.endsWith("/checkout"))
        return Promise.resolve({ includedCreditApplied: true });
      return Promise.resolve(undefined);
    });
    const view = renderPage(<StudentResitDetail evaluationId={id} />);
    expect(
      await screen.findByRole("button", { name: "Continue to payment" }),
    ).toBeDisabled();
    view.unmount();
    ready = true;
    renderPage(<StudentResitDetail evaluationId={id} />);
    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", { name: "Continue to payment" }),
      );
    expect(
      await screen.findByText("Payment state conflict. Contact support."),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
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
