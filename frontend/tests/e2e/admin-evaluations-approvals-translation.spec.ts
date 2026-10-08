import { expect, test } from "@playwright/test";
import ar from "../../messages/ar.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };
import {
  courseApprovals,
  courseDetail,
  pendingEvaluations,
  underReviewEvaluations,
} from "../fixtures/admin-evaluations-approvals";
for (const scenario of [
  { locale: "en", width: 1280, height: 800 },
  { locale: "ar", width: 390, height: 844 },
] as const) {
  test(`Admin evaluations/approvals ${scenario.locale} — MOCKED UI-CONTRACT EVIDENCE`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(scenario);
    const messages = scenario.locale === "ar" ? ar : en,
      copy = messages.adminWorkspace;
    const errors: string[] = [],
      writes: { url: string; body: unknown }[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/v1/**", (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        p = url.pathname.replace(/^\/api\/v1/, "");
      if (request.method() === "POST") {
        writes.push({
          url: p,
          body: request.postData() ? request.postDataJSON() : null,
        });
        return route.fulfill({ json: {} });
      }
      if (p === "/auth/me")
        return route.fulfill({
          json: { displayName: "Mock Admin", roles: ["Admin"] },
        });
      if (p === "/evaluations/pending-assignment")
        return route.fulfill({ json: pendingEvaluations });
      if (p === "/evaluations/under-review")
        return route.fulfill({ json: underReviewEvaluations });
      if (p.endsWith("/eligible-evaluators"))
        return route.fulfill({ json: [] });
      if (p === "/assessment-coordination/queue")
        return route.fulfill({
          json: { items: [], page: 1, pageSize: 10, totalCount: 0 },
        });
      if (p === "/resits/authorizations")
        return route.fulfill({
          json: { items: [], page: 1, pageSize: 10, hasNextPage: false },
        });
      if (p === "/admin/courses/approvals")
        return route.fulfill({ json: courseApprovals });
      if (/^\/admin\/courses\/course-\d$/.test(p))
        return route.fulfill({ json: courseDetail(p.split("/").at(-1)) });
      if (p.endsWith("/cover"))
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#1b4f72"/></svg>',
        });
      if (p === "/notifications") return route.fulfill({ json: [] });
      if (p === "/cart") return route.fulfill({ json: { items: [] } });
      return route.fulfill({ json: {} });
    });
    const segment =
      scenario.locale === "en" ? "evaluations" : "course-approvals";
    await page.goto(`/${scenario.locale}/admin/${segment}`);
    const title =
      scenario.locale === "en"
        ? copy.evaluations.title
        : copy.courseApprovals.title;
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: messages.cookieConsent.reject, exact: true })
      .click();
    if (scenario.locale === "en") {
      const c = copy.evaluations;
      await expect(page.getByText(c.eyebrow, { exact: true })).toBeVisible();
      const result = page.locator("article").filter({ hasText: "Distinction" });
      await expect(
        result.getByText("Section A' {raw}:", { exact: true }),
      ).toBeVisible();
      await expect(result.getByText("Raw student narrative")).toBeVisible();
      await expect(result.getByPlaceholder(c.notesPlaceholder)).toHaveAttribute(
        "maxlength",
        "4000",
      );
      const approve = result.getByRole("button", {
          name: c.approve,
          exact: true,
        }),
        resubmit = result.getByRole("button", {
          name: c.requestResubmission,
          exact: true,
        });
      await expect(approve).toBeEnabled();
      await expect(resubmit).toBeDisabled();
      await result
        .getByPlaceholder(c.notesPlaceholder)
        .fill("  Browser raw note  ");
      await result.getByLabel(new RegExp(c.deadline)).fill("2030-01-03T12:00");
      await expect(resubmit).toBeEnabled();
      await result.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath("evaluations-en-desktop.png"),
        fullPage: true,
      });
      await result.screenshot({
        path: testInfo.outputPath("verification-en-desktop.png"),
      });
      await approve.click();
      await expect
        .poll(() => writes)
        .toEqual([
          {
            url: "/evaluations/evaluation-1/internal-verification",
            body: {
              approve: true,
              comment: "  Browser raw note  ",
              resubmissionDueAtUtc: null,
            },
          },
        ]);
    } else {
      const c = copy.courseApprovals,
        p = copy.courseApprovalPreview;
      const course = page.locator("article").filter({
        has: page.getByRole("heading", {
          name: courseApprovals[0].arabicTitle,
          exact: true,
        }),
      });
      const approve = course.getByRole("button", {
        name: c.approveAfterReview,
        exact: true,
      });
      await expect(approve).toBeDisabled();
      await course
        .getByRole("button", { name: c.reviewContent, exact: true })
        .click();
      await expect(approve).toBeEnabled();
      await expect(
        course.getByText(p.learningOutcomes, { exact: true }),
      ).toBeVisible();
      await expect(
        course.getByText("ناتج التعلم من الخادم", { exact: true }),
      ).toBeVisible();
      await expect(
        course.locator("li").filter({ hasText: "Server learning outcome" }),
      ).toContainText("ناتج التعلم من الخادم");
      await expect(course.getByRole("img")).toHaveAttribute(
        "alt",
        `غلاف ${courseApprovals[0].arabicTitle}`,
      );
      await expect(
        course.getByRole("link", { name: "raw-ملف.pdf", exact: true }),
      ).toHaveAttribute("href", "/api/v1/admin/courses/resources/resource-1");
      await expect(
        course.getByText(
          `${p.submissionSettings}3 ${p.attempts} · 25MB · .PDF, .DOCX${p.resubmissionAllowed}`,
          { exact: true },
        ),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("approvals-ar-mobile-full.png"),
        fullPage: true,
      });
      await course
        .getByText(p.learningOutcomes, { exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath("preview-ar-mobile.png"),
      });
      await course
        .getByRole("button", { name: c.returnForRevision, exact: true })
        .click();
      await expect
        .poll(() => writes)
        .toEqual([
          {
            url: "/admin/courses/course-1/review",
            body: { approved: false, reason: "Needs revision" },
          },
        ]);
      const approved = page.locator("article").filter({
        has: page.getByRole("heading", {
          name: courseApprovals[1].arabicTitle,
          exact: true,
        }),
      });
      await approved
        .getByRole("button", { name: c.reviewContent, exact: true })
        .click();
      await expect(approved.getByText(p.free, { exact: true })).toBeVisible();
      await approved
        .getByRole("button", { name: c.publish, exact: true })
        .click();
      await expect.poll(() => writes.length).toBe(2);
      expect(writes[1]).toEqual({
        url: "/admin/courses/course-2/publish",
        body: null,
      });
      await expect(
        approved.getByText(p.learningOutcomes, { exact: true }),
      ).toHaveCount(0);
    }
    expect(errors).toEqual([]);
    await expect(page.locator("body")).not.toContainText("MISSING_MESSAGE");
    await expect(page.locator("body")).not.toContainText("FORMATTING_ERROR");
  });
}
