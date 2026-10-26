import { expect, test, type Page, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import { academicAuthoringFixture } from "../fixtures/academic-catalog-management-archetype";
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";

// MOCKED UI-CONTRACT EVIDENCE. Real built route and HTTP transport with canned
// academic data; no persistence, authorization, deployment or full WCAG claim.
const paths = {
  taxonomy: "/taxonomy?locale=en",
  specializations: "/admin/academic-taxonomy/specializations",
  grades: "/admin/academic-taxonomy/grades",
  qualifications: "/qualification-registry",
} as const;
type Family = keyof typeof paths;
type Mode = "data" | "empty" | "error" | "pending";
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
        errors: info.errors.map((error) => error.message),
      },
      null,
      2,
    ),
  );
});
async function prepare(page: Page, locale: "en" | "ar", theme: string) {
  const fixture = academicAuthoringFixture();
  const modes: Record<Family, Mode> = {
    taxonomy: "data",
    specializations: "data",
    grades: "data",
    qualifications: "data",
  };
  const state = { write: "data" as Mode, missingTrack: false };
  const reads: string[] = [],
    writes: { path: string; method: string; body: unknown }[] = [],
    unexpected: string[] = [],
    errors: string[] = [];
  const releases: (() => void)[] = [];
  let releaseWrite: (() => void) | undefined;
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
      path = url.pathname.replace(/^\/api\/v1/, ""),
      key = path + url.search;
    if (path === "/security/antiforgery")
      return route.fulfill({ json: { token: "mocked-ui-contract-token" } });
    if (request.method() === "GET") {
      const family = (Object.keys(paths) as Family[]).find(
        (k) => paths[k] === key,
      );
      if (family) {
        reads.push(key);
        if (modes[family] === "pending")
          await new Promise<void>((r) => releases.push(r));
        if (modes[family] === "error")
          return route.fulfill({
            status: 503,
            json: { message: "Synthetic query failure" },
          });
        let data: unknown = fixture[family];
        if (modes[family] === "empty")
          data = family === "taxonomy" ? { tracks: [] } : [];
        if (family === "taxonomy" && state.missingTrack)
          data = {
            tracks: fixture.taxonomy.tracks.filter((t) => !t.isBtecFocused),
          };
        return route.fulfill({ json: data });
      }
      if (path === "/admin/academic-catalogue/versions")
        return route.fulfill({ json: [] });
      if (path === "/taxonomy") {
        unexpected.push(key);
        return route.fulfill({ status: 500, json: {} });
      }
      return route.fulfill(
        roleShellRuntimeResponse(path, locale, ["Admin", "SystemAdmin"]),
      );
    }
    const allowedPost = [
      paths.specializations,
      paths.grades,
      "/qualification-registry/qualifications",
      "/qualification-registry/versions",
      "/admin/academic-catalogue/units",
    ].includes(path);
    const allowedPut =
      /^\/admin\/academic-taxonomy\/(specializations|grades)\/[^/]+$/.test(
        path,
      ) ||
      /^\/admin\/academic-records\/(qualifications|versions)\/[^/]+\/status$/.test(
        path,
      );
    if (!(
      (request.method() === "POST" && allowedPost) ||
      (request.method() === "PUT" && allowedPut)
    ))
      unexpected.push(request.method() + " " + key);
    writes.push({
      path,
      method: request.method(),
      body: request.postDataJSON(),
    });
    if (state.write === "pending")
      await new Promise<void>((r) => {
        releaseWrite = r;
      });
    if (state.write === "error")
      return route.fulfill({
        status: 409,
        json: { message: "Synthetic save failure" },
      });
    return route.fulfill({ json: {} });
  });
  return {
    fixture,
    modes,
    state,
    reads,
    writes,
    unexpected,
    errors,
    open: () =>
      page.goto(`/${locale}/admin/academic-catalogue`, {
        waitUntil: "domcontentloaded",
      }),
    releaseReads: () => {
      releases.splice(0).forEach((r) => r());
    },
    releaseWrite: () => {
      expect(releaseWrite).toBeDefined();
      releaseWrite!();
      releaseWrite = undefined;
    },
  };
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
          copy = locale === "ar" ? ar : en,
          t = copy.adminWorkspace.academicCatalogManagement;
        const owner = page.getByRole("region", {
          name: t.manageAcademicCatalogue,
          exact: true,
        });
        const field = (name: string) => owner.getByLabel(name, { exact: true });
        const form = (name: string) =>
          owner.getByRole("form", { name, exact: true });
        const button = (name: string) =>
          owner.getByRole("button", { name, exact: true });
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
        async function ready() {
          await expect(
            field(t.qualificationSpecialization).locator("option"),
          ).toHaveCount(2);
          await themeCheck();
        }
        async function capture(name: string, target: Locator = owner) {
          await themeCheck();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          ).toBe(true);
          await page.evaluate(() =>
            window.scrollTo({ top: 0, behavior: "instant" }),
          );
          // Element screenshots scroll their top under the sticky shell header.
          // Capture the whole document from its top so evidence keeps every
          // heading and form visible without changing application styling.
          await expect(target).toBeAttached();
          await page.screenshot({
            path: info.outputPath(name + ".png"),
            animations: "disabled",
            fullPage: true,
          });
          captures.push(name);
        }
        async function saved() {
          await expect(
            owner.getByText(t.changesSaved, { exact: true }),
          ).toBeVisible();
          await expect(button(t.addGrade)).toBeEnabled();
        }
        async function submit(name: string, path: string, body: unknown) {
          const count = c.writes.length;
          await button(name).click();
          await expect.poll(() => c.writes.length).toBe(count + 1);
          expect(c.writes.at(-1)).toEqual({ method: "POST", path, body });
          await saved();
        }
        await c.open();
        await ready();
        expect([...new Set(c.reads)].sort()).toEqual(
          Object.values(paths).sort(),
        );
        await expect(field(t.qualification).locator("option")).toHaveCount(2);
        expect(
          await field(t.qualification)
            .locator("option")
            .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value)),
        ).toEqual(["", "qualification-z"]);
        expect(
          await field(t.customUnitVersion)
            .locator("option")
            .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value)),
        ).toEqual([
          "",
          "version-inactive",
          "version-active",
          "inactive-parent-version",
        ]);
        const registry = owner.getByRole("region", {
          name: t.qualificationsAndVersions,
          exact: true,
        });
        await expect(registry.locator(":scope > ul > li")).toHaveCount(3);
        expect(
          await registry
            .locator(":scope > ul > li")
            .evaluateAll((rows) =>
              rows.map((r) => r.textContent?.trim().slice(0, 8)),
            ),
        ).toEqual(["Z-CUSTOM", "A-OFFICI", "B-INACTI"]);
        await expect(
          registry
            .getByRole("list", { name: t.versions })
            .first()
            .locator(":scope > li"),
        ).toHaveCount(2);
        await capture("01-populated-taxonomy-hierarchy-long-source");
        // Every form has a persistent visible label and a minimum target height.
        expect(
          await owner
            .locator("input,select")
            .evaluateAll((els) =>
              els.every(
                (el) =>
                  Boolean(el.closest("label")?.textContent?.trim()) &&
                  el.getBoundingClientRect().height >= 44,
              ),
            ),
        ).toBe(true);
        expect(
          await owner
            .locator("h2,h3,strong,button,label,input,select")
            .evaluateAll((els) =>
              els.every((el) =>
                [400, 500, 600, 700].includes(
                  Number(getComputedStyle(el).fontWeight),
                ),
              ),
            ),
        ).toBe(true);
        await field(t.specializationSlug).focus();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        await expect(field(t.specializationSlug)).toBeFocused();
        expect(
          await field(t.specializationSlug).evaluate((el) => ({
            style: getComputedStyle(el).outlineStyle,
            offset: getComputedStyle(el).outlineOffset,
          })),
        ).toEqual({ style: "solid", offset: "2px" });
        await capture("02-keyboard-focus", form(t.newCustomSpecialization));
        for (const [label, value] of [
          [t.specializationSlug, " raw-specialization "],
          [t.specializationArabicName, " تخصص خام "],
          [t.specializationEnglishName, " Raw specialization "],
        ])
          await field(label).fill(value);
        c.state.write = "pending";
        await button(t.addSpecialization).click();
        await expect.poll(() => c.writes.length).toBe(1);
        expect(c.writes[0]).toEqual({
          path: paths.specializations,
          method: "POST",
          body: {
            slug: " raw-specialization ",
            arabicName: " تخصص خام ",
            englishName: " Raw specialization ",
            learningTrackId: "btec",
            sortOrder: 100,
          },
        });
        await expect(button(t.addGrade)).toBeDisabled();
        await expect(owner.getByText(t.saving, { exact: true })).toBeVisible();
        await expect(
          owner.getByText(t.changesSaved, { exact: true }),
        ).toHaveCount(0);
        await form(t.newCustomSpecialization).evaluate((el) =>
          (el as HTMLFormElement).requestSubmit(),
        );
        expect(c.writes).toHaveLength(1);
        await capture("03-specialization-pending");
        c.state.write = "error";
        c.releaseWrite();
        await expect(owner.getByRole("alert")).toContainText(
          t.couldNotSaveChanges,
        );
        await expect(field(t.specializationSlug)).toHaveValue(
          " raw-specialization ",
        );
        await expect(
          owner.getByText(t.changesSaved, { exact: true }),
        ).toHaveCount(0);
        expect(c.writes).toHaveLength(1);
        await capture("04-specialization-error-retained-draft");
        c.state.write = "data";
        await submit(t.addSpecialization, paths.specializations, {
          slug: " raw-specialization ",
          arabicName: " تخصص خام ",
          englishName: " Raw specialization ",
          learningTrackId: "btec",
          sortOrder: 100,
        });
        await capture("05-specialization-server-success");
        for (const [label, value] of [
          [t.gradeSlug, " raw-grade "],
          [t.gradeArabicName, " صف خام "],
          [t.gradeEnglishName, " Raw grade "],
        ])
          await field(label).fill(value);
        await submit(t.addGrade, paths.grades, {
          slug: " raw-grade ",
          arabicName: " صف خام ",
          englishName: " Raw grade ",
          learningTrackId: "btec",
          sortOrder: 100,
        });
        await capture("06-grade-create", form(t.newGrade));
        for (const [kind, items, title] of [
          ["specializations", c.fixture.specializations, t.specializations],
          ["grades", c.fixture.grades, t.grades],
        ] as const) {
          const rows = owner
            .getByRole("region", { name: title, exact: true })
            .locator(":scope > ul > li");
          for (const i of [0, 1]) {
            const item = items[i],
              count = c.writes.length;
            await rows
              .nth(i)
              .getByRole("button", {
                name: item.isVisible ? t.archive : t.activate,
                exact: true,
              })
              .click();
            await expect.poll(() => c.writes.length).toBe(count + 1);
            expect(c.writes.at(-1)).toEqual({
              path: `/admin/academic-taxonomy/${kind}/${item.id}`,
              method: "PUT",
              body: { ...item, isVisible: !item.isVisible },
            });
            await saved();
          }
        }
        await capture("07-taxonomy-independent-visible-archived-actions");
        for (const [label, value] of [
          [t.qualificationSpecialization, "spec-z"],
          [t.qualificationCode, " RAW-Q "],
          [t.qualificationArabicName, " مؤهل خام "],
          [t.qualificationEnglishName, " Raw qualification "],
        ]) {
          if (label === t.qualificationSpecialization)
            await field(label).selectOption(value);
          else await field(label).fill(value);
        }
        await capture(
          "08-qualification-specialization-dependency",
          form(t.customQualification),
        );
        await submit(
          t.addQualification,
          "/qualification-registry/qualifications",
          {
            code: " RAW-Q ",
            arabicName: " مؤهل خام ",
            englishName: " Raw qualification ",
            specializationId: "spec-z",
          },
        );
        await field(t.qualification).selectOption("qualification-z");
        await field(t.versionCode).fill(" RAW-V ");
        await field(t.versionSourceReference).fill("short");
        await field(t.effectiveDate).fill("2026-10-26");
        const countBeforeValidation = c.writes.length;
        await button(t.addVersion).click();
        expect(
          await field(t.versionSourceReference).evaluate(
            (el) => (el as HTMLInputElement).validity.tooShort,
          ),
        ).toBe(true);
        expect(c.writes).toHaveLength(countBeforeValidation);
        await capture(
          "09-version-source-reference-validation",
          form(t.customVersion),
        );
        await field(t.versionSourceReference).fill(" RAW-SOURCE-REFERENCE ");
        await submit(t.addVersion, "/qualification-registry/versions", {
          qualificationId: "qualification-z",
          versionCode: " RAW-V ",
          sourceReference: " RAW-SOURCE-REFERENCE ",
          effectiveFromUtc: "2026-10-26T00:00:00.000Z",
          effectiveUntilUtc: null,
        });
        await capture(
          "10-version-date-and-custom-qualification",
          form(t.customVersion),
        );
        await field(t.customUnitVersion).selectOption("version-inactive");
        await field(t.unitCode).fill(" RAW-U ");
        await field(t.unitEnglishTitle).fill(" Raw unit title ");
        await expect(field(t.unitLocalArabicDisplay)).toHaveValue("");
        await capture("11-unit-arabic-fallback-empty", form(t.customUnit));
        await submit(t.addUnit, "/admin/academic-catalogue/units", {
          qualificationVersionId: "version-inactive",
          code: " RAW-U ",
          arabicTitle: " Raw unit title ",
          englishTitle: " Raw unit title ",
          sourceReference: "",
        });
        await field(t.unitLocalArabicDisplay).fill(" عنوان محلي خام ");
        await field(t.unitSourceReference).fill(" RAW-UNIT-SOURCE ");
        await submit(t.addUnit, "/admin/academic-catalogue/units", {
          qualificationVersionId: "version-inactive",
          code: " RAW-U ",
          arabicTitle: " عنوان محلي خام ",
          englishTitle: " Raw unit title ",
          sourceReference: " RAW-UNIT-SOURCE ",
        });
        await capture(
          "12-unit-local-arabic-draft-semantics",
          form(t.customUnit),
        );
        const qrow = registry.locator(":scope > ul > li").first();
        const statusControls = [
          {
            control: qrow.locator(":scope > div").getByRole("button"),
            path: "/admin/academic-records/qualifications/qualification-z/status",
            body: { isActive: false },
          },
          {
            control: qrow
              .getByRole("list", { name: t.versions })
              .locator(":scope > li")
              .first()
              .getByRole("button"),
            path: "/admin/academic-records/versions/version-inactive/status",
            body: { isActive: true },
          },
          {
            control: qrow
              .getByRole("list", { name: t.versions })
              .locator(":scope > li")
              .nth(1)
              .getByRole("button"),
            path: "/admin/academic-records/versions/version-active/status",
            body: { isActive: false },
          },
          {
            control: registry
              .locator(":scope > ul > li")
              .nth(2)
              .locator(":scope > div")
              .getByRole("button"),
            path: "/admin/academic-records/qualifications/inactive-qualification/status",
            body: { isActive: true },
          },
        ];
        for (const { control, path, body } of statusControls) {
          const count = c.writes.length;
          await control.click();
          await expect.poll(() => c.writes.length).toBe(count + 1);
          expect(c.writes.at(-1)).toEqual({ path, method: "PUT", body });
          await saved();
        }
        await capture("13-qualification-version-independent-status", registry);
        // A successful write invalidates cached families; failed refreshes must keep
        // the old registry available and use warnings rather than false empty lists.
        c.modes.specializations = "error";
        c.modes.grades = "error";
        c.modes.qualifications = "error";
        await button(t.addUnit).click();
        await expect(
          owner.getByText(t.refreshWarning, { exact: true }),
        ).toHaveCount(3, { timeout: 15_000 });
        await expect(registry.locator(":scope > ul > li")).toHaveCount(3);
        await expect(
          owner.getByText(t.noQualifications, { exact: true }),
        ).toHaveCount(0);
        await capture("14-cached-data-refresh-warning");
        for (const k of [
          "specializations",
          "grades",
          "qualifications",
        ] as const)
          c.modes[k] = "data";
        for (let remaining = 3; remaining > 0; remaining--) {
          await owner
            .getByRole("button", { name: t.retry, exact: true })
            .first()
            .click();
          await expect(
            owner.getByRole("button", { name: t.retry, exact: true }),
          ).toHaveCount(remaining - 1);
        }
        await expect(
          owner.getByText(t.refreshWarning, { exact: true }),
        ).toHaveCount(0);
        for (const k of Object.keys(c.modes) as Family[])
          c.modes[k] = "pending";
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(owner.getByText(t.loading, { exact: true })).toHaveCount(
          4,
        );
        await capture("15-four-independent-pending-queries");
        for (const k of Object.keys(c.modes) as Family[]) c.modes[k] = "error";
        c.releaseReads();
        await expect(
          owner.getByText(t.couldNotLoadTheCatalogue, { exact: true }),
        ).toHaveCount(4, { timeout: 15_000 });
        await expect(
          owner.getByText(t.noSpecializations, { exact: true }),
        ).toHaveCount(0);
        await expect(owner.getByText(t.noGrades, { exact: true })).toHaveCount(
          0,
        );
        await expect(
          owner.getByText(t.noQualifications, { exact: true }),
        ).toHaveCount(0);
        await capture("16-cold-errors-no-false-empty");
        for (const k of Object.keys(c.modes) as Family[]) c.modes[k] = "empty";
        c.modes.taxonomy = "data";
        c.state.missingTrack = true;
        for (let remaining = 4; remaining > 0; remaining--) {
          await owner
            .getByRole("button", { name: t.retry, exact: true })
            .first()
            .click();
          await expect(
            owner.getByRole("button", { name: t.retry, exact: true }),
          ).toHaveCount(remaining - 1);
        }
        await expect(
          owner.getByText(t.noBtecTrack, { exact: true }),
        ).toBeVisible();
        await expect(button(t.addSpecialization)).toBeDisabled();
        await expect(button(t.addGrade)).toBeDisabled();
        await expect(
          owner.getByText(t.noQualifications, { exact: true }),
        ).toBeVisible();
        await capture("17-missing-btec-context");
        c.modes.taxonomy = "data";
        c.state.missingTrack = false;
        await page.reload({ waitUntil: "domcontentloaded" });
        await themeCheck();
        await expect(
          owner.getByText(t.noSpecializations, { exact: true }),
        ).toBeVisible();
        await expect(
          owner.getByText(t.noGrades, { exact: true }),
        ).toBeVisible();
        await capture("18-empty-taxonomy-and-qualifications");
        for (const k of Object.keys(c.modes) as Family[]) c.modes[k] = "data";
        await page.reload({ waitUntil: "domcontentloaded" });
        await ready();
        // 720 CSS pixels approximates the content reflow of a 1440px display at 200%.
        // It is reflow evidence, not a claim of browser-zoom or full WCAG compliance.
        await page.setViewportSize({ width: 720, height: viewport.height });
        await capture("19-200-percent-equivalent-reflow");
        await page.setViewportSize(viewport);
        expect(c.unexpected).toEqual([]);
        expect(c.errors).toEqual([]);
        mkdirSync(info.outputDir, { recursive: true });
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
