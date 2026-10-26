import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import { catalogueFixture } from "../fixtures/academic-catalogue-archetype";
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";
type Mode = "data" | "pending" | "error" | "empty";
test.afterEach(async ({}, info) => {
  mkdirSync(info.outputDir, { recursive: true });
  writeFileSync(
    info.outputPath("scenario.json"),
    JSON.stringify(
      {
        classification: "MOCKED UI-CONTRACT EVIDENCE",
        title: info.title,
        status: info.status,
        errors: info.errors.map((e) => e.message),
      },
      null,
      2,
    ),
  );
});
async function prepare(page: Page, locale: "en" | "ar", theme: string) {
  const fixture = catalogueFixture(),
    mode = {
      versions: "data" as Mode,
      catalogue: "data" as Mode,
      write: "data" as Mode,
    };
  const reads: string[] = [],
    writes: { path: string; method: string; body: unknown }[] = [],
    unexpected: string[] = [],
    errors: string[] = [];
  const gates = new Map<string, () => void>();
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
    if (request.method() === "GET") {
      if (path.startsWith("/admin/academic-catalogue/versions")) {
        expect(url.search).toBe("");
        reads.push(path);
        const key =
          path === "/admin/academic-catalogue/versions"
            ? "versions"
            : "catalogue";
        if (mode[key] === "pending")
          await new Promise<void>((r) => gates.set(key, r));
        if (mode[key] === "error")
          return route.fulfill({
            status: 503,
            json: { message: "Synthetic catalogue load failure" },
          });
        if (key === "versions")
          return route.fulfill({
            json: mode.versions === "empty" ? [] : fixture.versions,
          });
        expect([
          "/admin/academic-catalogue/versions/version-z",
          "/admin/academic-catalogue/versions/version-a",
        ]).toContain(path);
        return route.fulfill({
          json:
            mode.catalogue === "empty" || path.endsWith("version-a")
              ? {
                  version: fixture.versions[path.endsWith("version-a") ? 1 : 0],
                  units: [],
                }
              : fixture.catalogue,
        });
      }
      if (path === "/taxonomy") return route.fulfill({ json: { tracks: [] } });
      if (
        [
          "/qualification-registry",
          "/admin/academic-taxonomy/specializations",
          "/admin/academic-taxonomy/grades",
        ].includes(path)
      )
        return route.fulfill({ json: [] });
      return route.fulfill(
        roleShellRuntimeResponse(path, locale, ["Admin", "SystemAdmin"]),
      );
    }
    const isPost =
      /^\/admin\/academic-catalogue\/(definitions|scopes)\/[^/]+\/(publish|activate)$/.test(
        path,
      );
    const isPut =
      /^\/admin\/academic-records\/units\/[^/]+\/(status|arabic-localization)$/.test(
        path,
      );
    if (!(
      (isPost && request.method() === "POST") ||
      (isPut && request.method() === "PUT")
    ))
      unexpected.push(request.method() + " " + path);
    const body = request.postData() ? request.postDataJSON() : undefined;
    if (isPost) expect(request.postData()).toBeNull();
    writes.push({ path, method: request.method(), body });
    if (mode.write === "pending")
      await new Promise<void>((r) => gates.set("write", r));
    if (mode.write === "error")
      return route.fulfill({
        status: 409,
        json: { message: "Synthetic operation failure" },
      });
    if (path.endsWith("/status")) {
      const unit = fixture.catalogue.units.find((u) =>
        path.includes("/" + u.id + "/"),
      );
      expect(unit).toBeDefined();
      unit!.isActive = body.isActive;
    }
    if (path.endsWith("/arabic-localization")) {
      const unit = fixture.catalogue.units.find((u) =>
        path.includes("/" + u.id + "/"),
      );
      expect(unit).toBeDefined();
      unit!.arabicTitle = "عنوان أعاده الخادم للاختبار";
    }
    if (path.endsWith("/publish"))
      fixture.catalogue.units[0].definitions.find((d) =>
        path.includes("/" + d.id + "/"),
      )!.isActive = true;
    if (path.endsWith("/activate"))
      fixture.catalogue.units[0].definitions[0].scopes.find((s) =>
        path.includes("/" + s.id + "/"),
      )!.isActive = true;
    return route.fulfill({
      status: isPost ? 200 : 204,
      ...(isPost ? { json: {} } : {}),
    });
  });
  return {
    fixture,
    mode,
    reads,
    writes,
    unexpected,
    errors,
    open: () =>
      page.goto(`/${locale}/admin/academic-catalogue`, {
        waitUntil: "domcontentloaded",
      }),
    release: async (key: string) => {
      await expect.poll(() => gates.has(key)).toBe(true);
      gates.get(key)!();
      gates.delete(key);
    },
  };
}

for (const locale of ["en", "ar"] as const) {
  test(`keyboard traversal and cached version recovery ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const c = await prepare(page, locale, "light"),
      t = (locale === "en" ? en : ar).academicCatalogue;
    await c.open();
    const context = page.getByRole("region", {
        name: t.qualificationVersion,
        exact: true,
      }),
      register = page.getByRole("region", {
        name: t.unitRegister,
        exact: true,
      }),
      first = register.getByRole("article").first();
    await expect(register.getByRole("article")).toHaveCount(4);
    const toggle = page.getByRole("button", {
      name: (locale === "en" ? en : ar).navigation.theme.toggle,
    });
    if (!(await page.locator("html").getAttribute("data-theme")))
      await toggle.click();
    if ((await page.locator("html").getAttribute("data-theme")) !== "light")
      await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const input = first.getByLabel(t.residualbETCCOArabicDisplayTitle);
    await input.fill("مسودة لوحة المفاتيح");
    const controls = [
      page.getByRole("combobox", { name: t.qualificationVersion, exact: true }),
      first.locator("summary"),
      input,
      first.getByRole("button", {
        name: t.residualsaveArabicDisplayTitle,
        exact: true,
      }),
      first.getByRole("button", { name: t.residualarchive, exact: true }),
      first.getByRole("button", { name: t.publish, exact: true }),
      first.getByRole("button", { name: t.activate, exact: true }),
    ];
    for (const control of controls) {
      await control.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await expect(control).toBeFocused();
      expect(
        await control.evaluate((el) => getComputedStyle(el).outlineStyle),
      ).toBe("solid");
    }
    await page.clock.install({ time: new Date() });
    await page.clock.fastForward(31_000);
    c.mode.versions = "error";
    await page.evaluate(() =>
      window.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(
      context.getByText(t.refreshWarning, { exact: true }),
    ).toBeVisible();
    await expect(register.getByRole("article")).toHaveCount(4);
    await expect(
      page.getByRole("combobox", { name: t.qualificationVersion, exact: true }),
    ).toHaveValue("version-z");
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: info.outputPath("cached-version-and-keyboard.png"),
      fullPage: true,
      animations: "disabled",
    });
    c.mode.versions = "data";
    const retry = context.getByRole("button", { name: t.retry, exact: true });
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(
      context.getByText(t.refreshWarning, { exact: true }),
    ).toHaveCount(0);
    expect(c.errors).toEqual([]);
    expect(c.unexpected).toEqual([]);
  });
}
for (const locale of ["en", "ar"] as const)
  for (const theme of ["light", "dark"])
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 834, height: 1112 },
      { width: 390, height: 844 },
    ]) {
      test(`MOCKED UI-CONTRACT EVIDENCE ${locale} ${theme} ${viewport.width}`, async ({
        page,
      }, info) => {
        test.setTimeout(240_000);
        await page.setViewportSize(viewport);
        const c = await prepare(page, locale, theme),
          copy = locale === "en" ? en : ar,
          t = copy.academicCatalogue;
        const register = page.getByRole("region", {
            name: t.unitRegister,
            exact: true,
          }),
          context = page.getByRole("region", {
            name: t.qualificationVersion,
            exact: true,
          }),
          select = page.getByRole("combobox", {
            name: t.qualificationVersion,
            exact: true,
          });
        const unit = (i: number) => register.getByRole("article").nth(i),
          definition = (code: string) =>
            unit(0)
              .getByRole("heading", { name: new RegExp(code) })
              .locator("..")
              .locator("..");
        const captures: string[] = [];
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
          await expect(page.locator("html")).toHaveAttribute(
            "dir",
            locale === "ar" ? "rtl" : "ltr",
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
            animations: "disabled",
          });
          captures.push(name);
        }
        async function ready() {
          await expect(register.getByRole("article")).toHaveCount(4);
          await themeCheck();
        }
        await c.open();
        await ready();
        expect(c.reads.slice(0, 2)).toEqual([
          "/admin/academic-catalogue/versions",
          "/admin/academic-catalogue/versions/version-z",
        ]);
        expect(
          await select
            .locator("option")
            .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value)),
        ).toEqual(["version-z", "version-a"]);
        await expect(select).toHaveValue("version-z");
        await expect(
          page.getByRole("region", {
            name: copy.adminWorkspace.academicCatalogManagement
              .manageAcademicCatalogue,
            exact: true,
          }),
        ).toBeVisible();
        for (const band of [t.band.Pass, t.band.Merit, t.band.Distinction])
          await expect(unit(0).getByText(band, { exact: true })).toBeVisible();
        await expect(
          unit(0).getByText(t.noCriteria, { exact: true }),
        ).toBeVisible();
        await expect(
          definition("D-INVALID").getByText(t.ready, { exact: true }),
        ).toHaveCount(0);
        for (const issue of [
          t.missingSource,
          t.missingAims,
          t.missingCriteria,
          t.inactiveVersion,
          t.invalidMapping,
          t.duplicateCriterion,
          t.rubricMismatch,
          t.rubricCriteriaMismatch,
        ])
          await expect(definition("D-INVALID")).toContainText(issue);
        await expect(definition("D-UNRESOLVED")).toContainText(
          t.linkedAims + ": " + t.none,
        );
        await expect(definition("D-UNRESOLVED")).toContainText(
          t.linkedCriteria + ": " + t.none,
        );
        await expect(
          register.getByRole("button", { name: t.publish, exact: true }),
        ).toHaveCount(1);
        await expect(
          register.getByRole("button", { name: t.activate, exact: true }),
        ).toHaveCount(1);
        await capture("01-version-register-learning-validation-hierarchy");
        for (const i of [1, 2, 3]) await unit(i).locator("summary").click();
        await expect(
          unit(1).getByText(t.noAims, { exact: true }),
        ).toBeVisible();
        await expect(
          unit(2).getByText(t.noDefinitions, { exact: true }),
        ).toBeVisible();
        await expect(
          unit(2).getByLabel(t.residualbETCCOArabicDisplayTitle),
        ).toHaveCount(0);
        await expect(
          unit(3).getByLabel(t.residualbETCCOArabicDisplayTitle),
        ).toHaveCount(0);
        await expect(
          unit(3).getByText("Unknown", { exact: true }).first(),
        ).toBeVisible();
        await capture("02-official-custom-unknown-empty-learning-structure");
        await select.focus();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        await expect(select).toBeFocused();
        expect(
          await select.evaluate((el) => getComputedStyle(el).outlineStyle),
        ).toBe("solid");
        await capture("03-keyboard-version-selector-focus");
        expect(
          await register
            .locator("button,input,summary")
            .evaluateAll((els) =>
              els
                .filter((el) => el.getClientRects().length)
                .every((el) => el.getBoundingClientRect().height >= 44),
            ),
        ).toBe(true);
        const local = unit(0).getByLabel(t.residualbETCCOArabicDisplayTitle),
          other = unit(1).getByLabel(t.residualbETCCOArabicDisplayTitle),
          localSave = unit(0).getByRole("button", {
            name: t.residualsaveArabicDisplayTitle,
            exact: true,
          });
        await expect(localSave).toBeDisabled();
        await local.fill("   ");
        await expect(localSave).toBeDisabled();
        await local.fill(" " + c.fixture.catalogue.units[0].arabicTitle + " ");
        await expect(localSave).toBeDisabled();
        await local.fill(" عنوان عربي خام ");
        await other.fill("مسودة الوحدة الثانية");
        c.mode.write = "pending";
        const before = c.writes.length;
        await localSave.click();
        await expect.poll(() => c.writes.length).toBe(before + 1);
        await expect(localSave).toBeDisabled();
        await expect(unit(0).getByText(t.saved, { exact: true })).toHaveCount(
          0,
        );
        await localSave.evaluate((el) => (el as HTMLButtonElement).click());
        expect(c.writes.length).toBe(before + 1);
        await capture("04-localization-pending-independent-drafts");
        c.mode.write = "error";
        await c.release("write");
        await expect(unit(0).getByRole("alert")).toContainText(t.saveError);
        await expect(local).toHaveValue(" عنوان عربي خام ");
        await expect(other).toHaveValue("مسودة الوحدة الثانية");
        await capture("05-localization-error-retained-drafts");
        c.mode.write = "data";
        await localSave.click();
        await expect(local).toHaveValue("عنوان أعاده الخادم للاختبار");
        await expect(other).toHaveValue("مسودة الوحدة الثانية");
        expect(c.writes.at(-1)).toEqual({
          path: "/admin/academic-records/units/official-1/arabic-localization",
          method: "PUT",
          body: { arabicTitle: " عنوان عربي خام " },
        });
        await expect(unit(0)).toContainText(
          c.fixture.catalogue.units[0].englishTitle,
        );
        await capture("06-localization-success-target-only-clear");
        const operations = [
          {
            name: "unit-status",
            label: t.unitStatus,
            button: () =>
              unit(0).getByRole("button", {
                name: t.residualarchive,
                exact: true,
              }),
            target: () => unit(0),
            path: "/admin/academic-records/units/official-1/status",
            method: "PUT",
            body: { isActive: false },
          },
          {
            name: "definition-publish",
            label: t.publish,
            button: () =>
              definition("D-VALID").getByRole("button", {
                name: t.publish,
                exact: true,
              }),
            target: () => definition("D-VALID"),
            path: "/admin/academic-catalogue/definitions/definition-valid/publish",
            method: "POST",
            body: undefined,
          },
          {
            name: "scope-activate",
            label: t.activate,
            button: () =>
              definition("D-VALID").getByRole("button", {
                name: t.activate,
                exact: true,
              }),
            target: () =>
              definition("D-VALID")
                .getByRole("list")
                .locator(":scope > li")
                .first(),
            path: "/admin/academic-catalogue/scopes/scope-valid/activate",
            method: "POST",
            body: undefined,
          },
        ];
        for (const op of operations) {
          c.mode.write = "pending";
          const count = c.writes.length;
          await op.button().click();
          await expect.poll(() => c.writes.length).toBe(count + 1);
          expect(c.writes.at(-1)).toEqual({
            path: op.path,
            method: op.method,
            body: op.body,
          });
          await expect(
            op.method === "POST"
              ? op.target().getByRole("button", { name: t.saving, exact: true })
              : op.button(),
          ).toBeDisabled();
          await expect(
            op.target().getByRole("status").filter({ hasText: op.label }),
          ).toContainText(t.saving);
          await capture(op.name + "-pending");
          c.mode.write = "error";
          await c.release("write");
          await expect(op.target().getByRole("alert").last()).toContainText(
            t.saveError,
          );
          expect(c.writes.length).toBe(count + 1);
          await capture(op.name + "-error");
          c.mode.write = "data";
          await op.button().click();
          await expect(
            op.target().getByRole("status").filter({ hasText: op.label }),
          ).toContainText(t.saved);
          await capture(op.name + "-success");
        }
        await select.selectOption("version-a");
        await expect(register.getByRole("article")).toHaveCount(0);
        await expect(
          register.getByText(t.noUnits, { exact: true }),
        ).toBeVisible();
        await capture("07-explicit-other-version-no-cross-version-content");
        await select.selectOption("version-z");
        await ready();
        c.mode.catalogue = "error";
        await unit(0)
          .getByRole("button", { name: t.residualactivate, exact: true })
          .click();
        await expect(
          register.getByText(t.refreshWarning, { exact: true }),
        ).toBeVisible();
        await expect(register.getByRole("article")).toHaveCount(4);
        await capture("08-cached-catalogue-refresh-warning");
        c.mode.catalogue = "data";
        await register
          .getByRole("button", { name: t.retry, exact: true })
          .click();
        await expect(
          register.getByText(t.refreshWarning, { exact: true }),
        ).toHaveCount(0);
        c.mode.versions = "pending";
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(
          context.getByText(t.loading, { exact: true }),
        ).toBeVisible();
        await capture("09-versions-initial-pending");
        c.mode.versions = "error";
        await c.release("versions");
        await expect(context.getByRole("alert")).toBeVisible();
        await capture("10-versions-cold-error");
        c.mode.versions = "empty";
        await context
          .getByRole("button", { name: t.retry, exact: true })
          .click();
        await expect(
          context.getByText(t.noVersions, { exact: true }),
        ).toBeVisible();
        await capture("11-no-versions-waiting-context");
        c.mode.versions = "data";
        c.mode.catalogue = "pending";
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(
          register.getByText(t.loadingUnits, { exact: true }),
        ).toBeVisible();
        await capture("12-selected-catalogue-pending");
        c.mode.catalogue = "error";
        await c.release("catalogue");
        await expect(register.getByRole("alert")).toBeVisible();
        await expect(
          register.getByText(t.noUnits, { exact: true }),
        ).toHaveCount(0);
        await capture("13-selected-catalogue-cold-error");
        c.mode.catalogue = "empty";
        await register
          .getByRole("button", { name: t.retry, exact: true })
          .click();
        await expect(
          register.getByText(t.noUnits, { exact: true }),
        ).toBeVisible();
        await capture("14-selected-catalogue-successful-empty");
        c.mode.catalogue = "data";
        await page.reload({ waitUntil: "domcontentloaded" });
        await ready();
        await page.setViewportSize({ width: 720, height: viewport.height });
        await capture("15-200-percent-equivalent-reflow");
        await page.setViewportSize(viewport);
        expect(c.unexpected).toEqual([]);
        expect(c.errors).toEqual([]);
        writeFileSync(
          info.outputPath("evidence.json"),
          JSON.stringify(
            {
              classification: "MOCKED UI-CONTRACT EVIDENCE",
              locale,
              theme,
              viewport,
              captures,
              reads: c.reads,
              writes: c.writes,
              unexpected: c.unexpected,
              errors: c.errors,
            },
            null,
            2,
          ),
        );
      });
    }
