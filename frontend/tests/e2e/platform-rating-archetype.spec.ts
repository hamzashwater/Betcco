import { expect, test, type Page, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import {
  moderationRatings as ratings,
  moderationSummary as summary,
} from "../fixtures/platform-rating-archetype";
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";
// MOCKED UI-CONTRACT EVIDENCE. No real moderation, consent legality,
// database, authorization, public publication, deployment or full WCAG proof.
test.afterEach(async ({}, info) => {
  mkdirSync(info.outputDir, { recursive: true });
  writeFileSync(
    info.outputPath("scenario.json"),
    JSON.stringify(
      {
        classification: "MOCKED UI-CONTRACT EVIDENCE",
        title: info.title,
        status: info.status,
        expectedStatus: info.expectedStatus,
      },
      null,
      2,
    ),
  );
});
async function prepare(page: Page, locale: "en" | "ar", theme: string) {
  const state = {
      ratings: "data",
      summary: "data",
      long: false,
      write: "immediate",
      writeError: false,
    },
    reads: string[] = [],
    writes: { path: string; body: unknown }[] = [],
    unexpected: string[] = [],
    errors: string[] = [];
  let readRelease: (() => void) | undefined,
    writeRelease: (() => void) | undefined;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((theme) => {
    localStorage.setItem("betcco-theme", theme);
    localStorage.setItem(
      "betcco-cookie-consent",
      JSON.stringify({
        necessary: true,
        preferences: false,
        analytics: false,
        marketing: false,
        savedAt: new Date().toISOString(),
      }),
    );
  }, theme);
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace(/^\/api\/v1/, "");
    if (path === "/security/antiforgery")
      return route.fulfill({ json: { token: "mocked-ui-contract-token" } });
    if (
      request.method() === "GET" &&
      ["/admin/platform-ratings", "/admin/platform-ratings/summary"].includes(
        path,
      )
    ) {
      expect(url.search).toBe("");
      reads.push(path);
      const key = path.endsWith("/summary") ? "summary" : "ratings";
      if (state[key] === "pending")
        await new Promise<void>((resolve) => {
          readRelease = resolve;
        });
      if (state[key] === "error")
        return route.fulfill({
          status: 503,
          json: { message: "Synthetic private query failure" },
        });
      const rows = state.long
        ? Array.from({ length: 15 }, (_, i) => ({
            ...ratings[i % 5],
            id: i < 5 ? ratings[i].id : ratings[i % 5].id + "-" + i,
          }))
        : ratings;
      const data =
        key === "ratings"
          ? state.ratings === "empty"
            ? []
            : rows.map((r) => ({
                ...r,
                studentUserId: "SYNTHETIC-HIDDEN-STUDENT-ID",
              }))
          : state.summary === "zero"
            ? {
                ...summary,
                totalCount: 0,
                publishedCount: 0,
                awaitingModerationCount: 0,
                privateWithoutConsentCount: 0,
              }
            : summary;
      return route.fulfill({ json: data });
    }
    if (request.method() !== "GET") {
      if (
        request.method() !== "POST" ||
        !/^\/admin\/platform-ratings\/rating-[a-z-]+\/moderation$/.test(path)
      ) {
        unexpected.push(request.method() + " " + path);
        return route.fulfill({
          status: 409,
          json: { message: "Unexpected synthetic mutation" },
        });
      }
      writes.push({ path, body: request.postDataJSON() });
      if (state.write === "pending")
        await new Promise<void>((resolve) => {
          writeRelease = resolve;
        });
      return state.writeError
        ? route.fulfill({
            status: 409,
            json: { message: "Synthetic retained moderation failure" },
          })
        : route.fulfill({ status: 200, json: {} });
    }
    return route.fulfill(
      roleShellRuntimeResponse(path, locale, ["Admin", "SystemAdmin"]),
    );
  });
  await page.goto(`/${locale}/admin/ratings`);
  return {
    state,
    reads,
    writes,
    unexpected,
    errors,
    releaseRead: () => {
      expect(readRelease).toBeDefined();
      readRelease!();
    },
    releaseWrite: () => {
      expect(writeRelease).toBeDefined();
      writeRelease!();
    },
  };
}
async function keyboardFocus(page: Page, control: Locator) {
  await control.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(control).toBeFocused();
  expect(
    await control.evaluate((el) => getComputedStyle(el).outlineStyle),
  ).toBe("solid");
  expect(
    await control.evaluate((el) => getComputedStyle(el).outlineOffset),
  ).toBe("2px");
}
for (const locale of ["en", "ar"] as const)
  for (const theme of ["light", "dark"])
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 834, height: 1112 },
      { width: 390, height: 844 },
    ]) {
      test(`${locale} ${theme} ${viewport.width}: Consent-aware moderation workspace`, async ({
        page,
      }, info) => {
        test.setTimeout(150_000);
        await page.setViewportSize(viewport);
        const c = await prepare(page, locale, theme),
          copy = locale === "en" ? en : ar,
          t = copy.adminWorkspace.platformRatingModeration,
          main = page.getByRole("main"),
          rows = main.getByRole("article"),
          row = (i: number) => rows.nth(i),
          captures: string[] = [];
        const publish = (i: number) =>
            row(i).getByRole("button", {
              name: ratings[i].allowPublicDisplay
                ? t.publishReview
                : t.noDisplayConsent,
              exact: true,
            }),
          keep = (i: number) =>
            row(i).getByRole("button", { name: t.keepPrivate, exact: true }),
          reason = (i: number) => row(i).getByRole("textbox");
        async function ready(count = 5) {
          await expect(rows).toHaveCount(count);
        }
        async function themeCheck() {
          const toggle = page.getByRole("button", {
            name: copy.navigation.theme.toggle,
          });
          if (!(await page.locator("html").getAttribute("data-theme")))
            await toggle.click();
          if ((await page.locator("html").getAttribute("data-theme")) !== theme)
            await toggle.click();
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            theme,
          );
        }
        async function capture(name: string) {
          await themeCheck();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          ).toBe(true);
          await page.evaluate(() =>
            window.scrollTo({ top: 0, behavior: "instant" }),
          );
          await page.screenshot({
            path: info.outputPath(name + ".png"),
            fullPage: true,
          });
          captures.push(name);
        }
        async function reload() {
          c.state.ratings = "data";
          c.state.summary = "data";
          c.state.long = false;
          c.state.write = "immediate";
          c.state.writeError = false;
          await page.reload();
          await ready();
          await themeCheck();
        }
        await ready();
        await themeCheck();
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        expect(c.reads).toEqual([
          "/admin/platform-ratings",
          "/admin/platform-ratings/summary",
        ]);
        for (let i = 0; i < ratings.length; i++) {
          await expect(reason(i)).toHaveValue(ratings[i].moderationReason);
          await expect(reason(i)).toHaveAttribute("maxlength", "500");
        }
        await expect(
          row(0).getByText(t.notPublished, { exact: true }),
        ).toBeVisible();
        await expect(
          row(1).getByText(t.consentGranted, { exact: true }),
        ).toBeVisible();
        await expect(publish(0)).toBeDisabled();
        await expect(keep(0)).toBeEnabled();
        await expect(publish(2)).toBeEnabled();
        await expect(
          row(3).getByText(t.published, { exact: true }),
        ).toBeVisible();
        await expect(
          row(3).getByText(t.noDisplayConsent, { exact: true }).first(),
        ).toBeVisible();
        await expect(publish(3)).toBeDisabled();
        await expect(
          row(4).getByText(t.theLearnerDidNotAddAWrittenComment, {
            exact: true,
          }),
        ).toBeVisible();
        const summaryRegion = main.getByRole("region", {
          name: t.learnerExperienceSummary,
          exact: true,
        });
        await expect(
          summaryRegion.getByText("843", { exact: true }),
        ).toBeVisible();
        await expect(
          summaryRegion.getByText("400", { exact: true }),
        ).toBeVisible();
        expect(await main.textContent()).not.toContain(
          "SYNTHETIC-HIDDEN-STUDENT-ID",
        );
        expect(
          await reason(1).evaluate((el) => el.getBoundingClientRect().height),
        ).toBeGreaterThanOrEqual(44);
        expect(
          await main
            .getByRole("heading", { level: 1 })
            .evaluate((el) => getComputedStyle(el).fontWeight),
        ).toBe("700");
        await capture(
          "01-populated-summary-consent-publication-score-comment-facts",
        );
        c.state.long = true;
        await page.reload();
        await ready(15);
        await capture("02-long-server-ordered-list");
        await reload();
        await reason(0).fill("private row draft");
        const localReason =
          "ملاحظة محلية طويلة خاصة بالمراجعة ولا تمثل موافقة على النشر. ".repeat(
            6,
          );
        await reason(1).fill(localReason);
        await expect(reason(0)).toHaveValue("private row draft");
        expect(
          await reason(1).evaluate(
            (el) => el.scrollWidth <= el.clientWidth + 1,
          ),
        ).toBe(true);
        await capture("03-independent-reason-drafts-long-arabic");
        await reason(0).fill("   ");
        await capture("04-whitespace-reason-private-action-available");
        c.state.write = "pending";
        await keep(0).click();
        await expect(main.getByRole("status")).toHaveText(t.moderating);
        for (let i = 0; i < 5; i++) {
          await expect(keep(i)).toBeDisabled();
          await expect(publish(i)).toBeDisabled();
        }
        await capture("05-global-moderation-pending");
        c.state.writeError = true;
        c.releaseWrite();
        await expect(main.getByRole("alert")).toHaveText(
          "Synthetic retained moderation failure",
        );
        await expect(reason(1)).toHaveValue(localReason);
        await capture("06-moderation-error-drafts-retained");
        expect(c.writes.at(-1)).toEqual({
          path: "/admin/platform-ratings/rating-z/moderation",
          body: { publish: false, reason: null },
        });
        c.state.write = "immediate";
        c.state.writeError = false;
        const readsBefore = c.reads.length;
        await keep(0).click();
        await expect(main.getByRole("alert")).toHaveCount(0);
        await expect.poll(() => c.reads.slice(readsBefore).length).toBe(2);
        await expect(reason(1)).toHaveValue(localReason);
        await capture("07-keep-private-success-without-consent");
        await expect(publish(1)).toBeEnabled();
        await capture("08-consented-unpublished-publish-enabled");
        c.state.write = "pending";
        await publish(1).click();
        await expect(main.getByRole("status")).toHaveText(t.moderating);
        await capture("09-publish-pending-global-guard");
        c.state.writeError = true;
        c.releaseWrite();
        await expect(main.getByRole("alert")).toHaveText(
          "Synthetic retained moderation failure",
        );
        await expect(reason(1)).toHaveValue(localReason);
        await capture("10-publish-error-retains-reasons");
        c.state.write = "immediate";
        c.state.writeError = false;
        await publish(1).click();
        await expect(main.getByRole("alert")).toHaveCount(0);
        await expect(publish(1)).toBeEnabled();
        await expect(reason(1)).toHaveValue(localReason);
        await capture("11-publish-success-exact-local-reason");
        expect(c.writes.at(-1)).toEqual({
          path: "/admin/platform-ratings/rating-a/moderation",
          body: { publish: true, reason: localReason.trim() },
        });
        await expect(publish(2)).toBeEnabled();
        await capture("12-published-with-consent-action-mechanics-retained");
        const writeCount = c.writes.length;
        await publish(3).scrollIntoViewIfNeeded();
        const disabledBox = await publish(3).boundingBox();
        expect(disabledBox).not.toBeNull();
        await page.mouse.click(
          disabledBox!.x + disabledBox!.width / 2,
          disabledBox!.y + disabledBox!.height / 2,
        );
        expect(c.writes).toHaveLength(writeCount);
        await capture("13-inconsistent-published-no-consent-truthful-facts");
        await keyboardFocus(page, reason(1));
        await capture("14-keyboard-reason-focus");
        await keyboardFocus(page, keep(1));
        await capture("15-keyboard-keep-private-focus");
        await keyboardFocus(page, publish(1));
        await capture("16-keyboard-publish-focus");
        await page.setViewportSize({
          width: Math.max(320, Math.round(viewport.width / 2)),
          height: viewport.height,
        });
        await capture("17-200-percent-reflow-proxy");
        await page.setViewportSize(viewport);
        c.state.summary = "pending";
        await page.reload();
        await ready();
        await expect(main.getByRole("status")).toHaveText(t.loadingSummary);
        await expect(publish(1)).toBeEnabled();
        await capture("18-summary-pending-usable-reviews");
        c.state.summary = "error";
        c.releaseRead();
        await expect(main.getByRole("alert")).toHaveText(t.summaryUnavailable);
        await ready();
        await expect(publish(1)).toBeEnabled();
        await capture("19-summary-cold-error-usable-reviews");
        c.state.summary = "zero";
        await page.reload();
        await ready();
        await expect(
          summaryRegion.getByText(t.allFeedback).locator(".."),
        ).toContainText("0");
        await expect(
          main.getByText(t.emptyLoaded, { exact: true }),
        ).toHaveCount(0);
        await capture("20-zero-summary-does-not-empty-loaded-reviews");
        c.state.ratings = "pending";
        c.state.summary = "data";
        await page.reload();
        await expect(
          main.getByRole("status").filter({ hasText: t.loadingReviews }),
        ).toHaveText(t.loadingReviews);
        await expect(summaryRegion).toBeVisible();
        await expect(rows).toHaveCount(0);
        await capture("21-ratings-cold-loading-no-actions");
        c.state.ratings = "error";
        c.releaseRead();
        await expect(main.getByRole("alert")).toHaveText(
          t.platformReviewsCouldNotBeLoaded,
        );
        await expect(
          main.getByText(t.emptyLoaded, { exact: true }),
        ).toHaveCount(0);
        await capture("22-ratings-cold-error-not-empty");
        c.state.ratings = "empty";
        await page.reload();
        await expect(
          main.getByText(t.emptyLoaded, { exact: true }),
        ).toBeVisible();
        await expect(
          summaryRegion.getByText("843", { exact: true }),
        ).toBeVisible();
        await expect(rows).toHaveCount(0);
        await capture("23-successful-empty-loaded-list-nonzero-summary");
        await reload();
        await reason(1).fill(localReason);
        c.state.ratings = "error";
        await keep(0).click();
        await expect(main.getByRole("alert")).toHaveText(
          t.platformReviewsCouldNotBeLoaded,
        );
        await ready();
        await expect(reason(1)).toHaveValue(localReason);
        await expect(publish(1)).toBeEnabled();
        await expect(publish(0)).toBeDisabled();
        await capture("24-ratings-cached-refresh-error-actions-preserved");
        c.state.summary = "error";
        await keep(0).click();
        await expect(main.getByRole("alert")).toHaveCount(2);
        await ready();
        await expect(summaryRegion).toBeVisible();
        await expect(reason(1)).toHaveValue(localReason);
        await capture("25-summary-cached-refresh-error-independent-context");
        expect(c.unexpected).toEqual([]);
        expect(c.errors).toEqual([]);
        expect(await main.textContent()).not.toContain(
          "SYNTHETIC-HIDDEN-STUDENT-ID",
        );
        writeFileSync(
          info.outputPath("contracts.json"),
          JSON.stringify(
            {
              classification: "MOCKED UI-CONTRACT EVIDENCE",
              locale,
              theme,
              viewport,
              reflowWidth: Math.max(320, Math.round(viewport.width / 2)),
              captures,
              reads: c.reads,
              writes: c.writes,
              unexpected: c.unexpected,
              pageErrors: c.errors,
            },
            null,
            2,
          ),
        );
      });
    }
