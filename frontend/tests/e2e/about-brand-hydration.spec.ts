import { expect, test, type ConsoleMessage } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 664 },
  // Production verification uses an ephemeral localhost certificate.
  ignoreHTTPSErrors: true,
});

const cases = [
  {
    locale: "en",
    direction: "ltr",
    heading: "Clear learning built around application",
    secondary:
      "From learning to assignments and assessment criteria — everything a BTEC student needs in one place.",
    oppositeSecondary:
      "من الدرس إلى المهمة، ومن المهمة إلى تحقيق المعايير — كل ما يحتاجه طالب BTEC في مكان واحد.",
  },
  {
    locale: "ar",
    direction: "rtl",
    heading: "تعلّم واضح مبني على التطبيق",
    secondary:
      "من الدرس إلى المهمة، ومن المهمة إلى تحقيق المعايير — كل ما يحتاجه طالب BTEC في مكان واحد.",
    oppositeSecondary:
      "From learning to assignments and assessment criteria — everything a BTEC student needs in one place.",
  },
] as const;

for (const scenario of cases) {
  test(`${scenario.locale} about page keeps SSR and hydration brand locale consistent`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const hydrationConsoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message: ConsoleMessage) => {
      if (
        message.type() === "error" &&
        /hydration|react error #418|server rendered html/i.test(message.text())
      )
        hydrationConsoleErrors.push(message.text());
    });

    const response = await page.goto(`/${scenario.locale}/about`, {
      waitUntil: "load",
    });
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(400);
    const serverHtml = await response!.text();
    expect(serverHtml).toContain(scenario.secondary);
    expect(serverHtml).not.toContain(scenario.oppositeSecondary);

    await expect(
      page.getByRole("heading", { name: scenario.heading }),
    ).toBeVisible();
    await expect(
      page
        .locator("#main-content")
        .getByText(scenario.secondary, { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(`[lang="${scenario.locale}"][dir="${scenario.direction}"]`),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport);
    expect(pageErrors).toEqual([]);
    expect(hydrationConsoleErrors).toEqual([]);
  });
}
