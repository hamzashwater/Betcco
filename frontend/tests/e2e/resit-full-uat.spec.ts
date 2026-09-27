import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

test.use({ trace: "off", screenshot: "off", video: "off" });

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const fixtureProject = fileURLToPath(
  new URL(
    "../../../backend/tests/Betcco.ResitUatFixture/Betcco.ResitUatFixture.csproj",
    import.meta.url,
  ),
);
const emptyId = "00000000-0000-0000-0000-000000000000";
const rationale =
  "Full UAT exceptional Resit approval after the final original review.";

type Seed = {
  originalId: string;
  scopeId: string;
  studentId: string;
  otherStudentId: string;
  reviewerId: string;
  originalEvaluatorId: string;
  independentEvaluatorId: string;
  creditId: string;
  studentEmail: string;
  otherStudentEmail: string;
  reviewerEmail: string;
  originalEvaluatorEmail: string;
  independentEvaluatorEmail: string;
};

type State = {
  original: {
    id: string;
    status: string;
    grade: string | null;
    submissionAttemptNumber: number;
    paymentId: string | null;
    revisionDueAtUtc: string | null;
    criteriaSnapshotJson: string;
    assessmentScopeSnapshotJson: string;
    sectionResultsJson: string;
    fileIds: string[];
    declarationIds: string[];
    decisionIds: string[];
    resultIds: string[];
  };
  resit: null | {
    id: string;
    status: string;
    grade: string | null;
    submissionAttemptNumber: number;
    paymentId: string | null;
    price: number;
    currency: string;
    revisionDueAtUtc: string | null;
    retakeOfEvaluationRequestId: string | null;
    files: { id: string; storageKey: string; scanStatus: string }[];
    declarations: { id: string; attemptNumber: number }[];
    reviews: {
      attemptNumber: number;
      requestsRevision: boolean;
      grade: string;
    }[];
    feedbackRevisionCount: number;
    resubmissionCount: number;
    assignmentEvaluatorId: string | null;
    payment: null | {
      id: string;
      status: string;
      purpose: string;
      subtotal: number;
      total: number;
      currency: string;
      provider: string;
    };
  };
  creditConsumedByEvaluationRequestId: string | null;
  authorization: null | {
    id: string;
    resitEvaluationRequestId: string | null;
    authorizedByUserId: string;
    reason: string;
    activatedAtUtc: string | null;
    revokedAtUtc: string | null;
  };
};

function fixture<T>(command: string, password: string, ...args: string[]): T {
  const output = execFileSync(
    "dotnet",
    ["run", "--no-build", "--project", fixtureProject, "--", command, ...args],
    {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env,
        BETCCO_RESIT_UAT_FIXTURE: "1",
        BETCCO_RESIT_UAT_PASSWORD: password,
      },
    },
  );
  return JSON.parse(output) as T;
}

function snapshot(originalId: string, resitId: string, password: string) {
  return fixture<State>("snapshot", password, originalId, resitId);
}

async function signIn(
  page: Page,
  email: string,
  password: string,
  signedInIdentities: Set<string>,
) {
  if (signedInIdentities.has(email)) {
    throw new Error(`UAT identity signed in more than once: ${email}`);
  }
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().includes("/api/v1/auth/login") &&
      candidate.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await response).status()).toBe(200);
  await expect(page).not.toHaveURL(/\/en\/login$/);
  signedInIdentities.add(email);
}

// Browser-origin requests retain the real auth cookie, CSRF token, API proxy,
// ASP.NET authorization, and PostgreSQL persistence. No BETCCO API is routed.
async function api<T>(
  page: Page,
  path: string,
  method = "GET",
  body?: unknown,
  requestHeaders: Record<string, string> = {},
): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ path, method, body, requestHeaders }) => {
      const headers: Record<string, string> = { ...requestHeaders };
      if (method !== "GET") {
        const csrf = await fetch("/api/v1/security/antiforgery", {
          credentials: "include",
        });
        if (!csrf.ok) throw new Error(`CSRF bootstrap failed: ${csrf.status}`);
        headers["X-CSRF-TOKEN"] = (
          (await csrf.json()) as { token: string }
        ).token;
      }
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetch(`/api/v1${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "include",
        cache: "no-store",
      });
      const text = await response.text();
      let result: unknown = null;
      if (text) {
        try {
          result = JSON.parse(text);
        } catch {
          result = text;
        }
      }
      return {
        status: response.status,
        body: result,
      };
    },
    { path, method, body, requestHeaders },
  ) as Promise<{ status: number; body: T }>;
}

test("@resit-golden real PostgreSQL Resit lifecycle through browser and API", async ({
  browser,
}, testInfo) => {
  const contextOptions = {
    baseURL: testInfo.project.use.baseURL as string,
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
  };
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () => browser.newContext(contextOptions)),
  );
  const [
    reviewerPage,
    otherStudentPage,
    studentPage,
    originalEvaluatorPage,
    independentEvaluatorPage,
  ] = await Promise.all(contexts.map((context) => context.newPage()));
  let page: Page = reviewerPage;
  const signedInIdentities = new Set<string>();
  const password = `Aa!${randomUUID()}ResitUat`;
  const seed = fixture<Seed>("seed", password);
  const originalBefore = snapshot(seed.originalId, emptyId, password);
  expect(originalBefore.original).toMatchObject({
    status: "Completed",
    grade: "NotYetAchieved",
    submissionAttemptNumber: 2,
  });
  expect(originalBefore.original.decisionIds).toHaveLength(2);
  expect(originalBefore.original.fileIds).toHaveLength(1);
  expect(originalBefore.creditConsumedByEvaluationRequestId).toBeNull();
  const unchanged = (state: State) => {
    expect(state.original).toEqual(originalBefore.original);
    expect(state.creditConsumedByEvaluationRequestId).toBeNull();
  };
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  for (const rolePage of [
    reviewerPage,
    otherStudentPage,
    studentPage,
    originalEvaluatorPage,
    independentEvaluatorPage,
  ]) {
    rolePage.on("pageerror", (error) => pageErrors.push(error.message));
    rolePage.on("response", (response) => {
      if (response.url().includes("/api/v1/") && response.status() >= 500)
        serverErrors.push(`${response.status()} ${response.url()}`);
    });
  }

  let authorizationId = "";
  await test.step("CourseReviewer authorizes the eligible original", async () => {
    await signIn(page, seed.reviewerEmail, password, signedInIdentities);
    const eligible = await api<{
      items: { originalEvaluationRequestId: string }[];
    }>(page, "/resits/eligible?page=1&pageSize=20");
    expect(eligible.status).toBe(200);
    expect(
      eligible.body.items.some(
        (item) => item.originalEvaluationRequestId === seed.originalId,
      ),
    ).toBe(true);
    const authorized = await api<{ authorizationId: string; reason: string }>(
      page,
      `/resits/${seed.originalId}/authorize`,
      "POST",
      { reason: rationale },
    );
    expect(authorized.status).toBe(200);
    expect(authorized.body.reason).toBe(rationale);
    authorizationId = authorized.body.authorizationId;
    const state = snapshot(seed.originalId, emptyId, password);
    unchanged(state);
    expect(state.authorization).toMatchObject({
      id: authorized.body.authorizationId,
      authorizedByUserId: seed.reviewerId,
      reason: rationale,
      resitEvaluationRequestId: null,
    });
    expect(state.authorization?.activatedAtUtc).toBeNull();
  });

  await test.step("A different student cannot read or activate the opportunity", async () => {
    page = otherStudentPage;
    await signIn(page, seed.otherStudentEmail, password, signedInIdentities);
    const original = await api(page, `/evaluations/${seed.originalId}`);
    expect(original.status).toBe(404);
    const privateFile = await api(
      page,
      `/evaluations/${seed.originalId}/files/${originalBefore.original.fileIds[0]}`,
    );
    expect(privateFile.status).toBe(404);
    const opportunities = await api<{ items: unknown[] }>(
      page,
      "/student/resit-authorizations",
    );
    expect(opportunities.status).toBe(200);
    expect(opportunities.body.items).toEqual([]);
    const unauthorized = await api(
      page,
      `/student/resit-authorizations/${authorizationId}/activate`,
      "POST",
    );
    expect(unauthorized.status).toBe(404);
  });

  let resitId = "";
  await test.step("Student activates a separate Draft from the real UI", async () => {
    page = studentPage;
    await signIn(page, seed.studentEmail, password, signedInIdentities);
    const credit = await api<{ available: boolean }>(
      page,
      `/evaluations/assessment-scopes/${seed.scopeId}/included-credit`,
    );
    expect(credit).toMatchObject({ status: 200, body: { available: true } });
    const opportunities = await api<{ items: Record<string, unknown>[] }>(
      page,
      "/student/resit-authorizations",
    );
    expect(opportunities.status).toBe(200);
    expect(JSON.stringify(opportunities.body)).not.toContain(rationale);
    for (const privateField of [
      "reason",
      "revocationReason",
      "authorizedByUserId",
    ]) {
      expect(JSON.stringify(opportunities.body)).not.toContain(
        `"${privateField}"`,
      );
    }
    await page.goto("/en/student/evaluations");
    const region = page.getByRole("region", { name: "Resit opportunities" });
    await expect(
      region.getByRole("button", { name: "Start Resit" }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(rationale);
    const activated = page.waitForResponse(
      (response) =>
        response.url().includes("/student/resit-authorizations/") &&
        response.url().endsWith("/activate") &&
        response.request().method() === "POST",
    );
    await region.getByRole("button", { name: "Start Resit" }).click();
    const activation = await activated;
    expect(activation.status()).toBe(200);
    resitId = (
      (await activation.json()) as { resitEvaluationRequestId: string }
    ).resitEvaluationRequestId;
    expect(resitId).not.toBe(seed.originalId);
    await expect(page).toHaveURL(
      new RegExp(`/en/student/evaluations/${resitId}$`),
    );
    const state = snapshot(seed.originalId, resitId, password);
    unchanged(state);
    expect(state.resit).toMatchObject({
      id: resitId,
      status: "Draft",
      submissionAttemptNumber: 1,
      paymentId: null,
      grade: null,
      files: [],
      declarations: [],
      reviews: [],
    });
    expect(state.resit?.price).toBeGreaterThan(0);
    expect(state.authorization).toMatchObject({
      resitEvaluationRequestId: resitId,
    });
    expect(state.authorization?.activatedAtUtc).not.toBeNull();
  });

  await test.step("Fresh private file and attempt-one authenticity use the real API", async () => {
    const detail = await api<Record<string, unknown>>(
      page,
      `/evaluations/${resitId}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      isResit: true,
      resitOfEvaluationRequestId: seed.originalId,
      status: "Draft",
      submissionAttemptNumber: 1,
      files: [],
      hasAuthenticityDeclaration: false,
    });
    expect(JSON.stringify(detail.body)).not.toContain(rationale);
    await page.getByLabel("Choose Fresh Resit files").setInputFiles({
      name: "fresh-resit.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nFresh Resit evidence\n"),
    });
    const uploaded = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/evaluations/${resitId}/files`) &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Upload files" }).click();
    expect((await uploaded).status()).toBe(204);
    await expect(page.getByText("fresh-resit.pdf · Clean")).toBeVisible();
    await page.getByLabel("Evidence for A.P1").fill("Fresh criterion evidence");
    await page.getByRole("button", { name: "Save evidence" }).click();
    await expect(page.getByText("Evidence saved.")).toBeVisible();
    await page
      .getByLabel(/I declare these files and evidence are my own/)
      .check();
    const declared = page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(`/evaluations/${resitId}/authenticity-declaration`) &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Confirm originality" }).click();
    expect((await declared).status()).toBe(204);
    await expect(page.getByText("Originality confirmed")).toBeVisible();
    const state = snapshot(seed.originalId, resitId, password);
    unchanged(state);
    expect(state.resit?.files).toHaveLength(1);
    expect(state.resit?.files[0].scanStatus).toBe("Clean");
    expect(state.resit?.files[0].storageKey).toMatch(/^objects\//);
    expect(originalBefore.original.fileIds).not.toContain(
      state.resit?.files[0].id,
    );
    expect(state.resit?.declarations).toHaveLength(1);
    expect(state.resit?.declarations[0].attemptNumber).toBe(1);
    expect(originalBefore.original.declarationIds).not.toContain(
      state.resit?.declarations[0].id,
    );
    const freshDetail = await api<Record<string, unknown>>(
      page,
      `/evaluations/${resitId}`,
    );
    expect(JSON.stringify(freshDetail.body)).not.toContain("storageKey");
  });

  let paymentId = "";
  await test.step("Server-priced FakeCard checkout keeps included credit untouched", async () => {
    const creditBypass = await api(
      page,
      `/evaluations/${resitId}/checkout`,
      "POST",
      { paymentMethod: "Card", expectIncludedCredit: true },
      { "Idempotency-Key": randomUUID() },
    );
    expect(creditBypass.status).toBe(400);
    expect(creditBypass.body).toMatchObject({
      message: "RESIT_INCLUDED_CREDIT_NOT_ALLOWED",
    });
    const beforeCheckout = snapshot(seed.originalId, resitId, password);
    unchanged(beforeCheckout);
    expect(beforeCheckout.resit?.status).toBe("Draft");
    expect(beforeCheckout.resit?.payment).toBeNull();
    const checkoutRequest = page.waitForRequest(
      (request) =>
        request.url().endsWith(`/evaluations/${resitId}/checkout`) &&
        request.method() === "POST",
    );
    const checkoutResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/evaluations/${resitId}/checkout`) &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Continue to payment" }).click();
    const requestBody = (await checkoutRequest).postDataJSON() as Record<
      string,
      unknown
    >;
    expect(requestBody).toMatchObject({ expectIncludedCredit: false });
    expect(requestBody).not.toHaveProperty("price");
    const checkout = await checkoutResponse;
    expect(checkout.status()).toBe(200);
    const result = (await checkout.json()) as {
      includedCreditApplied: boolean;
      paymentId: string;
      provider: string;
      subtotal: number;
      total: number;
      currency: string;
    };
    expect(result.includedCreditApplied).toBe(false);
    expect(result.provider).toBe("FakeCard");
    paymentId = result.paymentId;
    const pending = snapshot(seed.originalId, resitId, password);
    unchanged(pending);
    expect(pending.resit?.status).toBe("PendingPayment");
    expect(pending.resit?.paymentId).toBeNull();
    expect(pending.resit?.payment).toMatchObject({
      id: paymentId,
      status: "Processing",
      provider: "FakeCard",
      purpose: "Evaluation",
    });
    expect(result.subtotal).toBe(pending.resit?.price);
    expect(result.currency).toBe(pending.resit?.currency);
    await expect(
      page.getByRole("button", { name: "Complete test payment" }),
    ).toBeVisible();
    const confirmation = page.waitForResponse(
      (response) =>
        response.url().endsWith("/payments/fake/confirm") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Complete test payment" }).click();
    expect((await confirmation).status()).toBe(200);
    const paid = snapshot(seed.originalId, resitId, password);
    unchanged(paid);
    expect(paid.resit?.status).toBe("PendingAssignment");
    expect(paid.resit?.paymentId).toBe(paymentId);
    expect(paid.resit?.payment).toMatchObject({
      id: paymentId,
      status: "Paid",
      provider: "FakeCard",
      subtotal: paid.resit?.price,
      total: result.total,
      currency: result.currency,
    });
  });

  await test.step("Staff queue sees the link and rejects both dependent assessors", async () => {
    page = reviewerPage;
    const queue = await api<
      { id: string; isResit: boolean; resitOfEvaluationRequestId: string }[]
    >(page, "/evaluations/pending-assignment");
    expect(queue.status).toBe(200);
    expect(queue.body).toContainEqual(
      expect.objectContaining({
        id: resitId,
        isResit: true,
        resitOfEvaluationRequestId: seed.originalId,
      }),
    );
    expect(JSON.stringify(queue.body)).not.toContain(rationale);
    const coordination = await api<{ items: Record<string, unknown>[] }>(
      page,
      "/assessment-coordination/queue?page=1&pageSize=10&status=PendingAssignment",
    );
    expect(coordination.status).toBe(200);
    expect(
      coordination.body.items.some(
        (item) =>
          item.id === resitId &&
          item.isResit === true &&
          item.resitOfEvaluationRequestId === seed.originalId,
      ),
    ).toBe(true);
    expect(JSON.stringify(coordination.body)).not.toContain(rationale);
    await page.goto("/en/admin/evaluations");
    await expect(
      page.getByRole("region", { name: "Resit coordination" }),
    ).toContainText(rationale);
    const candidates = await api<{ id: string }[]>(
      page,
      `/evaluations/${resitId}/eligible-evaluators`,
    );
    expect(candidates.status).toBe(200);
    expect(candidates.body.map((candidate) => candidate.id)).toContain(
      seed.independentEvaluatorId,
    );
    expect(candidates.body.map((candidate) => candidate.id)).not.toContain(
      seed.originalEvaluatorId,
    );
    expect(candidates.body.map((candidate) => candidate.id)).not.toContain(
      seed.reviewerId,
    );
    for (const forbiddenId of [seed.originalEvaluatorId, seed.reviewerId]) {
      const rejected = await api<{ code: string }>(
        page,
        `/evaluations/${resitId}/assign`,
        "POST",
        { teacherUserId: forbiddenId },
      );
      expect(rejected).toMatchObject({
        status: 409,
        body: { code: "RESIT_EVALUATOR_INDEPENDENCE_REQUIRED" },
      });
    }
    const assigned = await api(page, `/evaluations/${resitId}/assign`, "POST", {
      teacherUserId: seed.independentEvaluatorId,
    });
    expect(assigned.status).toBe(204);
    const state = snapshot(seed.originalId, resitId, password);
    unchanged(state);
    expect(state.resit?.status).toBe("Assigned");
    expect(state.resit?.assignmentEvaluatorId).toBe(
      seed.independentEvaluatorId,
    );
  });

  await test.step("Only the independent assessor completes one final review", async () => {
    const review = {
      results: [
        {
          criterionCode: "A.P1",
          achievement: "Achieved",
          evidence: "Fresh Resit evidence",
          comment: "Pass criterion met",
        },
      ],
      feedback: "Final independent Resit advisory review.",
      requestRevision: false,
      revisionDueAtUtc: null,
    };
    for (const [rolePage, email] of [
      [originalEvaluatorPage, seed.originalEvaluatorEmail],
      [reviewerPage, seed.reviewerEmail],
    ] as const) {
      page = rolePage;
      if (email === seed.reviewerEmail) {
        expect(signedInIdentities.has(email)).toBe(true);
      } else {
        await signIn(page, email, password, signedInIdentities);
      }
      const denied = await api(
        page,
        `/evaluations/${resitId}/review`,
        "POST",
        review,
      );
      expect(denied.status).toBe(400);
    }
    page = independentEvaluatorPage;
    await signIn(
      page,
      seed.independentEvaluatorEmail,
      password,
      signedInIdentities,
    );
    const assignedDetail = await api<Record<string, unknown>>(
      page,
      `/evaluations/${resitId}`,
    );
    expect(assignedDetail.status).toBe(200);
    expect(JSON.stringify(assignedDetail.body)).not.toContain(rationale);
    const staffHistory = await api(page, "/resits/authorizations");
    expect(staffHistory.status).toBe(403);
    const plan = await api(
      page,
      `/evaluations/${resitId}/criteria-plan`,
      "POST",
      { criterionCodes: ["A.P1"] },
    );
    expect(plan.status).toBe(204);
    const revision = await api(page, `/evaluations/${resitId}/review`, "POST", {
      ...review,
      requestRevision: true,
      revisionDueAtUtc: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(revision.status).toBe(400);
    const beforeFinal = snapshot(seed.originalId, resitId, password);
    expect(beforeFinal.resit?.status).toBe("Assigned");
    expect(beforeFinal.resit?.reviews).toEqual([]);
    const completed = await api(
      page,
      `/evaluations/${resitId}/review`,
      "POST",
      review,
    );
    expect(completed.status).toBe(204);
    const replay = await api(
      page,
      `/evaluations/${resitId}/review`,
      "POST",
      review,
    );
    expect(replay.status).toBe(400);
    const state = snapshot(seed.originalId, resitId, password);
    unchanged(state);
    expect(state.resit).toMatchObject({
      status: "Completed",
      grade: "Pass",
      submissionAttemptNumber: 1,
      revisionDueAtUtc: null,
      reviews: [{ attemptNumber: 1, requestsRevision: false, grade: "Pass" }],
      feedbackRevisionCount: 0,
      resubmissionCount: 0,
    });
  });

  await test.step("Student sees two separate results without private rationale", async () => {
    page = studentPage;
    const credit = await api<{ available: boolean }>(
      page,
      `/evaluations/assessment-scopes/${seed.scopeId}/included-credit`,
    );
    expect(credit).toMatchObject({ status: 200, body: { available: true } });
    const history = await api<{
      items: {
        id: string;
        isResit: boolean;
        resitOfEvaluationRequestId: string | null;
        calculatedGrade: string | null;
      }[];
    }>(page, "/evaluations/mine?page=1&pageSize=20");
    expect(history.status).toBe(200);
    expect(history.body.items).toContainEqual(
      expect.objectContaining({
        id: seed.originalId,
        isResit: false,
        calculatedGrade: "NotYetAchieved",
      }),
    );
    expect(history.body.items).toContainEqual(
      expect.objectContaining({
        id: resitId,
        isResit: true,
        resitOfEvaluationRequestId: seed.originalId,
        calculatedGrade: "Pass",
      }),
    );
    expect(JSON.stringify(history.body)).not.toContain(rationale);
    await page.goto("/en/student/evaluations");
    await expect(page.getByText("Final Resit advisory result")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(rationale);
    await expect(page.getByText("Resit final review")).toBeVisible();
    await page.goto(`/en/student/evaluations/${resitId}`);
    await expect(
      page.getByRole("heading", { name: "Final Resit advisory result" }),
    ).toBeVisible();
    await expect(page.getByText("Pass", { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(rationale);
    await expect(
      page.getByRole("button", { name: /resubmit|revision/i }),
    ).toHaveCount(0);
    const resubmit = await api(
      page,
      `/evaluations/${resitId}/resubmit`,
      "POST",
    );
    expect(resubmit.status).toBe(400);
    unchanged(snapshot(seed.originalId, resitId, password));
  });

  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
  expect(signedInIdentities).toEqual(
    new Set([
      seed.reviewerEmail,
      seed.otherStudentEmail,
      seed.studentEmail,
      seed.originalEvaluatorEmail,
      seed.independentEvaluatorEmail,
    ]),
  );
  await Promise.all(contexts.map((context) => context.close()));
});
