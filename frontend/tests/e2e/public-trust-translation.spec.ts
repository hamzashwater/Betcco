import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import ar from "../../messages/ar.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };
import {
  trustCertificate,
  trustDocument,
  trustRating,
  trustRatingSummary,
  trustSettings,
  trustTrack,
} from "../helpers/public-trust-fixtures";

for (const scenario of [
  { locale: "en", width: 1280, height: 800 },
  { locale: "ar", width: 390, height: 844 },
] as const) {
  test(`public documents/identity/trust ${scenario.locale} (MOCKED UI-CONTRACT EVIDENCE)`, async ({
    page,
  }, testInfo) => {
    const messages = scenario.locale === "ar" ? ar : en,
      m = messages.publicTrust;
    const errors: string[] = [],
      requests: { method: string; path: string; body: string | null }[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /hydration|react error|MISSING_MESSAGE|INVALID_MESSAGE/i.test(
          message.text(),
        )
      )
        errors.push(message.text());
    });
    await page.setViewportSize(scenario);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install();
    await page.route("**/api/v1/**", (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname;
      requests.push({
        method: req.method(),
        path: path + url.search,
        body: req.postData(),
      });
      if (path.endsWith("/auth/me"))
        return route.fulfill({
          json: {
            id: "raw-user",
            displayName: "RAW Student",
            roles: ["Student"],
          },
        });
      if (path.endsWith("/security/antiforgery"))
        return route.fulfill({ json: { token: "test-token" } });
      if (path.endsWith("/settings/public"))
        return route.fulfill({ json: trustSettings });
      if (path.includes("/legal/"))
        return route.fulfill({ json: trustDocument });
      if (path.includes("/student-tools/certificates/INVALID"))
        return route.fulfill({
          status: 404,
          json: { message: "RAW invalid code" },
        });
      if (path.includes("/student-tools/certificates/"))
        return route.fulfill({ json: trustCertificate });
      if (path.endsWith("/platform-ratings/mine"))
        return route.fulfill({ json: trustRating });
      if (path.endsWith("/platform-ratings"))
        return route.fulfill({ json: trustRatingSummary });
      if (path.endsWith("/privacy/requests"))
        return route.fulfill({
          json:
            req.method() === "POST"
              ? { id: "created-request" }
              : {
                  items: [
                    {
                      id: "raw-request",
                      requestType: "Access",
                      status: "IdentityVerificationRequired",
                      createdAtUtc: "2026-03-17T14:05:00Z",
                      resolutionSummary: "RAW staff resolution معالجة",
                    },
                  ],
                  page: 1,
                  pageSize: 20,
                  totalCount: 1,
                },
        });
      if (path.endsWith("/engagement/leads"))
        return route.fulfill({ json: {} });
      if (path.includes("/taxonomy/tracks/"))
        return route.fulfill({ json: trustTrack });
      if (path.endsWith("/taxonomy"))
        return route.fulfill({ json: { tracks: [] } });
      if (path.endsWith("/notifications")) return route.fulfill({ json: [] });
      if (path.endsWith("/cart")) return route.fulfill({ json: { items: [] } });
      return route.fulfill({
        json: { items: [], page: 1, pageSize: 12, totalCount: 0 },
      });
    });
    async function evidence(name: string) {
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur();
        window.scrollTo(0, 0);
      });
      await page.clock.runFor(32);
      await expect(
        page.locator(
          `[lang="${scenario.locale}"][dir="${scenario.locale === "ar" ? "rtl" : "ltr"}"]`,
        ),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
      await testInfo.attach(name, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      if (process.env.BETCCO_EVIDENCE_DIR) {
        mkdirSync(process.env.BETCCO_EVIDENCE_DIR, { recursive: true });
        await page.screenshot({
          path: `${process.env.BETCCO_EVIDENCE_DIR}/${scenario.locale}-${name}.png`,
          fullPage: true,
        });
      }
    }
    await page.goto(`/${scenario.locale}/about`);
    await page
      .getByRole("button", { name: messages.cookieConsent.reject, exact: true })
      .click();
    // SSR hydrates settings with the existing 30/60-second freshness window.
    // Expire that window and trigger the existing focus refetch; a browser-only
    // API mock cannot override fresh SSR data. Production cache rules stay intact.
    await page.clock.fastForward(60_001);
    await page.evaluate(() =>
      window.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(
      page.getByRole("heading", {
        name: m.content.clearLearningBuiltAroundApplication,
      }),
    ).toBeVisible();
    await expect(
      page.locator("main").getByText(trustSettings.BrandSecondaryMessage),
    ).toBeVisible();
    await evidence("about");
    const guide = page.getByRole("link", { name: m.content.openTheUserGuide });
    await guide.focus();
    await expect(guide).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${scenario.locale}/guide$`));
    await expect(
      page.getByRole("heading", { name: m.content.usingBetcco }),
    ).toBeVisible();
    await expect(
      page
        .locator("main")
        .getByRole("link", { name: m.content.requestEvaluation }),
    ).toHaveAttribute("href", `/${scenario.locale}/student/evaluations/new`);
    await evidence("guide");

    await page.goto(`/${scenario.locale}/terms`);
    await expect(
      page.getByRole("heading", { name: trustDocument.title }),
    ).toBeVisible();
    await expect(
      page.getByText(`Registration: ${trustSettings.LegalRegistrationNumber}`),
    ).toBeVisible();
    await expect(
      page.getByText(`Address: ${trustSettings.LegalAddress}`),
    ).toBeVisible();
    await expect(
      page.getByText(m.content.thisIsAnOperationalPlatformDocumentAndRequires),
    ).toBeVisible();
    if (scenario.locale === "en")
      await expect(
        page.getByText(m.content.arabicOperationalReference),
      ).toBeVisible();
    await evidence("legal-document");

    await page.goto(`/${scenario.locale}/security`);
    await expect(
      page.getByRole("heading", { name: m.content.submitASecurityReport }),
    ).toBeVisible();
    await page
      .getByPlaceholder(m.content.name, { exact: true })
      .fill("RAW name اسم");
    await page
      .getByPlaceholder(m.content.emailOrPhone)
      .fill("raw@example.test");
    await page
      .getByPlaceholder(m.content.message, { exact: true })
      .fill("RAW security report بلاغ");
    await page.getByRole("checkbox").check();
    const send = page.getByRole("button", {
      name: m.content.send,
      exact: true,
    });
    await send.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText(
      m.content.thankYouYourMessageWasReceived,
    );
    expect(
      requests.some(
        (r) =>
          r.method === "POST" &&
          r.path === "/api/v1/engagement/leads" &&
          r.body ===
            JSON.stringify({
              name: "RAW name اسم",
              contact: "raw@example.test",
              message: "RAW security report بلاغ",
              category: "SecurityReport",
              consent: true,
            }),
      ),
    ).toBe(true);
    await evidence("security-form");

    await page.goto(`/${scenario.locale}/privacy-center`);
    await expect(
      page.getByRole("heading", { name: m.content.yourPrivacyRequests }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: m.content.requestType }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder(
        m.content.explainTheRequestWithoutSendingSecretsOrSensitive,
      ),
    ).toBeVisible();
    await expect(page.getByText("RAW staff resolution معالجة")).toBeVisible();
    await expect(
      page.getByRole("button", { name: m.content.cancelRequest }),
    ).toBeEnabled();
    await evidence("privacy-centre");

    await page.goto(`/${scenario.locale}/tracks/raw-track`);
    await expect(
      page.getByRole("heading", { name: trustTrack.name }),
    ).toBeVisible();
    for (const name of [
      m.content.gradesAndStages,
      m.content.specializations,
      m.content.subjects,
    ])
      await expect(
        page.locator("main").getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    await expect(page.getByText(trustTrack.description)).toBeVisible();
    await evidence("track");

    await page.goto(`/${scenario.locale}/platform-rating`);
    await expect(
      page.getByRole("heading", { name: m.rating.rateBetcco }),
    ).toBeVisible();
    await expect(
      page.getByText(trustRatingSummary.reviews[0].authorLabel),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: m.rating.supportAndCommunication }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveText(
      m.rating.yourReviewIsSavedAndAwaitingAdminReview,
    );
    await page
      .getByPlaceholder(m.rating.howCanWeImproveYourExperience)
      .fill("RAW edited review تعليق");
    const submit = page.getByRole("button", { name: m.rating.submitFeedback });
    await submit.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() =>
        requests.some(
          (r) =>
            r.method === "PUT" &&
            r.path === "/api/v1/platform-ratings/mine" &&
            r.body ===
              JSON.stringify({
                courseQualityScore: 4,
                easeOfUseScore: 3,
                supportScore: 2,
                recommendationScore: 5,
                comment: "RAW edited review تعليق",
                allowPublicDisplay: true,
              }),
        ),
      )
      .toBe(true);
    await evidence("platform-rating");

    await page.goto(`/${scenario.locale}/certificates/RAW-CODE`);
    await expect(
      page.getByRole("heading", {
        name: m.certificate.certificateVerification,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(m.certificate.certificateVerified, { exact: true }),
    ).toBeVisible();
    for (const raw of [
      trustCertificate.studentName,
      trustCertificate.courseTitle,
      trustCertificate.verificationCode,
    ])
      await expect(page.getByText(raw, { exact: true })).toBeVisible();
    await expect(
      page.getByText(trustCertificate.verificationCode),
    ).toHaveAttribute("dir", "ltr");
    await expect(
      page.getByRole("link", { name: m.certificate.backToBetcco }),
    ).toHaveAttribute("href", `/${scenario.locale}`);
    await evidence("certificate-valid");
    await page.goto(`/${scenario.locale}/certificates/INVALID`);
    await expect(
      page.getByText(m.certificate.noValidCertificateWasFoundForThisCode),
    ).toBeVisible();
    await expect(
      page.getByText(m.certificate.certificateVerified, { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(m.certificate.thisIsABetccoCompletionCertificateNotA),
    ).toBeVisible();
    await evidence("certificate-invalid");
  });
}
