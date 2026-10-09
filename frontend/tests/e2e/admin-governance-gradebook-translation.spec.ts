import { expect, test } from "@playwright/test";
import ar from "../../messages/ar.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };
import {
  appeal,
  candidate,
  gradebookFilters,
  gradebookPage,
  plan,
  qualifications,
  rubrics,
  staff,
  taxonomy,
  version,
} from "../fixtures/admin-governance-gradebook";

for (const scenario of [
  { locale: "en", surface: "internal-verification", width: 1280, height: 800 },
  { locale: "ar", surface: "evaluation-appeals", width: 390, height: 844 },
  { locale: "ar", surface: "qualification-registry", width: 390, height: 844 },
  { locale: "en", surface: "gradebook", width: 1280, height: 800 },
] as const) {
  test(`${scenario.surface} ${scenario.locale} — MOCKED UI-CONTRACT EVIDENCE`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(scenario);
    const messages = scenario.locale === "ar" ? ar : en,
      c = messages.adminWorkspace;
    const errors: string[] = [],
      reads: string[] = [],
      writes: { path: string; body: unknown }[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/**", (route) => {
      const r = route.request(),
        url = new URL(r.url()),
        p = url.pathname.replace(/^\/api\/v1/, "");
      if (r.method() === "POST") {
        writes.push({ path: p, body: r.postData() ? r.postDataJSON() : null });
        return route.fulfill(
          p === "/internal-verification/plans"
            ? { json: plan }
            : { status: 204 },
        );
      }
      reads.push(p + url.search);
      let data: unknown = {};
      if (p === "/auth/me")
        data = { displayName: "Synthetic Admin", roles: ["Admin"] };
      else if (p === "/notifications") data = [];
      else if (p === "/cart") data = { items: [] };
      else if (p === "/internal-verification/plans") data = [plan];
      else if (p === "/internal-verification/plans/eligible-staff")
        data = staff;
      else if (p === "/taxonomy") data = taxonomy;
      else if (p.endsWith("/candidates")) data = [candidate];
      else if (p === "/evaluation-appeals/review-queue") data = [appeal];
      else if (p === "/assessment-pdf-reports/status")
        data = { isConfigured: true, unavailableReason: null };
      else if (p === "/qualification-registry") data = qualifications;
      else if (p === "/qualification-registry/rubrics") data = rubrics;
      else if (p === "/admin/gradebook/filters") data = gradebookFilters;
      else if (p === "/admin/gradebook")
        data = gradebookPage(Number(url.searchParams.get("page")));
      return route.fulfill({ json: data });
    });
    await page.goto(`/${scenario.locale}/admin/${scenario.surface}`);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      scenario.locale === "ar" ? "rtl" : "ltr",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", scenario.locale);
    await page
      .getByRole("button", { name: messages.cookieConsent.reject, exact: true })
      .click();
    if (scenario.surface === "internal-verification") {
      const copy = c.internalVerificationPlans;
      await expect(
        page.getByRole("heading", { name: copy.title, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(copy.description, { exact: true }),
      ).toBeVisible();
      await page.getByText(plan.selectionRationale, { exact: true }).click();
      const verifier = page.getByRole("combobox", {
        name: copy.assignVerifier,
        exact: true,
      });
      await expect(verifier.locator('option[value="assessor"]')).toHaveCount(0);
      await expect(verifier.locator('option[value="teacher"]')).toHaveCount(0);
      await expect(verifier.locator('option[value="verifier"]')).toHaveText(
        "Raw Verifier — verifier@example.invalid",
      );
      await expect(
        page.getByRole("textbox", { name: copy.sampleReason, exact: true }),
      ).toHaveValue(plan.selectionRationale);
      await verifier.selectOption("verifier");
      await page
        .getByRole("button", { name: copy.select, exact: true })
        .click();
      await expect
        .poll(() => writes)
        .toEqual([
          {
            path: "/internal-verification/plans/plan/samples",
            body: {
              evaluationRequestId: "evaluation",
              assignedVerifierUserId: "verifier",
              selectionRationale: plan.selectionRationale,
            },
          },
        ]);
      expect(reads).toContain(
        "/internal-verification/plans/plan/candidates?take=100",
      );
      expect(reads).toContain("/taxonomy?locale=en");
    } else if (scenario.surface === "evaluation-appeals") {
      const copy = c.evaluationAppeals;
      await expect(
        page.getByRole("heading", { name: copy.title, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(copy.description, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(appeal.reason, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(appeal.status, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: copy.auditExport, exact: true }),
      ).toHaveAttribute("href", "/api/v1/assessment-audit-exports/evaluation");
      await expect(
        page.getByRole("link", { name: copy.pdfReport, exact: true }),
      ).toHaveAttribute(
        "href",
        "/api/v1/assessment-pdf-reports/evaluation?locale=ar",
      );
      await expect(
        page.getByRole("combobox", { name: copy.decision, exact: true }),
      ).toHaveValue("Rejected");
      await page
        .getByRole("textbox", {
          name: `${copy.rationale} ${copy.rationaleHint}`,
          exact: true,
        })
        .fill("  Valid raw decision  ");
      await page
        .getByRole("button", { name: copy.record, exact: true })
        .click();
      await expect
        .poll(() => writes)
        .toEqual([
          {
            path: "/evaluation-appeals/appeal/review",
            body: {
              status: "Rejected",
              decisionRationale: "Valid raw decision",
            },
          },
        ]);
    } else if (scenario.surface === "qualification-registry") {
      const copy = c.qualificationRegistry;
      await expect(
        page.getByRole("heading", { name: copy.title, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(copy.description, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(copy.bindingPolicy, { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("combobox", { name: copy.qualification, exact: true })
          .locator('option[value="qualification"]'),
      ).toHaveText("RAW-QUAL · اسم المؤهل الخام");
      await expect(
        page.getByText(version.sourceReference, { exact: true }),
      ).toBeVisible();
      const row = page.locator("article").filter({
        has: page.getByRole("heading", {
          name: rubrics[0].arabicTitle,
          exact: true,
        }),
      });
      await expect(
        row.getByRole("button", { name: copy.bind, exact: true }),
      ).toBeDisabled();
      await row.getByRole("combobox").selectOption("version");
      await row.getByRole("button", { name: copy.bind, exact: true }).click();
      await expect
        .poll(() => writes)
        .toEqual([
          {
            path: "/qualification-registry/rubrics/rubric/qualification-version/version",
            body: null,
          },
        ]);
    } else {
      const copy = c.gradebook;
      await expect(
        page.getByRole("heading", { name: copy.title, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(copy.description, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("table").getByText("Raw row student 1", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("table").getByText("NeedsRevision", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("table").getByText("NotYetAchieved", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("combobox", { name: copy.course, exact: true })
        .selectOption("course");
      await expect(
        page
          .getByRole("combobox", { name: copy.unit, exact: true })
          .locator('option[value="unit2"]'),
      ).toHaveCount(0);
      await page.getByRole("button", { name: copy.apply, exact: true }).click();
      await expect(
        page.getByRole("button", { name: c.shared.next, exact: true }),
      ).toBeEnabled();
      await page
        .getByRole("button", { name: c.shared.next, exact: true })
        .click();
      await expect(
        page.getByRole("table").getByText("Raw row student 2", { exact: true }),
      ).toBeVisible();
      expect(writes).toEqual([]);
      expect(reads).toContain(
        "/admin/gradebook?locale=en&page=2&pageSize=25&courseId=course",
      );
    }
    await page.screenshot({
      path: testInfo.outputPath(`${scenario.surface}-${scenario.locale}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
