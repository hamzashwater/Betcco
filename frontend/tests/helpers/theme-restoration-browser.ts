import { expect, type Page, type TestInfo } from "@playwright/test";

type Evidence = {
  violations: { directive: string; blockedURI: string }[];
  frames: { time: number; theme: string | null }[];
};
async function prepare(page: Page, stored?: string) {
  await page.context().addInitScript((stored) => {
    if (stored) localStorage.setItem("betcco-theme", stored);
    localStorage.setItem(
      "betcco-cookie-consent",
      JSON.stringify({ necessary: true, savedAt: new Date().toISOString() }),
    );
    const evidence: Evidence = { violations: [], frames: [] };
    Object.assign(window, { __themeEvidence: evidence });
    document.addEventListener("securitypolicyviolation", (event) =>
      evidence.violations.push({
        directive: event.effectiveDirective,
        blockedURI: event.blockedURI,
      }),
    );
    let frames = 0;
    const observe = (time: number) => {
      evidence.frames.push({
        time,
        theme: document.documentElement.dataset.theme ?? null,
      });
      if (++frames < 120) requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  }, stored);
  // Synthetic guest data only. HTML, CSP, storage and navigation are real.
  await page.route("**/api/v1/**", (route) =>
    route.fulfill(
      new URL(route.request().url()).pathname.endsWith("/auth/me")
        ? { status: 401, json: { message: "Synthetic unauthenticated guest" } }
        : new URL(route.request().url()).pathname.endsWith("/taxonomy")
          ? {
              json: {
                tracks: [],
                grades: [],
                specializations: [],
                subjects: [],
              },
            }
          : { json: {} },
    ),
  );
}
async function snapshot(page: Page) {
  return page.evaluate(() => {
    const script = [...document.scripts].find((node) =>
      node.textContent?.includes("localStorage.getItem('betcco-theme')"),
    );
    return {
      theme: document.documentElement.dataset.theme ?? null,
      storage: localStorage.getItem("betcco-theme"),
      script: script
        ? {
            nonce: script.nonce,
            type: script.type,
            async: script.async,
            defer: script.defer,
          }
        : null,
      paint: performance
        .getEntriesByType("paint")
        .map((entry) => ({ name: entry.name, time: entry.startTime })),
      ...(window as unknown as { __themeEvidence: Evidence }).__themeEvidence,
    };
  });
}
function policyNonce(csp: string) {
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  const scripts = csp
    .split(";")
    .find((part) => part.trim().startsWith("script-src "))!;
  expect(scripts).toContain("'strict-dynamic'");
  expect(scripts).not.toMatch(/'unsafe-inline'|'unsafe-eval'/);
  for (const directive of [
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ])
    expect(csp).toContain(directive);
  return nonce!;
}
async function switchLocale(page: Page, locale: "en" | "ar") {
  const languageName =
    locale === "ar" ? "التبديل إلى الإنجليزية" : "Switch to Arabic";
  if (page.viewportSize()!.width < 768) {
    await page
      .getByRole("button", {
        name: locale === "ar" ? "فتح القائمة" : "Open menu",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .filter({ visible: true })
      .getByRole("link", { name: languageName, exact: true })
      .focus();
  } else
    await page.getByRole("link", { name: languageName, exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(
    (url) => url.pathname === `/${locale === "ar" ? "en" : "ar"}/about`,
  );
  await page.waitForLoadState("networkidle");
}
export async function verifyThemeRestoration(
  page: Page,
  info: TestInfo,
  locale: "en" | "ar",
) {
  const pageErrors: string[] = [],
    consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await prepare(page);
  const route = `/${locale}/about`,
    response = await page.goto(route, { waitUntil: "networkidle" });
  expect(response!.status()).toBe(200);
  const csp = response!.headers()["content-security-policy"],
    nonce = policyNonce(csp),
    html = await response!.text();
  const initial = await snapshot(page);
  expect(initial.theme).toBe("dark");
  expect(initial.storage).toBeNull();
  expect(initial.script?.nonce).toBe(nonce);
  expect(initial.violations).toEqual([]);
  expect(html).toContain(`nonce="${nonce}"`);
  expect(response!.headers()["x-frame-options"]).toBe("DENY");
  expect(response!.headers()["x-content-type-options"]).toBe("nosniff");
  await page
    .getByRole("button", {
      name: locale === "ar" ? "تبديل المظهر" : "Toggle theme",
      exact: true,
    })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const selected = await snapshot(page);
  expect(selected.storage).toBe("light");
  const reloadResponse = await page.reload({ waitUntil: "networkidle" }),
    reloaded = await snapshot(page);
  expect(reloaded.theme).toBe("light");
  expect(reloaded.storage).toBe("light");
  const reloadNonce = policyNonce(
    reloadResponse!.headers()["content-security-policy"],
  );
  expect(reloadNonce).not.toBe(nonce);
  expect(reloaded.script?.nonce).toBe(reloadNonce);
  const alternate = locale === "ar" ? "en" : "ar";
  await page.evaluate(() => {
    const evidence = (window as unknown as { __themeEvidence: Evidence })
      .__themeEvidence;
    evidence.frames = [];
    let frames = 0;
    const observe = (time: number) => {
      evidence.frames.push({
        time,
        theme: document.documentElement.dataset.theme ?? null,
      });
      if (++frames < 120) requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  });
  await switchLocale(page, locale);
  const navigated = await snapshot(page);
  expect(navigated.theme).toBe("light");
  expect(navigated.storage).toBe("light");
  expect(navigated.frames.length).toBeGreaterThan(0);
  expect(navigated.frames.every((frame) => frame.theme === "light")).toBe(true);
  await page
    .getByRole("button", {
      name: alternate === "ar" ? "تبديل المظهر" : "Toggle theme",
      exact: true,
    })
    .click();
  await page.reload({ waitUntil: "networkidle" });
  const dark = await snapshot(page);
  expect(dark.theme).toBe("dark");
  expect(dark.storage).toBe("dark");
  await switchLocale(page, alternate);
  const darkNavigated = await snapshot(page);
  expect(darkNavigated.theme).toBe("dark");
  expect(darkNavigated.storage).toBe("dark");
  await page.evaluate(() =>
    localStorage.setItem("betcco-theme", "invalid-theme"),
  );
  await page.reload({ waitUntil: "networkidle" });
  const invalid = await snapshot(page);
  expect(invalid.theme).toBe("dark");
  expect(invalid.storage).toBe("invalid-theme");
  expect(invalid.violations).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(
    consoleErrors.filter((message) =>
      /hydration|react error #418|server rendered html|content security policy/i.test(
        message,
      ),
    ),
  ).toEqual([]);
  const forged = await page.request.get(route, {
    headers: { "x-nonce": "untrusted-request-nonce" },
  });
  const forgedNonce = policyNonce(forged.headers()["content-security-policy"]);
  expect(forgedNonce).not.toBe("untrusted-request-nonce");
  expect(forgedNonce).not.toBe(nonce);
  expect(await forged.text()).toContain(`nonce="${forgedNonce}"`);
  // Parser-inserted scripts exercise CSP without DevTools evaluation or the
  // existing strict-dynamic policy's trust for non-parser-created scripts.
  // The PWA worker forwards navigations outside Playwright's page routing.
  // Isolate this tampered-response check so that interception is guaranteed.
  const untrustedContext = await page.context().browser()!.newContext({
    viewport: page.viewportSize()!,
    serviceWorkers: "block",
  });
  const untrusted = await untrustedContext.newPage();
  let blockedUntrustedScripts: Evidence["violations"] = [];
  try {
    await prepare(untrusted);
    await untrusted.route(`**/${locale}/about`, async (route) => {
      const response = await route.fetch();
      const html = await response.text();
      await route.fulfill({
        response,
        body: html.replace(
          "</body>",
          "<script>window.__untrustedThemeScriptExecuted=true</script>" +
            '<script nonce="incorrect-nonce">window.__untrustedThemeScriptExecuted=true</script></body>',
        ),
      });
    });
    const response = await untrusted.goto(
      new URL(route, page.url()).toString(),
    );
    policyNonce(response!.headers()["content-security-policy"]);
    expect(await response!.text()).toContain('nonce="incorrect-nonce"');
    await expect
      .poll(async () => (await snapshot(untrusted)).violations.length)
      .toBe(2);
    blockedUntrustedScripts = (await snapshot(untrusted)).violations;
    expect(
      await untrusted.evaluate(
        () =>
          (window as unknown as { __untrustedThemeScriptExecuted?: boolean })
            .__untrustedThemeScriptExecuted,
      ),
    ).toBeUndefined();
  } finally {
    await untrustedContext.close();
  }
  const cold = await page
    .context()
    .browser()!
    .newContext({ viewport: page.viewportSize()!, reducedMotion: "reduce" });
  const coldPage = await cold.newPage();
  const coldPageErrors: string[] = [],
    coldConsoleErrors: string[] = [];
  coldPage.on("pageerror", (error) => coldPageErrors.push(error.message));
  coldPage.on("console", (message) => {
    if (message.type() === "error") coldConsoleErrors.push(message.text());
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await prepare(coldPage, "light");
    await coldPage.route("**/_next/static/**/*.js", async (route) => {
      await gate;
      await route.continue();
    });
    await coldPage.goto(new URL(route, page.url()).toString(), {
      waitUntil: "commit",
    });
    await expect(coldPage.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(coldPage.locator("html")).toHaveAttribute(
      "data-theme",
      "light",
    );
    await expect
      .poll(async () =>
        (await snapshot(coldPage)).paint.some(
          (entry) => entry.name === "first-contentful-paint",
        ),
      )
      .toBe(true);
    const beforeHydration = await snapshot(coldPage),
      firstPaint = beforeHydration.paint.find(
        (entry) => entry.name === "first-contentful-paint",
      )!.time;
    await expect
      .poll(
        async () =>
          (await snapshot(coldPage)).frames.filter(
            (frame) => frame.time >= firstPaint,
          ).length,
      )
      .toBeGreaterThan(0);
    expect(
      (await snapshot(coldPage)).frames
        .filter((frame) => frame.time >= firstPaint)
        .every((frame) => frame.theme === "light"),
    ).toBe(true);
    await coldPage.screenshot({
      path: info.outputPath("light-before-hydration.png"),
    });
    release();
    await coldPage.waitForLoadState("networkidle");
    const hydrated = await snapshot(coldPage);
    expect(hydrated.theme).toBe("light");
    expect(hydrated.violations).toEqual([]);
    expect(coldPageErrors).toEqual([]);
    expect(
      coldConsoleErrors.filter((message) =>
        /hydration|react error #418|server rendered html|content security policy/i.test(
          message,
        ),
      ),
    ).toEqual([]);
    await coldPage.screenshot({
      path: info.outputPath("light-after-hydration.png"),
    });
    await info.attach("theme-csp-evidence", {
      contentType: "application/json",
      body: JSON.stringify(
        {
          locale,
          viewport: page.viewportSize(),
          csp,
          serverHtmlTheme:
            html.match(/<html[^>]*data-theme="([^"]*)"/)?.[1] ?? null,
          initial,
          selected,
          reloaded,
          navigated,
          dark,
          darkNavigated,
          invalid,
          beforeHydration,
          hydrated,
          pageErrors,
          consoleErrors,
          coldPageErrors,
          coldConsoleErrors,
          blockedUntrustedScripts,
        },
        null,
        2,
      ),
    });
  } finally {
    release();
    await cold.close();
  }
}
