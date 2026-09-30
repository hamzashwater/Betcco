import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
// Capture the real mutation only to exercise guards that the disabled button
// correctly prevents users from reaching. All UI/API tests use React Query.
const mutationCapture = vi.hoisted(() => ({
  enabled: false,
  trigger: undefined as (() => void) | undefined,
}));
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: ((...args: Parameters<typeof actual.useMutation>) => {
      const mutation = actual.useMutation(...args);
      if (mutationCapture.enabled)
        mutationCapture.trigger = () => mutation.mutate(undefined);
      return mutation;
    }) as typeof actual.useMutation,
  };
});

function renderWithProviders(node: React.ReactNode, locale: "en" | "ar") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    client,
    ...render(
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? arMessages : enMessages}
      >
        <QueryClientProvider client={client}>{node}</QueryClientProvider>
      </NextIntlClientProvider>,
    ),
  };
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
  mutationCapture.enabled = false;
  mutationCapture.trigger = undefined;
});

const requestPath = "/evaluations/retake-1";
const listPath = "/evaluations/mine?page=1&pageSize=20";

function historicalPage(overrides = {}) {
  return {
    items: [
      {
        id: "retake-1",
        status: "Draft",
        price: 5,
        currency: "JOD",
        isRetake: true,
        isResit: false,
        retakeOfEvaluationRequestId: "original-1",
        criteria: ["A.P1", "A.P2", "A.P3"],
        academic: null,
        selectedCriteria: [],
        calculatedGrade: null,
        sectionResults: [],
        results: [],
        evidence: [],
        feedback: [],
        reason: "Private LIV rationale",
        internalApprovalNotes: "Private approval notes",
        ...overrides,
      },
    ],
    page: 1,
    pageSize: 20,
    totalCount: 1,
    hasNextPage: false,
  };
}

function mockHistory() {
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(path === listPath ? historicalPage() : []),
  );
}

const retakeCopy = {
  en: {
    title: "Submit and pay for Retake",
    description:
      "This request has its own files, evidence, authenticity declaration, and payment.",
    files: "Retake files",
    choose: "Choose files",
    input: "Choose Retake files",
    evidence: "Evidence for A.P1",
    method: "Payment method",
    options: ["Bank card", "Bank transfer", "E-wallet"],
    authenticity:
      "I declare that the submitted Retake files and evidence are my own.",
    submit: "Upload files and pay",
    fileRequired: "Choose at least one Retake file.",
    authenticityRequired: "Confirm the originality declaration before payment.",
    fallback: "Request failed.",
  },
  ar: {
    title: "تسليم ودفع Retake",
    description: "هذا طلب مستقل بملفاته وأدلته وإقرار الأصالة والدفع الخاص به.",
    files: "ملفات Retake",
    choose: "اختيار الملفات",
    input: "اختيار ملفات Retake",
    evidence: "دليل A.P1",
    method: "طريقة الدفع",
    options: ["بطاقة بنكية", "تحويل بنكي", "محفظة إلكترونية"],
    authenticity: "أقر بأن ملفات وأدلة Retake المقدمة تخصني.",
    submit: "رفع الملفات والدفع",
    fileRequired: "اختر ملف Retake واحدًا على الأقل.",
    authenticityRequired: "أكد إقرار أصالة العمل قبل الدفع.",
    fallback: "فشل الطلب.",
  },
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("historical Retake payment localization and contracts", () => {
  it.each(["en", "ar"] as const)(
    "renders localized copy and preserves raw methods and button guards in %s",
    async (locale) => {
      mockHistory();
      renderWithProviders(<StudentArea segment={["evaluations"]} />, locale);
      const copy = retakeCopy[locale];
      expect(
        await screen.findByRole("heading", { name: copy.title }),
      ).toBeVisible();
      for (const text of [copy.description, copy.files, copy.authenticity])
        expect(screen.getByText(text)).toBeVisible();
      expect(screen.getByRole("button", { name: copy.choose })).toBeVisible();
      expect(screen.getByLabelText(copy.evidence)).toHaveAttribute(
        "maxlength",
        "4000",
      );
      expect(screen.getByLabelText(copy.method)).toHaveValue("Card");
      for (const [index, raw] of ["Card", "BankTransfer", "EWallet"].entries())
        expect(
          screen.getByRole("option", { name: copy.options[index] }),
        ).toHaveValue(raw);
      const submit = screen.getByRole("button", { name: copy.submit });
      expect(submit).toBeDisabled();
      const input = screen.getByLabelText(copy.input);
      expect(input).toHaveAttribute("multiple");
      expect(input).toHaveAttribute(
        "accept",
        ".pdf,.docx,.xlsx,.txt,.jpg,.jpeg,.png,.webp",
      );
      const user = userEvent.setup();
      await user.click(
        screen.getByRole("checkbox", { name: copy.authenticity }),
      );
      expect(submit).toBeDisabled();
      await user.click(
        screen.getByRole("checkbox", { name: copy.authenticity }),
      );
      await user.upload(
        input,
        new File(["work"], "work.pdf", { type: "application/pdf" }),
      );
      expect(submit).toBeDisabled();
      await user.click(
        screen.getByRole("checkbox", { name: copy.authenticity }),
      );
      expect(submit).toBeEnabled();
      expect(
        screen.queryByText("Private LIV rationale"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Private approval notes"),
      ).not.toBeInTheDocument();
    },
  );

  it.each(["en", "ar"] as const)(
    "localizes required-file and authenticity mutation guards in %s",
    async (locale) => {
      mockHistory();
      mutationCapture.enabled = true;
      renderWithProviders(<StudentArea segment={["evaluations"]} />, locale);
      await screen.findByRole("heading", { name: retakeCopy[locale].title });
      await act(async () => mutationCapture.trigger!());
      expect(await screen.findByRole("alert")).toHaveTextContent(
        retakeCopy[locale].fileRequired,
      );
      await userEvent
        .setup()
        .upload(
          screen.getByLabelText(retakeCopy[locale].input),
          new File(["work"], "work.pdf", { type: "application/pdf" }),
        );
      await act(async () => mutationCapture.trigger!());
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          retakeCopy[locale].authenticityRequired,
        ),
      );
      expect(
        apiMock.mock.calls.some(([, options]) => options?.method === "POST"),
      ).toBe(false);
    },
  );

  it.each(["en", "ar"] as const)(
    "keeps the per-file 100MB limit in %s",
    async (locale) => {
      mockHistory();
      renderWithProviders(<StudentArea segment={["evaluations"]} />, locale);
      const file = new File(["large"], "large.pdf", {
        type: "application/pdf",
      });
      Object.defineProperty(file, "size", { value: 100 * 1024 * 1024 + 1 });
      await userEvent
        .setup()
        .upload(await screen.findByLabelText(retakeCopy[locale].input), file);
      expect(await screen.findByRole("alert")).toHaveTextContent("100.00 MB");
      expect(
        screen.getByRole("button", { name: retakeCopy[locale].submit }),
      ).toBeDisabled();
      expect(
        apiMock.mock.calls.some(([, options]) => options?.method === "POST"),
      ).toBe(false);
    },
  );

  it.each(["en", "ar"] as const)(
    "preserves sequential uploads, parallel evidence, checkout and legacy confirmation in %s",
    async (locale) => {
      const uploads = [deferred(), deferred()];
      const evidence = [deferred(), deferred()];
      const authenticity = deferred();
      const confirm = deferred();
      let uploadIndex = 0;
      let evidenceIndex = 0;
      apiMock.mockImplementation((path: string) => {
        if (path === listPath) return Promise.resolve(historicalPage());
        if (path === requestPath + "/files")
          return uploads[uploadIndex++].promise;
        if (path === requestPath + "/evidence")
          return evidence[evidenceIndex++].promise;
        if (path === requestPath + "/authenticity-declaration")
          return authenticity.promise;
        if (path === requestPath + "/checkout")
          return Promise.resolve({ paymentId: "payment-1" });
        if (path === "/payments/fake/confirm") return confirm.promise;
        return Promise.resolve([]);
      });
      const { client } = renderWithProviders(
        <StudentArea segment={["evaluations"]} />,
        locale,
      );
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const user = userEvent.setup();
      const first = new File(["first"], "first.pdf", {
        type: "application/pdf",
      });
      const second = new File(["second"], "second.txt", { type: "text/plain" });
      await user.upload(
        await screen.findByLabelText(retakeCopy[locale].input),
        [first, second],
      );
      const textareas = screen.getAllByRole("textbox");
      await user.type(textareas[0], " Raw first narrative ");
      await user.type(textareas[1], "ثاني دليل raw");
      await user.type(textareas[2], "   ");
      await user.selectOptions(
        screen.getByLabelText(retakeCopy[locale].method),
        "BankTransfer",
      );
      await user.click(
        screen.getByRole("checkbox", { name: retakeCopy[locale].authenticity }),
      );
      await user.click(
        screen.getByRole("button", { name: retakeCopy[locale].submit }),
      );
      const posts = () =>
        apiMock.mock.calls.filter(([, options]) => options?.method === "POST");
      const paths = () => posts().map(([path]) => path);
      await waitFor(() => expect(paths()).toEqual([requestPath + "/files"]));
      expect(screen.getByRole("button", { name: "…" })).toBeDisabled();
      await act(async () => uploads[0].resolve());
      await waitFor(() =>
        expect(paths()).toEqual([
          requestPath + "/files",
          requestPath + "/files",
        ]),
      );
      await act(async () => uploads[1].resolve());
      await waitFor(() =>
        expect(paths()).toEqual([
          requestPath + "/files",
          requestPath + "/files",
          requestPath + "/evidence",
          requestPath + "/evidence",
        ]),
      );
      await act(async () => evidence[0].resolve());
      expect(paths()).toHaveLength(4);
      await act(async () => evidence[1].resolve());
      await waitFor(() =>
        expect(paths().at(-1)).toBe(requestPath + "/authenticity-declaration"),
      );
      expect(paths()).toHaveLength(5);
      await act(async () => authenticity.resolve());
      await waitFor(() =>
        expect(paths()).toEqual([
          requestPath + "/files",
          requestPath + "/files",
          requestPath + "/evidence",
          requestPath + "/evidence",
          requestPath + "/authenticity-declaration",
          requestPath + "/checkout",
          "/payments/fake/confirm",
        ]),
      );
      expect(invalidate).not.toHaveBeenCalled();
      for (const [index, file] of [first, second].entries()) {
        const body = posts()[index][1].body;
        expect(body).toBeInstanceOf(FormData);
        expect(Array.from((body as FormData).keys())).toEqual(["file"]);
        expect((body as FormData).get("file")).toBe(file);
      }
      expect(JSON.parse(posts()[2][1].body as string)).toEqual({
        criterionCode: "A.P1",
        narrative: " Raw first narrative ",
      });
      expect(JSON.parse(posts()[3][1].body as string)).toEqual({
        criterionCode: "A.P2",
        narrative: "ثاني دليل raw",
      });
      expect(JSON.parse(posts()[5][1].body as string)).toEqual({
        paymentMethod: "BankTransfer",
      });
      expect(posts()[5][1].headers["Idempotency-Key"]).toMatch(
        /^[0-9a-f-]{36}$/u,
      );
      expect(JSON.parse(posts()[6][1].body as string)).toEqual({
        paymentId: "payment-1",
        providerEventId: expect.stringMatching(/^test_[0-9a-f-]{36}$/u),
      });
      await act(async () => confirm.resolve());
      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["evaluations"] }),
      );
      await waitFor(() =>
        expect(
          apiMock.mock.calls.filter(([path]) => path === listPath),
        ).toHaveLength(2),
      );
    },
  );

  it.each(["en", "ar"] as const)(
    "localizes fallback and preserves real Error messages in %s",
    async (locale) => {
      let failure: unknown = "unstructured failure";
      apiMock.mockImplementation((path: string) => {
        if (path === listPath) return Promise.resolve(historicalPage());
        if (path === requestPath + "/checkout") return Promise.reject(failure);
        return Promise.resolve([]);
      });
      renderWithProviders(<StudentArea segment={["evaluations"]} />, locale);
      const user = userEvent.setup();
      await user.upload(
        await screen.findByLabelText(retakeCopy[locale].input),
        new File(["work"], "work.pdf", { type: "application/pdf" }),
      );
      await user.click(
        screen.getByRole("checkbox", { name: retakeCopy[locale].authenticity }),
      );
      await user.click(
        screen.getByRole("button", { name: retakeCopy[locale].submit }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        retakeCopy[locale].fallback,
      );
      failure = new Error("Server rejected historical checkout.");
      await user.click(
        screen.getByRole("button", { name: retakeCopy[locale].submit }),
      );
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Server rejected historical checkout.",
        ),
      );
      expect(
        apiMock.mock.calls.some(([path]) => path === "/payments/fake/confirm"),
      ).toBe(false);
    },
  );

  it.each([
    { isRetake: false, isResit: false, status: "Draft" },
    { isRetake: true, isResit: true, status: "Draft" },
    { isRetake: true, isResit: false, status: "Completed" },
    { isRetake: true, isResit: false, status: "NeedsRevision" },
  ])(
    "does not offer historical payment for excluded entry state %j",
    async (entry) => {
      apiMock.mockImplementation((path: string) =>
        Promise.resolve(path === listPath ? historicalPage(entry) : []),
      );
      renderWithProviders(<StudentArea segment={["evaluations"]} />, "en");
      await screen.findByText(entry.status);
      expect(
        screen.queryByRole("heading", { name: retakeCopy.en.title }),
      ).not.toBeInTheDocument();
    },
  );
});

describe("ASSESS Retakes", () => {
  it("retires new Retake creation while preserving legacy history messaging", () => {
    renderWithProviders(<RetakeManagement />, "en");

    expect(screen.getByText("Legacy Retakes")).toBeVisible();
    expect(
      screen.getByText(/BETCCO no longer creates new Retake requests/i),
    ).toBeVisible();
    expect(
      screen.getByText(
        /Historical Retake records remain available for reading and audit/i,
      ),
    ).toBeVisible();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it.each(["en", "ar"] as const)(
    "labels the independent student Retake payment state without exposing staff rationale in %s",
    async (locale) => {
      const history = {
        items: [
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
        ],
        page: 1,
        pageSize: 20,
        totalCount: 1,
        hasNextPage: false,
      };
      apiMock.mockImplementation((path: string) =>
        path.includes("/resit-authorizations")
          ? Promise.resolve({
              items: [],
              page: 1,
              pageSize: 10,
              hasNextPage: false,
            })
          : Promise.resolve(history),
      );
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
