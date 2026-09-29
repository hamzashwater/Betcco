import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatLocalizedCurrency } from "@/i18n/number-format";
import { StudentArea } from "@/features/student/student-area";
import { invalidateCsrfToken } from "@/lib/api";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";

function matchesNormalizedText(expected: string) {
  const normalizedExpected = expected.replace(/\s+/gu, " ").trim();
  return (_content: string, element: Element | null) =>
    element?.textContent?.replace(/\s+/gu, " ").trim() === normalizedExpected;
}

const searchParamsMock = vi.hoisted(() => ({
  includeResume: false,
  resumeId: "",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () =>
    new URLSearchParams(
      searchParamsMock.includeResume
        ? `resume=${encodeURIComponent(searchParamsMock.resumeId)}`
        : "",
    ),
}));

const scope = {
  assessmentScopeId: "00000000-0000-0000-0000-000000000001",
  qualificationCode: "Q",
  qualificationArabicName: "مؤهل",
  qualificationEnglishName: "Qualification",
  qualificationVersionCode: "V1",
  gradeCode: "g",
  gradeArabicName: "صف",
  gradeEnglishName: "Grade",
  specializationCode: "s",
  specializationArabicName: "تخصص",
  specializationEnglishName: "Specialization",
  unitCode: "U1",
  unitArabicTitle: "وحدة",
  unitEnglishTitle: "Unit",
  assessmentCode: "ASSIGNMENT",
  assessmentVersion: 1,
  assessmentArabicTitle: "مهمة",
  assessmentEnglishTitle: "Assignment",
  scopeVersion: 1,
  learningAimCodes: ["A"],
  criteria: [{ code: "A.P1", band: "Pass" }],
};

function draftDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft-1",
    status: "Draft",
    price: 12.5,
    currency: "JOD",
    studentComment: "Please focus on criterion A.P1.",
    assessmentScopeId: scope.assessmentScopeId,
    isRetake: false,
    isResit: false,
    hasAuthenticityDeclaration: true,
    academic: {
      qualificationCode: "Q",
      qualificationArabicName: "مؤهل",
      qualificationEnglishName: "Qualification",
      qualificationVersionCode: "V1",
      unitCode: "U1",
      unitArabicTitle: "وحدة",
      unitEnglishTitle: "Unit",
      assessmentCode: "ASSIGNMENT",
      assessmentVersion: 1,
      assessmentArabicTitle: "مهمة",
      assessmentEnglishTitle: "Assignment",
      learningAimCodes: ["A"],
    },
    criteria: ["A.P1"],
    files: [
      {
        id: "file-1",
        originalFileName: "existing-assignment.pdf",
        contentType: "application/pdf",
        lengthBytes: 12,
        scanStatus: "Clean",
      },
    ],
    evidence: [
      { criterionCode: "A.P1", narrative: "Original evidence narrative" },
    ],
    ...overrides,
  };
}

function renderWizard(locale: "en" | "ar" = "en", resumeId?: string) {
  searchParamsMock.includeResume = resumeId !== undefined;
  searchParamsMock.resumeId = resumeId ?? "";
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? arMessages : enMessages}
      >
        <StudentArea segment={["evaluations", "new"]} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function mockFetch(
  scopes: (typeof scope)[] = [scope],
  fail = false,
  creditAvailable = false,
  creditFailuresBeforeSuccess = 0,
  resumeDetail?: Record<string, unknown>,
) {
  let creditChecks = 0;
  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/evaluations/assessment-scopes"))
        return fail
          ? Response.json({ message: "Unavailable" }, { status: 503 })
          : Response.json(scopes);
      if (path.endsWith("/evaluations/draft-1"))
        return resumeDetail
          ? Response.json(resumeDetail)
          : Response.json({ message: "Not found" }, { status: 404 });
      if (path.includes("/included-credit")) {
        if (creditChecks++ < creditFailuresBeforeSuccess)
          return Response.json({ message: "Unavailable" }, { status: 503 });
        return Response.json({ available: creditAvailable });
      }
      if (path.endsWith("/security/antiforgery"))
        return Response.json({ token: "csrf" });
      if (path.endsWith("/evaluations/scoped"))
        return Response.json({
          id: "request-1",
          criteria: ["A.P1"],
          price: 5,
          currency: "JOD",
        });
      if (path.endsWith("/evaluations/draft-1/files"))
        return new Response(null, { status: 204 });
      if (path.endsWith("/evaluations/draft-1/evidence"))
        return new Response(null, { status: 204 });
      if (path.endsWith("/evaluations/draft-1/authenticity-declaration"))
        return new Response(null, { status: 204 });
      if (path.includes("/evaluations/request-1/files"))
        return new Response(null, { status: 204 });
      if (path.endsWith("/authenticity-declaration"))
        return new Response(null, { status: 204 });
      if (path.endsWith("/evaluations/request-1/checkout"))
        return Response.json(
          creditAvailable
            ? {
                includedCreditApplied: true,
                evaluationStatus: "PendingAssignment",
                paymentId: null,
              }
            : {
                includedCreditApplied: false,
                evaluationStatus: "PendingPayment",
                paymentId: "payment-1",
                status: "Processing",
                provider: "FakeDevelopment",
                checkoutReference: "fake-checkout-1",
                redirectUrl: null,
                providerSessionStatus: "Ready",
                subtotal: 5,
                discount: 0,
                tax: 0,
                total: 5,
                currency: "JOD",
                paymentMethod: "Card",
              },
        );
      if (path.endsWith("/evaluations/draft-1/checkout"))
        return Response.json(
          creditAvailable
            ? {
                includedCreditApplied: true,
                evaluationStatus: "PendingAssignment",
                paymentId: null,
              }
            : {
                includedCreditApplied: false,
                evaluationStatus: "PendingPayment",
                paymentId: "payment-1",
                status: "Processing",
                provider: "FakeDevelopment",
                checkoutReference: "fake-checkout-1",
                redirectUrl: null,
                providerSessionStatus: "Ready",
                subtotal: 5,
                discount: 0,
                tax: 0,
                total: 5,
                currency: "JOD",
                paymentMethod: "Card",
              },
        );
      if (path.endsWith("/payments/fake/confirm"))
        return new Response(null, { status: 204 });
      return Response.json(
        { message: `Unexpected request: ${path} ${init?.method ?? "GET"}` },
        { status: 404 },
      );
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function selectPrimaryScope(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(
    await screen.findByLabelText("Qualification and version"),
    "Q:V1",
  );
  await user.selectOptions(screen.getByLabelText("Grade"), "g");
  await user.selectOptions(screen.getByLabelText("Specialization"), "s");
  await user.selectOptions(screen.getByLabelText("Unit"), "U1");
  await user.selectOptions(
    screen.getByLabelText("Assessment or assignment"),
    scope.assessmentScopeId,
  );
}

describe("Student scoped evaluation wizard", () => {
  afterEach(() => {
    cleanup();
    invalidateCsrfToken();
    vi.unstubAllGlobals();
    searchParamsMock.includeResume = false;
    searchParamsMock.resumeId = "";
  });

  it("shows loading, empty and error states", async () => {
    mockFetch([], false);
    const { container } = renderWizard();
    expect(container.querySelector("[aria-busy]")).toBeInTheDocument();
    expect(await screen.findByText(/No published assessments/)).toBeVisible();
    cleanup();
    mockFetch([], true);
    renderWizard();
    expect(
      await screen.findByText(/Unable to load available assessments/),
    ).toBeVisible();
  });

  it.each(["en", "ar"] as const)(
    "filters the %s hierarchy, clears children and submits only scope identity",
    async (locale) => {
      const other = {
        ...scope,
        assessmentScopeId: "00000000-0000-0000-0000-000000000002",
        qualificationCode: "OTHER",
        qualificationEnglishName: "Other qualification",
        qualificationArabicName: "مؤهل آخر",
        gradeCode: "other-grade",
        gradeEnglishName: "Other grade",
        gradeArabicName: "صف آخر",
        unitCode: "U2",
        unitEnglishTitle: "Other unit",
        unitArabicTitle: "وحدة أخرى",
      };
      const fetchMock = mockFetch([scope, other]);
      const user = userEvent.setup();
      renderWizard(locale);
      const label = (english: string, arabic: string) =>
        locale === "ar" ? arabic : english;
      const qualification = await screen.findByLabelText(
        label("Qualification and version", "المؤهل والإصدار"),
      );
      const grade = screen.getByLabelText(label("Grade", "الصف"));
      const specialization = screen.getByLabelText(
        label("Specialization", "التخصص"),
      );
      const unit = screen.getByLabelText(label("Unit", "الوحدة"));
      const assessment = screen.getByLabelText(
        label("Assessment or assignment", "التقييم أو المهمة"),
      );
      expect(screen.queryByLabelText("Rubric")).not.toBeInTheDocument();
      expect(grade).toBeDisabled();
      await user.selectOptions(qualification, "Q:V1");
      await user.selectOptions(grade, "g");
      await user.selectOptions(specialization, "s");
      await user.selectOptions(unit, "U1");
      await user.selectOptions(assessment, scope.assessmentScopeId);
      expect(screen.getByText(/A\.P1 \(Pass\)/)).toBeVisible();
      await user.selectOptions(qualification, "OTHER:V1");
      expect(grade).toHaveValue("");
      expect(specialization).toHaveValue("");
      expect(unit).toHaveValue("");
      expect(assessment).toHaveValue("");
      await user.selectOptions(grade, "other-grade");
      await user.selectOptions(specialization, "s");
      await user.selectOptions(unit, "U2");
      await user.selectOptions(assessment, other.assessmentScopeId);
      await user.click(
        screen.getByRole("button", {
          name: label("Save and review", "حفظ ومراجعة الطلب"),
        }),
      );
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/v1/evaluations/scoped",
          expect.objectContaining({
            body: JSON.stringify({
              assessmentScopeId: other.assessmentScopeId,
              studentComment: "",
            }),
          }),
        ),
      );
      expect(
        screen.getByLabelText(label("Assignment files", "ملفات المهمة")),
      ).toBeInTheDocument();
    },
  );

  it("uses the included Unit evaluation credit without showing or confirming a payment", async () => {
    const fetchMock = mockFetch([scope], false, true);
    const user = userEvent.setup();
    renderWizard();

    await selectPrimaryScope(user);
    expect(
      await screen.findByText(
        "You have 1 assignment evaluation included with this Unit",
      ),
    ).toBeVisible();

    const file = new File(["assignment"], "assignment.pdf", {
      type: "application/pdf",
    });
    await user.upload(screen.getByLabelText("Choose Assignment files"), file);
    await user.click(screen.getByRole("button", { name: "Save and review" }));

    const originality = await screen.findByRole("checkbox", {
      name: /Originality declaration/,
    });
    expect(screen.queryByLabelText("Payment method")).not.toBeInTheDocument();
    await user.click(originality);
    await user.click(
      screen.getByRole("button", {
        name: "Use included assignment evaluation",
      }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/evaluations/request-1/checkout",
        expect.objectContaining({
          body: JSON.stringify({
            paymentMethod: "Card",
            expectIncludedCredit: true,
          }),
        }),
      ),
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/payments/fake/confirm"),
      ),
    ).toBe(false);
  });

  it("uses an explicit development payment confirmation and never auto-confirms paid reviews", async () => {
    const fetchMock = mockFetch([scope], false, false);
    const user = userEvent.setup();
    renderWizard();

    expect(
      await screen.findByRole("heading", {
        name: "Understand your assignment before official submission",
      }),
    ).toBeVisible();
    expect(screen.getByText("Have an included evaluation?")).toBeVisible();
    expect(screen.getByText("No included credit")).toBeVisible();

    await selectPrimaryScope(user);
    expect(
      await screen.findByText(/No included evaluation credit is available/),
    ).toBeVisible();

    const file = new File(["assignment"], "assignment.pdf", {
      type: "application/pdf",
    });
    await user.upload(screen.getByLabelText("Choose Assignment files"), file);
    await user.click(screen.getByRole("button", { name: "Save and review" }));

    const originality = await screen.findByRole("checkbox", {
      name: /Originality declaration/,
    });
    expect(
      screen.getByText(
        matchesNormalizedText(
          `Server-owned review price: ${formatLocalizedCurrency(5, "JOD", "en")}. Any applicable tax is calculated at checkout.`,
        ),
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("Payment method")).toBeVisible();
    await user.click(originality);
    await user.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/evaluations/request-1/checkout",
        expect.objectContaining({
          body: JSON.stringify({
            paymentMethod: "Card",
            expectIncludedCredit: false,
          }),
        }),
      ),
    );
    expect(
      await screen.findByText("Development test payment only"),
    ).toBeVisible();
    expect(
      screen.getByText(
        matchesNormalizedText(
          `Total: ${formatLocalizedCurrency(5, "JOD", "en")}`,
        ),
      ),
    ).toBeVisible();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/payments/fake/confirm"),
      ),
    ).toBe(false);

    await user.click(
      screen.getByRole("button", { name: "Complete test payment" }),
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("/payments/fake/confirm"),
        ),
      ).toBe(true),
    );
  });

  it("lets the student retry an included-credit lookup after an error", async () => {
    const fetchMock = mockFetch([scope], false, false, 1);
    const user = userEvent.setup();
    renderWizard();

    await selectPrimaryScope(user);
    expect(
      await screen.findByText(/We could not verify your evaluation credit/),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Retry credit check" }),
    );
    expect(
      await screen.findByText(/No included evaluation credit is available/),
    ).toBeVisible();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).includes("/included-credit"),
      ),
    ).toHaveLength(2);
  });

  it("resumes an owned standard draft from stored state and checks out without a new local file", async () => {
    const fetchMock = mockFetch([scope], false, false, 0, draftDetail());
    const user = userEvent.setup();
    renderWizard("en", "draft-1");

    expect(await screen.findByText(/Q · Qualification \(V1\)/)).toBeVisible();
    expect(screen.getByText(/Saved criteria: A\.P1/)).toBeVisible();
    expect(
      screen.getByText(
        matchesNormalizedText(
          `Saved price: ${formatLocalizedCurrency(12.5, "JOD", "en")}`,
        ),
      ),
    ).toBeVisible();
    expect(
      screen.getByDisplayValue("Please focus on criterion A.P1."),
    ).toHaveAttribute("readonly");
    expect(
      screen.getByDisplayValue("Original evidence narrative"),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "existing-assignment.pdf" }),
    ).toHaveAttribute("href", "/api/v1/evaluations/draft-1/files/file-1");
    expect(
      await screen.findByText(/No included evaluation credit is available/),
    ).toBeVisible();
    const originality = screen.getByRole("checkbox", {
      name: /Originality declaration/,
    });
    expect(originality).toBeChecked();
    expect(originality).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/evaluations/draft-1/checkout",
        expect.objectContaining({
          body: JSON.stringify({
            paymentMethod: "Card",
            expectIncludedCredit: false,
          }),
        }),
      ),
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith(
          `/evaluations/assessment-scopes/${scope.assessmentScopeId}/included-credit`,
        ),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith("/evaluations/assessment-scopes"),
      ),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/evaluations/scoped") &&
          init?.method === "POST",
      ),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/evaluations/draft-1/files"),
      ),
    ).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/evaluations/draft-1/evidence",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          criterionCode: "A.P1",
          narrative: "Original evidence narrative",
        }),
      }),
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith("/draft-1/authenticity-declaration"),
      ),
    ).toBe(false);
  });

  it("uploads only newly selected files and updates restored evidence on the same draft", async () => {
    const fetchMock = mockFetch([scope], false, false, 0, draftDetail());
    const user = userEvent.setup();
    renderWizard("en", "draft-1");

    const evidence = await screen.findByDisplayValue(
      "Original evidence narrative",
    );
    await user.clear(evidence);
    await user.type(evidence, "Updated evidence narrative");
    const addedFile = new File(["new work"], "additional-work.pdf", {
      type: "application/pdf",
    });
    await user.upload(
      screen.getByLabelText("Choose Assignment files"),
      addedFile,
    );
    await user.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/evaluations/draft-1/checkout",
        expect.any(Object),
      ),
    );
    const fileUploads = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input).endsWith("/evaluations/draft-1/files") &&
        init?.method === "POST",
    );
    expect(fileUploads).toHaveLength(1);
    expect((fileUploads[0][1]?.body as FormData).get("file")).toBe(addedFile);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/evaluations/draft-1/evidence",
      expect.objectContaining({
        body: JSON.stringify({
          criterionCode: "A.P1",
          narrative: "Updated evidence narrative",
        }),
      }),
    );
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/evaluations/scoped") &&
          init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("still requires authenticity confirmation when the saved draft has no declaration", async () => {
    const fetchMock = mockFetch(
      [scope],
      false,
      false,
      0,
      draftDetail({ hasAuthenticityDeclaration: false }),
    );
    const user = userEvent.setup();
    renderWizard("en", "draft-1");

    const originality = await screen.findByRole("checkbox", {
      name: /Originality declaration/,
    });
    expect(originality).not.toBeChecked();
    const checkout = screen.getByRole("button", {
      name: "Continue to payment",
    });
    expect(checkout).toBeDisabled();
    await user.click(originality);
    expect(checkout).toBeEnabled();
    await user.click(checkout);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/evaluations/draft-1/authenticity-declaration",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("keeps checkout unavailable when a resumed draft credit check fails until retry succeeds", async () => {
    const fetchMock = mockFetch([scope], false, false, 1, draftDetail());
    const user = userEvent.setup();
    renderWizard("en", "draft-1");

    expect(
      await screen.findByText(/We could not verify your evaluation credit/),
    ).toBeVisible();
    expect(screen.queryByLabelText("Payment method")).not.toBeInTheDocument();
    const checkout = screen.getByRole("button", {
      name: "Continue to payment",
    });
    expect(checkout).toBeDisabled();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith("/evaluations/draft-1/checkout"),
      ),
    ).toBe(false);

    await user.click(
      screen.getByRole("button", { name: "Retry credit check" }),
    );
    expect(
      await screen.findByText(/No included evaluation credit is available/),
    ).toBeVisible();
    expect(checkout).toBeEnabled();
  });

  it.each([
    ["Completed", false, false],
    ["NeedsRevision", false, false],
    ["Draft", true, false],
    ["Draft", false, true],
  ])(
    "rejects non-resumable %s requests without creating a replacement",
    async (status, isRetake, isResit) => {
      const fetchMock = mockFetch(
        [scope],
        false,
        false,
        0,
        draftDetail({ status, isRetake, isResit }),
      );
      renderWizard("en", "draft-1");

      expect(
        await screen.findByText(/not an active standard evaluation draft/),
      ).toBeVisible();
      expect(
        screen.getByRole("link", { name: "Back to My Evaluations" }),
      ).toHaveAttribute("href", "/en/student/evaluations");
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input).endsWith("/evaluations/scoped") &&
            init?.method === "POST",
        ),
      ).toBe(false);
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("/included-credit"),
        ),
      ).toBe(false);
    },
  );

  it("keeps a failed resume in an error state instead of starting a new request", async () => {
    const fetchMock = mockFetch([scope]);
    renderWizard("en", "draft-1");

    expect(
      await screen.findByText(/Unable to load this evaluation draft/),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to My Evaluations" }),
    ).toHaveAttribute("href", "/en/student/evaluations");
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/evaluations/scoped") &&
          init?.method === "POST",
      ),
    ).toBe(false);
  });
});
