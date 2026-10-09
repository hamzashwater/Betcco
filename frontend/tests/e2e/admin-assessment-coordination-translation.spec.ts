import { expect, test } from "@playwright/test";
import ar from "../../messages/ar.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };
import {
  adjustmentSummary,
  candidates,
  pendingEvaluation,
  queuePage,
  requestId,
  resitPage,
  revisionId,
} from "../fixtures/admin-assessment-coordination";

for (const scenario of [
  { locale: "en", width: 1280, height: 800 },
  { locale: "ar", width: 390, height: 844 },
] as const) {
  test(`Admin assessment coordination ${scenario.locale} — MOCKED UI-CONTRACT EVIDENCE`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(scenario);
    const messages = scenario.locale === "ar" ? ar : en;
    const copy = messages.adminWorkspace,
      q = copy.assessmentCoordination,
      a = copy.evaluatorAssignment,
      r = copy.resitCoordination;
    const errors: string[] = [],
      writes: { path: string; method: string; body: unknown }[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/v1/**", (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        p = url.pathname.replace(/^\/api\/v1/, "");
      if (["POST", "PUT"].includes(request.method())) {
        writes.push({
          path: p,
          method: request.method(),
          body: request.postDataJSON(),
        });
        return route.fulfill({ status: 204 });
      }
      if (p === "/auth/me")
        return route.fulfill({
          json: {
            displayName: "Synthetic Reviewer",
            roles: ["CourseReviewer"],
          },
        });
      if (p === "/notifications") return route.fulfill({ json: [] });
      if (p === "/cart") return route.fulfill({ json: { items: [] } });
      if (p === "/assessment-coordination/queue")
        return route.fulfill({ json: queuePage(p + url.search) });
      if (p === "/resits/authorizations")
        return route.fulfill({
          json: resitPage(Number(url.searchParams.get("page"))),
        });
      if (p === "/evaluations/pending-assignment")
        return route.fulfill({ json: [pendingEvaluation] });
      if (p === "/evaluations/under-review") return route.fulfill({ json: [] });
      if (p.endsWith("/eligible-evaluators"))
        return route.fulfill({ json: candidates });
      if (
        p ===
        `/assessment-coordination/${revisionId}/reasonable-adjustments/revision-deadline`
      )
        return route.fulfill({ json: adjustmentSummary });
      return route.fulfill({ json: {} });
    });
    await page.goto(`/${scenario.locale}/admin/evaluations`);
    const queue = page.getByRole("region", { name: q.title, exact: true });
    await expect(queue).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      scenario.locale === "ar" ? "rtl" : "ltr",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", scenario.locale);
    await page
      .getByRole("button", { name: messages.cookieConsent.reject, exact: true })
      .click();
    await expect(queue.getByLabel(q.statusFilter)).toHaveValue("");
    for (const [value, label] of Object.entries(q.statuses))
      await expect(
        queue
          .getByLabel(q.statusFilter)
          .getByRole("option", { name: label, exact: true }),
      ).toHaveAttribute("value", value);
    await expect(
      queue.getByText(q.mappingBlocker, { exact: true }),
    ).toBeVisible();
    await expect(
      queue.getByText(q.noEvaluatorBlocker, { exact: true }),
    ).toBeVisible();
    await expect(
      queue.getByText(q.stateChangedBlocker, { exact: true }),
    ).toBeVisible();
    await expect(
      queue
        .getByText(
          scenario.locale === "ar"
            ? "عنوان الوحدة من الخادم"
            : "Server Unit title",
          { exact: false },
        )
        .first(),
    ).toBeVisible();
    const target = queue.locator("article").filter({
      has: page.getByRole("heading", {
        name: `${q.request} ${requestId.slice(0, 8)}`,
        exact: true,
      }),
    });
    await expect(
      target.getByText(copy.shared.resit, { exact: true }),
    ).toBeVisible();
    await expect(
      target.getByText(`${copy.shared.originalRequest} ORIGINAL`, {
        exact: true,
      }),
    ).toBeVisible();
    await target
      .getByRole("button", { name: q.setTarget, exact: true })
      .click();
    await target
      .getByLabel(q.expectedCompletion, { exact: true })
      .fill("2030-01-03T12:00");
    await target
      .getByLabel(q.internalReason, { exact: true })
      .fill("  Browser completion reason  ");
    await page.screenshot({
      path: testInfo.outputPath(
        `coordination-${scenario.locale}-${scenario.width}.png`,
      ),
      fullPage: true,
    });
    await target.screenshot({
      path: testInfo.outputPath(`target-${scenario.locale}.png`),
    });
    await target
      .getByRole("button", { name: q.saveTarget, exact: true })
      .click();
    await expect(
      target.getByText(q.savedTarget, { exact: true }),
    ).toBeVisible();
    // Playwright's browser and node processes use their existing timezone rules.
    const iso = await page.evaluate(() =>
      new Date("2030-01-03T12:00").toISOString(),
    );
    expect(writes[0]).toEqual({
      path: `/assessment-coordination/${requestId}/expected-completion`,
      method: "PUT",
      body: {
        expectedCompletionAtUtc: iso,
        reason: "Browser completion reason",
      },
    });
    const assignment = page
      .locator("article")
      .filter({ has: page.getByText(a.title, { exact: true }) });
    await expect(
      assignment.getByText(pendingEvaluation.studentComment, { exact: true }),
    ).toBeVisible();
    await expect(assignment.getByText("Paid", { exact: true })).toBeVisible();
    await expect(
      assignment.getByRole("button", { name: a.assign, exact: true }),
    ).toBeDisabled();
    await assignment
      .getByLabel(a.selectEvaluator, { exact: true })
      .selectOption(candidates[1].id);
    await assignment.screenshot({
      path: testInfo.outputPath(`assignment-${scenario.locale}.png`),
    });
    await assignment
      .getByRole("button", { name: a.assign, exact: true })
      .click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1]).toEqual({
      path: `/evaluations/${requestId}/assign`,
      method: "POST",
      body: { teacherUserId: candidates[1].id },
    });
    const revision = queue.locator("article").filter({
      has: page.getByRole("heading", {
        name: `${q.request} ${revisionId.slice(0, 8)}`,
        exact: true,
      }),
    });
    await revision
      .getByRole("button", { name: q.manageAdjustment, exact: true })
      .click();
    await expect(
      revision.getByText(adjustmentSummary.history[0].reason, { exact: true }),
    ).toBeVisible();
    await expect(
      revision.getByText(
        `${q.revoked} · ${adjustmentSummary.history[0].revocationReason}`,
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    await expect(
      revision.getByLabel(q.adjustedDeadline, { exact: true }),
    ).toBeVisible();
    await revision.screenshot({
      path: testInfo.outputPath(`adjustment-${scenario.locale}.png`),
    });
    const history = page.getByRole("region", { name: r.region, exact: true });
    await expect(
      history.getByText(r.description, { exact: true }),
    ).toBeVisible();
    await expect(history.getByText(r.authorized, { exact: true })).toHaveCount(
      2,
    );
    await expect(history.getByText(r.activated, { exact: true })).toHaveCount(
      1,
    );
    await expect(history.getByText(r.revoked, { exact: true })).toHaveCount(1);
    await expect(
      history.getByText(
        `${r.privateRevocationReason} Raw PRIVATE revocation reason`,
        { exact: true },
      ),
    ).toBeVisible();
    await history.screenshot({
      path: testInfo.outputPath(`resit-${scenario.locale}.png`),
    });
    await history
      .getByRole("button", { name: copy.shared.next, exact: true })
      .click();
    await expect(
      history.getByRole("button", { name: copy.shared.previous, exact: true }),
    ).toBeEnabled();
    await expect(
      history.getByRole("button", { name: copy.shared.next, exact: true }),
    ).toBeDisabled();
    expect(writes).toHaveLength(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
