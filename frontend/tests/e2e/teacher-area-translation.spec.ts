import { expect, test } from "@playwright/test";

for (const scenario of [
  { locale: "en", width: 1280, height: 800 },
  { locale: "ar", width: 390, height: 844 },
] as const) {
  test(`teacher dashboard, wallet and review copy in ${scenario.locale} (mocked API)`, async ({
    page,
  }) => {
    await page.setViewportSize(scenario);
    const arabic = scenario.locale === "ar";
    const errors: string[] = [];
    const requests: string[] = [];
    const withdrawals: unknown[] = [];
    const reviews: unknown[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const detail = {
      id: "evaluation-1",
      status: "Assigned",
      isRetake: false,
      isResit: true,
      resitOfEvaluationRequestId: "original-request",
      retakeOfEvaluationRequestId: null,
      studentComment: "RAW browser student note",
      criteria: ["A.P1"],
      selectedCriteria: ["A.P1"],
      submissionAttemptNumber: 1,
      calculatedGrade: null,
      sectionResults: [],
      results: [],
      feedback: [],
      evidence: [],
      files: [],
    };
    await page.route("**/api/v1/**", (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      requests.push(`${request.method()} ${path}`);
      if (path.endsWith("/auth/me"))
        return route.fulfill({
          json: { displayName: "RAW Teacher", roles: ["Teacher"] },
        });
      if (path.endsWith("/security/antiforgery"))
        return route.fulfill({ json: { token: "test-token" } });
      if (path.endsWith("/notifications")) return route.fulfill({ json: [] });
      if (path.endsWith("/cart")) return route.fulfill({ json: { items: [] } });
      if (path.endsWith("/teacher/courses")) return route.fulfill({ json: [] });
      if (path.endsWith("/teacher/analytics"))
        return route.fulfill({
          json: {
            courses: 0,
            students: 7,
            pendingReviews: 0,
            averageLessonProgress: 50,
            studentsAtRisk: [],
            studentsAtRiskCount: 0,
          },
        });
      if (path.endsWith("/teacher/wallet"))
        return route.fulfill({
          json: {
            availableBalance: 25.125,
            totalEarned: 25.125,
            totalWithdrawn: 0,
            currency: "JOD",
            transactions: [],
            payouts: [],
          },
        });
      if (path.endsWith("/teacher/wallet/withdrawals")) {
        withdrawals.push(request.postDataJSON());
        return route.fulfill({ json: {} });
      }
      if (path.endsWith("/evaluations/assigned"))
        return route.fulfill({ json: [{ ...detail, filesCount: 0 }] });
      if (path.endsWith("/evaluations/evaluation-1"))
        return route.fulfill({ json: detail });
      if (path.endsWith("/evaluations/evaluation-1/review")) {
        reviews.push(request.postDataJSON());
        return route.fulfill({ json: {} });
      }
      return route.fulfill({ json: {} });
    });

    await page.goto(`/${scenario.locale}/teacher/dashboard`);
    await expect(
      page.getByRole("heading", {
        name: arabic ? "لوحة المعلم" : "Teacher dashboard",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(arabic ? "مسوداتك" : "Your drafts", { exact: true }),
    ).toBeVisible();
    for (const target of ["courses", "courses/new", "evaluations", "wallet"])
      await expect(
        page
          .locator(
            `section.shell a[href="/${scenario.locale}/teacher/${target}"]`,
          )
          .first(),
      ).toBeVisible();

    await page.goto(`/${scenario.locale}/teacher/wallet`);
    const amount = page.getByLabel(
      arabic ? "المبلغ (دينار أردني)" : "Amount (JOD)",
    );
    await expect(amount).toHaveAttribute("min", "0.001");
    await expect(amount).toHaveAttribute("max", "25.125");
    await expect(
      page.getByText(arabic ? "لا توجد عمليات بعد." : "No transactions yet."),
    ).toBeVisible();
    await amount.fill("2.125");
    const destination = page.getByLabel(
      arabic ? "رقم الحساب أو IBAN" : "Account number or IBAN",
    );
    await destination.fill("RAW-browser-bank");
    await page
      .getByRole("button", {
        name: arabic ? "إرسال طلب السحب" : "Submit withdrawal request",
      })
      .click();
    await expect(amount).toHaveValue("");
    await expect(destination).toHaveValue("");
    expect(withdrawals).toEqual([
      {
        amount: 2.125,
        method: "BankTransfer",
        destination: "RAW-browser-bank",
        idempotencyKey: expect.any(String),
      },
    ]);

    await page.goto(`/${scenario.locale}/teacher/evaluations`);
    await expect(
      page.getByText(arabic ? "مراجعة Resit نهائية" : "Resit final review", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .locator(`a[href="/${scenario.locale}/teacher/evaluations/evaluation-1"]`)
      .click();
    await expect(
      page.getByRole("heading", {
        name: arabic ? "مراجعة مهمة الطالب" : "Student assignment review",
      }),
    ).toBeVisible();
    await expect(page.getByText("RAW browser student note")).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await page
      .getByRole("combobox", { name: arabic ? /^النتيجة/ : /^Outcome/ })
      .selectOption("Achieved");
    await page
      .getByLabel(arabic ? "ملاحظات المعلم للطالب" : "Teacher feedback", {
        exact: true,
      })
      .fill("RAW browser feedback");
    await page
      .getByRole("button", {
        name: arabic ? "إرسال المراجعة والملاحظات" : "Send review and feedback",
      })
      .click();
    await expect(
      page.getByRole("status").filter({
        hasText: arabic
          ? "تم حفظ مراجعة BETCCO"
          : "The BETCCO review was saved",
      }),
    ).toBeVisible();
    expect(reviews).toEqual([
      {
        results: [
          {
            criterionCode: "A.P1",
            achievement: "Achieved",
            evidence: null,
            comment: null,
          },
        ],
        feedback: "RAW browser feedback",
        requestRevision: false,
        revisionDueAtUtc: null,
      },
    ]);
    expect(requests).toContain("GET /api/v1/teacher/courses");
    expect(requests).toContain("GET /api/v1/teacher/analytics");
    expect(requests).toContain("GET /api/v1/evaluations/assigned");
    expect(errors).toEqual([]);
    await expect(page.locator("body")).not.toContainText("MISSING_MESSAGE");
  });
}
