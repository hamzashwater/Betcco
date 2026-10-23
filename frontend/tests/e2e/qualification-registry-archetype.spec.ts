import { expect, test, type Page, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import {
  registryQualifications as qualifications,
  registryRubrics as rubrics,
} from "../fixtures/qualification-registry-archetype";
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";

// MOCKED UI-CONTRACT EVIDENCE: real UI, synthetic intercepted HTTP only.
// No database, Pearson, accreditation, authorization, deployment or WCAG proof.
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
    qualifications: "data",
    rubrics: "data",
    write: "immediate",
    writeError: false,
  };
  const reads: string[] = [],
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
      ["/qualification-registry", "/qualification-registry/rubrics"].includes(
        path,
      )
    ) {
      expect(url.search).toBe("");
      reads.push(path);
      const key = path.endsWith("/rubrics") ? "rubrics" : "qualifications";
      if (state[key] === "pending")
        await new Promise<void>((resolve) => {
          readRelease = resolve;
        });
      if (state[key] === "error")
        return route.fulfill({
          status: 503,
          json: { message: "Synthetic private query failure" },
        });
      return route.fulfill({
        json:
          state[key] === "empty"
            ? []
            : key === "rubrics"
              ? rubrics
              : qualifications,
      });
    }
    if (request.method() !== "GET") {
      const allowed =
        path === "/qualification-registry/qualifications" ||
        path === "/qualification-registry/versions" ||
        rubrics.some((r) =>
          qualifications.some((q) =>
            q.versions.some(
              (v) =>
                path ===
                `/qualification-registry/rubrics/${r.rubricTemplateId}/qualification-version/${v.id}`,
            ),
          ),
        );
      if (!allowed || request.method() !== "POST") {
        unexpected.push(request.method() + " " + path);
        return route.fulfill({
          status: 409,
          json: { message: "Unexpected synthetic mutation" },
        });
      }
      writes.push({
        path,
        body: request.postData() ? request.postDataJSON() : null,
      });
      if (state.write === "pending")
        await new Promise<void>((resolve) => {
          writeRelease = resolve;
        });
      return state.writeError
        ? route.fulfill({
            status: 409,
            json: { message: "Synthetic retained mutation failure" },
          })
        : route.fulfill({ status: 200, json: {} });
    }
    return route.fulfill(
      roleShellRuntimeResponse(path, locale, ["Admin", "SystemAdmin"]),
    );
  });
  await page.goto(`/${locale}/admin/qualification-registry`);
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
      test(`${locale} ${theme} ${viewport.width}: Academic qualification/version/binding workspace`, async ({
        page,
      }, info) => {
        test.setTimeout(150_000);
        await page.setViewportSize(viewport);
        const c = await prepare(page, locale, theme),
          copy = locale === "en" ? en : ar,
          t = copy.adminWorkspace.qualificationRegistry,
          main = page.getByRole("main"),
          rows = main.getByRole("article"),
          rubric = (i: number) => rows.nth(qualifications.length + i);
        const captures: string[] = [];
        async function ready() {
          await expect(rows).toHaveCount(
            qualifications.length + rubrics.length,
          );
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
        const field = (name: string) => main.getByLabel(name, { exact: true });
        const qualificationSelect = () =>
          main.getByRole("combobox", { name: t.qualification, exact: true });
        async function fillQualification() {
          await field(t.code).fill("  QC  ");
          await field(t.arabicName).fill("  مؤهل خام  ");
          await field(t.englishName).fill("  Raw qualification  ");
        }
        async function fillVersion(end = false) {
          await qualificationSelect().selectOption("qualification-z");
          await field(t.versionCode).fill("  V2  ");
          await field(t.sourceReference).fill("  Source reference raw  ");
          await field(t.effectiveFrom).fill("2026-10-23");
          if (end) await field(t.effectiveUntil).fill("2027-02-01");
        }
        const saveQualification = () =>
            main.getByRole("button", {
              name: t.saveQualification,
              exact: true,
            }),
          saveVersion = () =>
            main.getByRole("button", { name: t.saveVersion, exact: true });
        async function reload() {
          c.state.qualifications = "data";
          c.state.rubrics = "data";
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
          "/qualification-registry",
          "/qualification-registry/rubrics",
        ]);
        expect(
          await qualificationSelect()
            .locator("option")
            .evaluateAll((options) =>
              options.map((o) => (o as HTMLOptionElement).value),
            ),
        ).toEqual(["", ...qualifications.map((q) => q.id)]);
        for (let i = 0; i < qualifications.length; i++)
          await expect(rows.nth(i).getByRole("heading")).toHaveText(
            `${qualifications[i].code} · ${locale === "ar" ? qualifications[i].arabicName : qualifications[i].englishName}`,
          );
        await expect(rows.nth(0).locator("strong")).toHaveText(
          qualifications[0].versions.map((v) => v.versionCode),
        );
        await expect(rows.nth(1)).toContainText(t.noVersion);
        await expect(rubric(0).locator("p")).toHaveText("Z-RAW · RAW-2024");
        await expect(rubric(1).locator("p")).toHaveText(t.unbound);
        await expect(rubric(2).locator("p")).toHaveText(t.unbound);
        await expect(rubric(3).locator("p")).toHaveText(t.unbound);
        await expect(rubric(0).getByRole("button")).toBeDisabled();
        await expect(rubric(1).getByRole("button")).toBeDisabled();
        expect(
          await main
            .getByRole("heading", { level: 1 })
            .evaluate((el) => getComputedStyle(el).fontWeight),
        ).toBe("700");
        expect(
          await field(t.code).evaluate(
            (el) => el.getBoundingClientRect().height,
          ),
        ).toBeGreaterThanOrEqual(44);
        expect(
          await main
            .locator("form")
            .first()
            .evaluate((el) => ({
              background: getComputedStyle(el).backgroundColor,
              radius: getComputedStyle(el).borderRadius,
              shadow: getComputedStyle(el).boxShadow,
            })),
        ).toMatchObject({ radius: "12px", shadow: "none" });
        expect(
          await rows
            .nth(0)
            .locator("li")
            .first()
            .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        ).toBe(true);
        await capture("01-populated-lineage-long-content");
        await field(t.code).fill("x");
        await expect(saveQualification()).toBeDisabled();
        await capture("02-invalid-qualification");
        await fillQualification();
        await fillVersion();
        await expect(saveQualification()).toBeEnabled();
        await capture("03-valid-qualification-independent-version-draft");
        c.state.write = "pending";
        await saveQualification().click();
        await expect(
          main.getByRole("button", { name: t.saving, exact: true }),
        ).toBeDisabled();
        await capture("04-qualification-pending");
        c.state.writeError = true;
        c.releaseWrite();
        await expect(main.getByRole("alert")).toContainText(
          "Synthetic retained mutation failure",
        );
        await expect(field(t.code)).toHaveValue("  QC  ");
        await expect(field(t.versionCode)).toHaveValue("  V2  ");
        await capture("05-qualification-error-drafts-retained");
        expect(c.writes[0]).toEqual({
          path: "/qualification-registry/qualifications",
          body: {
            code: "  QC  ",
            arabicName: "  مؤهل خام  ",
            englishName: "  Raw qualification  ",
          },
        });
        await reload();
        await fillQualification();
        await fillVersion();
        await expect(field(t.effectiveUntil)).toHaveValue("");
        await capture("06-version-valid-optional-end-empty");
        c.state.write = "pending";
        await saveVersion().click();
        await expect(
          main.getByRole("button", { name: t.saving, exact: true }),
        ).toBeDisabled();
        await capture("07-version-pending");
        c.state.writeError = true;
        c.releaseWrite();
        await expect(main.getByRole("alert")).toContainText(
          "Synthetic retained mutation failure",
        );
        await expect(field(t.sourceReference)).toHaveValue(
          "  Source reference raw  ",
        );
        await expect(field(t.code)).toHaveValue("  QC  ");
        await capture("08-version-error-drafts-retained");
        expect(c.writes.at(-1)).toEqual({
          path: "/qualification-registry/versions",
          body: {
            qualificationId: "qualification-z",
            versionCode: "  V2  ",
            sourceReference: "  Source reference raw  ",
            effectiveFromUtc: "2026-10-23T00:00:00.000Z",
            effectiveUntilUtc: null,
          },
        });
        await reload();
        await fillQualification();
        await fillVersion();
        await rubric(1).getByRole("combobox").selectOption("version-third");
        await expect(rubric(1).locator("p")).toHaveText(t.unbound);
        await expect(rubric(0).getByRole("combobox")).toHaveValue(
          "version-old",
        );
        await capture("09-local-selection-isolated-from-server-binding");
        c.state.write = "pending";
        await rubric(1).getByRole("button").click();
        for (let i = 0; i < rubrics.length; i++)
          await expect(rubric(i).getByRole("button")).toBeDisabled();
        await capture("10-binding-pending");
        c.state.writeError = true;
        c.releaseWrite();
        await expect(main.getByRole("alert")).toContainText(
          "Synthetic retained mutation failure",
        );
        await expect(rubric(1).getByRole("combobox")).toHaveValue(
          "version-third",
        );
        await capture("11-binding-error-local-draft-retained");
        expect(c.writes.at(-1)).toEqual({
          path: "/qualification-registry/rubrics/rubric-a/qualification-version/version-third",
          body: null,
        });
        await keyboardFocus(page, field(t.code));
        await capture("12-keyboard-qualification-form");
        await keyboardFocus(page, qualificationSelect());
        await capture("13-keyboard-version-form");
        await keyboardFocus(page, rubric(1).getByRole("combobox"));
        await capture("14-keyboard-version-selector");
        await keyboardFocus(page, rubric(1).getByRole("button"));
        await capture("15-keyboard-bind-action");
        await page.setViewportSize({
          width: Math.max(320, Math.round(viewport.width / 2)),
          height: viewport.height,
        });
        await capture("16-200-percent-reflow-proxy");
        await page.setViewportSize(viewport);
        // Successful qualification: only its own form clears; prefix invalidation is unchanged.
        await reload();
        await fillQualification();
        await fillVersion();
        const qReadStart = c.reads.length;
        await saveQualification().click();
        await expect(field(t.code)).toHaveValue("");
        await expect(field(t.arabicName)).toHaveValue("");
        await expect(field(t.englishName)).toHaveValue("");
        await expect(field(t.versionCode)).toHaveValue("  V2  ");
        await expect.poll(() => c.reads.slice(qReadStart).length).toBe(2);
        await capture("17-qualification-success-only-own-form-cleared");
        // Successful version uses supplied end at UTC midnight and leaves qualification draft.
        await fillQualification();
        await field(t.effectiveUntil).fill("2027-02-01");
        await capture("18-version-optional-end-supplied");
        await saveVersion().click();
        for (const name of [
          t.versionCode,
          t.sourceReference,
          t.effectiveFrom,
          t.effectiveUntil,
        ])
          await expect(field(name)).toHaveValue("");
        await expect(qualificationSelect()).toHaveValue("");
        await expect(field(t.code)).toHaveValue("  QC  ");
        await capture("19-version-success-only-own-form-cleared");
        expect(c.writes.at(-1)?.body).toEqual({
          qualificationId: "qualification-z",
          versionCode: "  V2  ",
          sourceReference: "  Source reference raw  ",
          effectiveFromUtc: "2026-10-23T00:00:00.000Z",
          effectiveUntilUtc: "2027-02-01T00:00:00.000Z",
        });
        await fillVersion();
        await rubric(0).getByRole("combobox").selectOption("version-new");
        await rubric(1).getByRole("combobox").selectOption("version-third");
        const bindReadStart = c.reads.length;
        await rubric(1).getByRole("button").click();
        await expect(rubric(0).getByRole("combobox")).toHaveValue(
          "version-old",
        );
        await expect(rubric(1).getByRole("combobox")).toHaveValue("");
        await expect
          .poll(() => c.reads.slice(bindReadStart))
          .toEqual(["/qualification-registry/rubrics"]);
        await expect(field(t.code)).toHaveValue("  QC  ");
        await expect(field(t.versionCode)).toHaveValue("  V2  ");
        await capture("20-binding-success-map-reset-only-rubrics-refetched");
        c.state.qualifications = "error";
        await saveQualification().click();
        await expect(main.getByRole("alert")).toHaveText(t.qualificationError);
        await ready();
        await rubric(1).getByRole("combobox").selectOption("version-third");
        await expect(rubric(1).getByRole("button")).toBeEnabled();
        await capture("21-qualification-cached-refresh-error");
        c.state.rubrics = "error";
        await rubric(1).getByRole("button").click();
        await expect(main.getByRole("alert")).toHaveCount(2);
        await ready();
        await expect(rubric(0).getByRole("combobox")).toHaveValue(
          "version-old",
        );
        await capture("22-rubrics-cached-refresh-error");
        c.state.qualifications = "empty";
        c.state.rubrics = "empty";
        await page.reload();
        await expect(main.getByText(t.empty, { exact: true })).toBeVisible();
        await expect(
          main.getByText(t.emptyRubrics, { exact: true }),
        ).toBeVisible();
        await expect(rows).toHaveCount(0);
        await capture("23-successful-empty-registry-and-rubrics");
        c.state.qualifications = "pending";
        c.state.rubrics = "data";
        await page.reload();
        await expect(
          main
            .getByRole("region", { name: t.registered, exact: true })
            .getByRole("status"),
        ).toHaveText(t.loadingQualifications);
        await expect(rows).toHaveCount(rubrics.length);
        await expect(main.getByText(t.empty, { exact: true })).toHaveCount(0);
        await capture("24-qualification-cold-pending");
        c.state.qualifications = "error";
        c.releaseRead();
        await expect(main.getByRole("alert")).toHaveText(t.qualificationError);
        await expect(main.getByText(t.empty, { exact: true })).toHaveCount(0);
        await capture("25-qualification-cold-error");
        c.state.qualifications = "data";
        c.state.rubrics = "pending";
        await page.reload();
        await expect(
          main
            .getByRole("region", { name: t.bindTitle, exact: true })
            .getByRole("status"),
        ).toHaveText(t.loadingRubrics);
        await expect(rows).toHaveCount(qualifications.length);
        await expect(
          main.getByText(t.emptyRubrics, { exact: true }),
        ).toHaveCount(0);
        await capture("26-rubrics-cold-pending");
        c.state.rubrics = "error";
        c.releaseRead();
        await expect(main.getByRole("alert")).toHaveText(t.rubricsError);
        await expect(
          main.getByText(t.emptyRubrics, { exact: true }),
        ).toHaveCount(0);
        await capture("27-rubrics-cold-error");
        expect(c.unexpected).toEqual([]);
        expect(c.errors).toEqual([]);
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
