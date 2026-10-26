import { expect, test, type Page, type Locator } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import {
  fixtureRead,
  fixtureState,
  prefix,
  years,
  terms,
  versions,
  grades,
  summary,
  entries,
  id,
  longEnglish,
  longArabic,
  type Plan,
} from "../fixtures/delivery-planning-archetype";
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";
// MOCKED UI-CONTRACT EVIDENCE. Real built route, canned exact HTTP fixtures.
// No database persistence, authorization, deployment or full WCAG claim.
test.afterEach(async ({}, info) => {
  const path = info.outputPath("evidence.json");
  if (existsSync(path)) {
    const evidence = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(
      path,
      JSON.stringify(
        {
          ...evidence,
          status: info.status,
          expectedStatus: info.expectedStatus,
          errors: info.errors.map((error) => error.message),
        },
        null,
        2,
      ),
    );
  }
});
type Mode = "pending" | "error";
async function prepare(page: Page, locale: "en" | "ar", theme: string) {
  const state = fixtureState(),
    modes = new Map<string, Mode>(),
    gates = new Map<string, () => void>();
  const writes: { method: string; path: string; body: unknown }[] = [],
    reads: string[] = [],
    unexpected: string[] = [],
    errors: string[] = [];
  let response: unknown = state.detail[summary.id],
    errorCode = "OverlappingActiveTerm";
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
      key = request.method() + " " + path + url.search;
    if (path === "/security/antiforgery")
      return route.fulfill({ json: { token: "mocked-ui-contract-token" } });
    if (
      path.startsWith(prefix) ||
      path.startsWith("/admin/academic-taxonomy/")
    ) {
      if (request.method() === "GET") reads.push(path + url.search);
      else
        writes.push({
          method: request.method(),
          path,
          body: request.postData() ? request.postDataJSON() : undefined,
        });
      if (modes.get(key) === "pending")
        await new Promise<void>((resolve) => gates.set(key, resolve));
      if (modes.get(key) === "error")
        return route.fulfill({
          status: request.method() === "GET" ? 503 : 409,
          json: {
            code: errorCode,
            message: "Synthetic academic operation failure",
          },
        });
      if (request.method() !== "GET")
        return request.method() === "DELETE"
          ? route.fulfill({ status: 204 })
          : route.fulfill({ json: response });
      try {
        return route.fulfill({ json: fixtureRead(state, path + url.search) });
      } catch {
        unexpected.push(key);
        return route.fulfill({
          status: 500,
          json: { message: "Unexpected fixture read" },
        });
      }
    }
    if (request.method() !== "GET") unexpected.push(key);
    return route.fulfill(
      roleShellRuntimeResponse(path, locale, ["Admin", "SystemAdmin"]),
    );
  });
  const open = () =>
    page.goto(`/${locale}/admin/delivery-planning`, {
      waitUntil: "domcontentloaded",
    });
  return {
    state,
    modes,
    gates,
    writes,
    reads,
    unexpected,
    errors,
    open,
    setResponse: (v: unknown) => {
      response = v;
    },
    setError: (v: string) => {
      errorCode = v;
    },
    release: async (key: string) => {
      await expect.poll(() => gates.has(key)).toBe(true);
      gates.get(key)!();
      gates.delete(key);
    },
  };
}
async function observe(
  page: Page,
  c: Awaited<ReturnType<typeof prepare>>,
  method: string,
  path: string,
  body: unknown,
  action: () => Promise<unknown>,
) {
  const [request] = await Promise.all([
    page.waitForRequest(
      (r) =>
        r.method() === method &&
        new URL(r.url()).pathname === `/api/v1${path}` &&
        new URL(r.url()).search === "",
    ),
    action(),
  ]);
  const actual = {
    method,
    path,
    body: request.postData() ? request.postDataJSON() : undefined,
  };
  expect(actual.body).toEqual(body);
  await expect.poll(() => c.writes.at(-1)).toEqual(actual);
  return actual;
}
const sizes = [
  { width: 1440, height: 900 },
  { width: 834, height: 1112 },
  { width: 390, height: 844 },
];
for (const locale of ["en", "ar"] as const)
  for (const theme of ["light", "dark"])
    for (const size of sizes) {
      test(`MOCKED UI-CONTRACT EVIDENCE ${locale} ${theme} ${size.width}`, async ({
        page,
      }, info) => {
        test.setTimeout(240_000);
        await page.setViewportSize(size);
        const c = await prepare(page, locale, theme),
          t = (locale === "ar" ? ar : en).deliveryPlanning;
        const records: unknown[] = [],
          form = (name: string) =>
            page.getByRole("form", { name, exact: true }),
          region = (name: string) =>
            page.getByRole("region", { name, exact: true });
        const yf = form(t.yearWorkbench),
          tf = form(t.termWorkbench),
          create = region(t.planWorkbench),
          selected = region(t.selectedPlanWorkspace),
          add = region(t.unitWorkbench),
          sequence = region(t.unitSequence);
        const ready = async () => {
          await expect(sequence.getByRole("listitem")).toHaveCount(3);
          await expect(
            add
              .getByRole("combobox", { name: t.canonicalUnit, exact: true })
              .locator("option"),
          ).toHaveCount(4);
        };
        const owner = () =>
          page
            .locator("section")
            .filter({
              has: page.getByRole("heading", { name: t.title, exact: true }),
            })
            .last();
        async function capture(name: string, target?: Locator) {
          // Apply the existing theme control; CSP can block the legacy inline initializer.
          for (
            let attempt = 0;
            attempt < 2 &&
            (await page.evaluate(
              () => document.documentElement.dataset.theme,
            )) !== theme;
            attempt++
          ) {
            await page
              .getByRole("button", {
                name: (locale === "ar" ? ar : en).navigation.theme.toggle,
                exact: true,
              })
              .click();
          }
          await expect
            .poll(() =>
              page.evaluate(() => document.documentElement.dataset.theme),
            )
            .toBe(theme);
          if (target) await target.scrollIntoViewIfNeeded();
          else await page.evaluate(() => scrollTo(0, 0));
          await page.evaluate(() => document.fonts.ready);
          const metrics = await page.evaluate(() => ({
            width: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            direction: document.documentElement.dir,
            theme: document.documentElement.dataset.theme,
          }));
          expect(
            metrics.documentWidth,
            `${name} page overflow`,
          ).toBeLessThanOrEqual(metrics.width + 1);
          await page.screenshot({
            path: info.outputPath(
              `${String(records.length + 1).padStart(2, "0")}-${name}.png`,
            ),
            fullPage: false,
            animations: "disabled",
          });
          records.push({ name, metrics });
        }
        const mutation = async (
          method: string,
          path: string,
          payload: unknown,
          action: () => Promise<unknown>,
          scope: Locator,
          name: string,
        ) => {
          c.modes.set(`${method} ${path}`, "pending");
          await observe(page, c, method, path, payload, action);
          await expect(
            scope.getByRole("status").filter({ hasText: t.saving }),
          ).toContainText(t.saving);
          await capture(`${name}-pending`, scope);
          c.modes.delete(`${method} ${path}`);
          await c.release(`${method} ${path}`);
          await expect(
            scope.getByRole("status").filter({ hasText: t.saving }),
          ).toHaveCount(0);
          await expect(
            scope.getByRole("status").filter({ hasText: t.saved }).last(),
          ).toContainText(t.saved);
          await capture(`${name}-success`, scope);
        };
        try {
          await c.open();
          await ready();
          await expect(owner()).toHaveAttribute(
            "dir",
            locale === "ar" ? "rtl" : "ltr",
          );
          await expect(
            page.getByRole("button", { name: /^RAW-AY-2026/ }),
          ).toHaveAttribute("aria-pressed", "true");
          await capture("multiple-years-active-plan");
          await capture("ordered-unit-sequence", sequence);
          // Keyboard selection and edit have distinct effects.
          const year2 = page.getByRole("button", { name: /^RAW-AY-2027/ });
          await year2.focus();
          await page.keyboard.press("Enter");
          await expect(year2).toHaveAttribute("aria-pressed", "true");
          await expect(
            page.getByText(t.noTerms, { exact: true }),
          ).toBeVisible();
          await expect(selected.getByText(t.noEntries)).toBeVisible();
          await capture("year2-no-terms-empty-plan", selected);
          await page.getByRole("button", { name: /^RAW-AY-2026/ }).click();
          await ready();
          const editYear = page.getByRole("button", {
            name: t.editYearLabel.replace("{year}", years[1].code),
            exact: true,
          });
          await editYear.focus();
          await page.keyboard.press("Enter");
          await expect(yf.getByLabel(t.code, { exact: true })).toHaveValue(
            years[1].code,
          );
          await expect(
            page.getByRole("button", { name: /^RAW-AY-2026/ }),
          ).toHaveAttribute("aria-pressed", "true");
          await capture("edit-year-keeps-context", yf);
          await yf.getByRole("button", { name: t.cancel, exact: true }).click();
          await expect(yf.getByLabel(t.code, { exact: true })).toHaveValue("");
          await yf.getByLabel(t.code, { exact: true }).fill("RAW new year");
          await yf.getByLabel(t.startDate, { exact: true }).fill("2028-01-01");
          await yf.getByLabel(t.endDate, { exact: true }).fill("2028-12-31");
          await capture("create-year-draft", yf);
          // One exact pending POST, factual error, then explicit user retry success.
          const yearPath = `${prefix}/academic-years`,
            yearPayload = {
              code: "RAW new year",
              startDate: "2028-01-01",
              endDate: "2028-12-31",
              isActive: true,
            };
          c.modes.set(`POST ${yearPath}`, "pending");
          await observe(page, c, "POST", yearPath, yearPayload, () =>
            yf.getByRole("button", { name: t.create, exact: true }).click(),
          );
          await expect(
            yf.getByRole("button", { name: t.saving, exact: true }),
          ).toBeDisabled();
          await capture("year-pending-duplicate-blocked", yf);
          c.modes.set(`POST ${yearPath}`, "error");
          c.setError("DuplicateAcademicYear");
          await c.release(`POST ${yearPath}`);
          await expect(yf.getByRole("alert")).toHaveText(t.errors.duplicate);
          await expect(yf.getByLabel(t.code, { exact: true })).toHaveValue(
            yearPayload.code,
          );
          await capture("year-error-draft-retained", yf);
          const savedYear = { ...years[0], id: id(104), ...yearPayload };
          c.state.years.push(savedYear);
          c.state.terms[savedYear.id] = [];
          c.state.plans[savedYear.id] = [];
          c.setResponse(savedYear);
          c.modes.delete(`POST ${yearPath}`);
          await observe(page, c, "POST", yearPath, yearPayload, () =>
            yf.getByRole("button", { name: t.create, exact: true }).click(),
          );
          await expect(yf.getByRole("status")).toContainText(t.saved);
          await expect(
            page.getByRole("button", { name: /^RAW new year/ }),
          ).toHaveAttribute("aria-pressed", "true");
          await expect(yf.getByLabel(t.code, { exact: true })).toHaveValue("");
          await capture("year-created-selected-returned-id", yf);
          // PUT year preserves exact fields and saved server ID.
          await page
            .getByRole("button", {
              name: t.editYearLabel.replace("{year}", savedYear.code),
              exact: true,
            })
            .click();
          await yf.getByLabel(t.code, { exact: true }).fill("RAW updated year");
          c.state.years[c.state.years.length - 1] = {
            ...savedYear,
            code: "RAW updated year",
          };
          c.setResponse(c.state.years.at(-1));
          await mutation(
            "PUT",
            `${yearPath}/${savedYear.id}`,
            { ...yearPayload, code: "RAW updated year" },
            () =>
              yf.getByRole("button", { name: t.update, exact: true }).click(),
            yf,
            "year-update",
          );
          await page.getByRole("button", { name: /^RAW-AY-2026/ }).click();
          await ready();
          // Native required validation: no transport on empty form submission.
          const count = c.writes.length;
          await yf.getByRole("button", { name: t.create, exact: true }).click();
          expect(c.writes).toHaveLength(count);
          expect(
            await yf
              .getByLabel(t.code, { exact: true })
              .evaluate((n) => (n as HTMLInputElement).validity.valueMissing),
          ).toBe(true);
          await capture("native-year-required", yf);
          await page
            .getByRole("button", {
              name: t.editTermLabel.replace("{term}", terms[1].code),
              exact: true,
            })
            .click();
          await capture("edit-term", tf);
          await tf.getByRole("button", { name: t.cancel, exact: true }).click();
          await tf.getByLabel(t.code, { exact: true }).fill("RAW new term");
          await tf.getByLabel(t.startDate, { exact: true }).fill("2026-01-02");
          await tf.getByLabel(t.endDate, { exact: true }).fill("2026-01-20");
          await tf.getByLabel(t.sortOrder, { exact: true }).fill("77");
          await tf
            .getByRole("checkbox", { name: t.active, exact: true })
            .uncheck();
          const termPayload = {
              code: "RAW new term",
              startDate: "2026-01-02",
              endDate: "2026-01-20",
              sortOrder: 77,
              isActive: false,
              academicYearId: years[0].id,
            },
            termPath = `${prefix}/terms`;
          c.modes.set(`POST ${termPath}`, "error");
          c.setError("OverlappingActiveTerm");
          await observe(page, c, "POST", termPath, termPayload, () =>
            tf.getByRole("button", { name: t.create, exact: true }).click(),
          );
          await expect(tf.getByRole("alert")).toHaveText(t.errors.overlap);
          await capture("term-error-factual-draft", tf);
          c.modes.delete(`POST ${termPath}`);
          const savedTerm = { ...termPayload, id: id(204) };
          c.state.terms[years[0].id].push(savedTerm);
          c.setResponse(savedTerm);
          await mutation(
            "POST",
            termPath,
            termPayload,
            () =>
              tf.getByRole("button", { name: t.create, exact: true }).click(),
            tf,
            "term-create",
          );
          await expect(tf.getByLabel(t.code, { exact: true })).toHaveValue("");
          await page
            .getByRole("button", {
              name: t.editTermLabel.replace("{term}", savedTerm.code),
              exact: true,
            })
            .click();
          await tf.getByLabel(t.sortOrder, { exact: true }).fill("78");
          c.setResponse({ ...savedTerm, sortOrder: 78 });
          await mutation(
            "PUT",
            `${termPath}/${savedTerm.id}`,
            { ...termPayload, sortOrder: 78 },
            () =>
              tf.getByRole("button", { name: t.update, exact: true }).click(),
            tf,
            "term-update",
          );
          const versionSelect = create.getByRole("combobox", {
              name: t.qualificationVersion,
              exact: true,
            }),
            gradeSelect = create.getByRole("combobox", {
              name: t.residualgrade,
              exact: true,
            });
          expect(
            await versionSelect
              .locator("option")
              .evaluateAll((ns) =>
                ns.map((n) => (n as HTMLOptionElement).value),
              ),
          ).toEqual(["", versions[0].id, versions[1].id]);
          await versionSelect.selectOption(versions[0].id);
          await capture("version-derived-specialization", create);
          await gradeSelect.selectOption(grades[0].id);
          await expect(
            create.getByRole("button", { name: t.createPlan, exact: true }),
          ).toBeDisabled();
          await expect(create.getByText(t.loadedDuplicate)).toBeVisible();
          await capture("duplicate-loaded-plan-guard", create);
          await versionSelect.selectOption(versions[1].id);
          await expect(gradeSelect).toHaveValue("");
          expect(
            await gradeSelect
              .locator("option")
              .evaluateAll((ns) =>
                ns.map((n) => (n as HTMLOptionElement).value),
              ),
          ).toEqual(["", grades[2].id]);
          await gradeSelect.selectOption(grades[2].id);
          await capture("create-plan-track-dependent-grade", create);
          const savedPlan: Plan = {
            plan: {
              ...summary,
              id: id(705),
              qualificationVersionId: versions[1].id,
              qualificationVersionCode: versions[1].versionCode,
              qualificationEnglishName: versions[1].qualificationEnglishName,
              qualificationArabicName: versions[1].qualificationArabicName,
              gradeId: grades[2].id,
              gradeEnglishName: grades[2].englishName,
              gradeArabicName: grades[2].arabicName,
              entryCount: 0,
            },
            entries: [],
          };
          c.state.plans[years[0].id].push(savedPlan.plan);
          c.state.detail[savedPlan.plan.id] = savedPlan;
          c.setResponse(savedPlan);
          await mutation(
            "POST",
            `${prefix}/plans`,
            {
              qualificationVersionId: versions[1].id,
              academicYearId: years[0].id,
              gradeId: grades[2].id,
            },
            () =>
              create
                .getByRole("button", { name: t.createPlan, exact: true })
                .click(),
            create,
            "plan-create",
          );
          await expect(
            selected.getByRole("heading", { level: 3, name: /RAW-V-/ }),
          ).toContainText("RAW-V-TWO");
          await capture("server-returned-selected-plan", selected);
          // Select inactive plan with a historical inactive term. No misleading current term.
          await page
            .getByRole("button", {
              name: new RegExp(
                locale === "ar" ? grades[1].arabicName : grades[1].englishName,
              ),
            })
            .click();
          await expect(
            selected.getByText(t.inactivePlan, { exact: true }),
          ).toBeVisible();
          await expect(
            sequence.getByText(
              t.assignedTerm.replace("{term}", terms[0].code),
              { exact: true },
            ),
          ).toBeVisible();
          await expect(sequence.getByRole("combobox")).toHaveCount(0);
          for (const b of await sequence.getByRole("button").all())
            await expect(b).toBeDisabled();
          await expect(
            add.getByRole("button", { name: t.addUnit, exact: true }),
          ).toHaveCount(0);
          await capture("inactive-plan-saved-inactive-term", sequence);
          await page
            .getByRole("button", {
              name: new RegExp(
                locale === "ar" ? grades[0].arabicName : grades[0].englishName,
              ),
            })
            .click();
          await ready();
          c.state.detail[summary.id] = {
            ...c.state.detail[summary.id],
            plan: { ...summary, isActive: false },
          };
          c.setResponse(c.state.detail[summary.id]);
          await mutation(
            "PUT",
            `${prefix}/plans/${summary.id}`,
            { isActive: false },
            () =>
              selected
                .getByRole("button", { name: t.deactivate, exact: true })
                .click(),
            selected,
            "plan-deactivate",
          );
          await expect(
            add.getByRole("button", { name: t.addUnit, exact: true }),
          ).toHaveCount(0);
          c.state.detail[summary.id] = {
            ...c.state.detail[summary.id],
            plan: { ...summary, isActive: true },
          };
          c.setResponse(c.state.detail[summary.id]);
          await mutation(
            "PUT",
            `${prefix}/plans/${summary.id}`,
            { isActive: true },
            () =>
              selected
                .getByRole("button", { name: t.activate, exact: true })
                .click(),
            selected,
            "plan-activate",
          );
          await ready();
          const unitSelect = add.getByRole("combobox", {
              name: t.canonicalUnit,
              exact: true,
            }),
            termSelect = add.getByRole("combobox", {
              name: t.term,
              exact: true,
            });
          expect(
            await unitSelect
              .locator("option")
              .evaluateAll((ns) =>
                ns.map((n) => (n as HTMLOptionElement).value),
              ),
          ).toEqual(["", id(605), id(606), id(607)]);
          expect(
            await termSelect
              .locator("option")
              .evaluateAll((ns) =>
                ns.map((n) => (n as HTMLOptionElement).value),
              ),
          ).toEqual(["", terms[1].id, terms[2].id]);
          await unitSelect.selectOption(id(605));
          await expect(termSelect).toHaveValue(terms[1].id);
          await capture("unused-unit-first-active-term", add);
          const unit5 = c.state.units[versions[0].id][4],
            newEntry = {
              id: id(805),
              unitDefinitionId: unit5.id,
              unitCode: unit5.code,
              unitEnglishTitle: unit5.englishTitle,
              unitArabicTitle: unit5.arabicTitle,
              academicTermId: terms[1].id,
              termCode: terms[1].code,
              sortOrder: 40,
            };
          c.state.detail[summary.id].entries.push(newEntry);
          c.setResponse(c.state.detail[summary.id]);
          await mutation(
            "POST",
            `${prefix}/plans/${summary.id}/entries`,
            { unitDefinitionId: unit5.id, academicTermId: terms[1].id },
            () =>
              add.getByRole("button", { name: t.addUnit, exact: true }).click(),
            add,
            "unit-add",
          );
          await expect(unitSelect).toHaveValue("");
          await expect(
            unitSelect.locator(`option[value='${unit5.id}']`),
          ).toHaveCount(0);
          const firstRow = sequence
            .getByRole("listitem")
            .filter({ hasText: "RAW-U1" });
          c.state.detail[summary.id].entries[0] = {
            ...entries[0],
            academicTermId: terms[2].id,
            termCode: terms[2].code,
          };
          c.setResponse(c.state.detail[summary.id]);
          await mutation(
            "PUT",
            `${prefix}/entries/${entries[0].id}`,
            { academicTermId: terms[2].id },
            () => firstRow.getByRole("combobox").selectOption(terms[2].id),
            sequence,
            "unit-term-change",
          );
          await expect(
            firstRow.getByText(
              t.assignedTerm.replace("{term}", terms[2].code),
              { exact: true },
            ),
          ).toBeVisible();
          await expect(
            sequence.getByRole("button", {
              name: t.moveUp.replace("{unit}", "RAW-U1"),
              exact: true,
            }),
          ).toBeDisabled();
          await expect(
            sequence.getByRole("button", {
              name: t.moveDown.replace("{unit}", "RAW-U5"),
              exact: true,
            }),
          ).toBeDisabled();
          for (const [unit, direction, name] of [
            ["RAW-U1", 1, "first-down"],
            ["RAW-U3", -1, "middle-up"],
            ["RAW-U5", -1, "last-up"],
          ] as const) {
            const rows = c.state.detail[summary.id].entries,
              index = rows.findIndex((e) => e.unitCode === unit),
              ordered = [...rows];
            [ordered[index], ordered[index + direction]] = [
              ordered[index + direction],
              ordered[index],
            ];
            c.state.detail[summary.id] = {
              ...c.state.detail[summary.id],
              entries: ordered,
            };
            c.setResponse(c.state.detail[summary.id]);
            await observe(
              page,
              c,
              "PUT",
              `${prefix}/plans/${summary.id}/entry-order`,
              { entryIds: ordered.map((e) => e.id) },
              () =>
                sequence
                  .getByRole("button", {
                    name: (direction === 1 ? t.moveDown : t.moveUp).replace(
                      "{unit}",
                      unit,
                    ),
                    exact: true,
                  })
                  .click(),
            );
            await expect(sequence.getByRole("listitem").first()).toContainText(
              ordered[0].unitCode,
            );
            await expect(
              sequence
                .getByRole("button", { name: t.removeFromPlan, exact: true })
                .first(),
            ).toBeEnabled();
            await capture(`reorder-${name}-complete-array`, sequence);
          }
          const removeRow = sequence
            .getByRole("listitem")
            .filter({ hasText: "RAW-U2" });
          c.state.detail[summary.id] = {
            ...c.state.detail[summary.id],
            entries: c.state.detail[summary.id].entries.filter(
              (e) => e.id !== entries[1].id,
            ),
          };
          c.setResponse(c.state.detail[summary.id]);
          await mutation(
            "DELETE",
            `${prefix}/entries/${entries[1].id}`,
            undefined,
            () =>
              removeRow
                .getByRole("button", { name: t.removeFromPlan, exact: true })
                .click(),
            sequence,
            "remove-entry-only",
          );
          await expect(
            sequence.getByRole("listitem").filter({ hasText: "RAW-U2" }),
          ).toHaveCount(0);
          expect(
            c.state.units[versions[0].id].some(
              (u) => u.id === entries[1].unitDefinitionId,
            ),
          ).toBe(true);
          await expect(
            unitSelect.locator(
              `option[value='${entries[1].unitDefinitionId}']`,
            ),
          ).toHaveCount(1);
          // Long bilingual server data and dense sequence. Canned read fixture, no write.
          const long = locale === "ar" ? longArabic : longEnglish;
          Object.assign(c.state.detail[summary.id].plan, {
            qualificationEnglishName: longEnglish,
            qualificationArabicName: longArabic,
          });
          c.state.detail[summary.id].entries = Array.from(
            { length: 24 },
            (_, i) => ({
              ...entries[i % 3],
              id: id(850 + i),
              unitDefinitionId: id(950 + i),
              unitCode: `RAW-LONG-${i + 1}`,
              unitEnglishTitle: longEnglish,
              unitArabicTitle: longArabic,
              sortOrder: (i + 1) * 10,
            }),
          );
          await page.reload({ waitUntil: "domcontentloaded" });
          await expect(sequence.getByRole("listitem")).toHaveCount(24);
          await expect(
            selected.getByRole("heading", { level: 3, name: /RAW-V-/ }),
          ).toContainText(long.trim());
          await capture("long-qualification-24-unit-sequence", sequence);
          const last = sequence.getByRole("listitem").last();
          await capture("long-unit-final-row", last);
          const focus = last.getByRole("button", {
            name: t.moveUp.replace("{unit}", "RAW-LONG-24"),
            exact: true,
          });
          await focus.focus();
          await page.keyboard.press("Tab");
          await page.keyboard.press("Shift+Tab");
          await expect(focus).toBeFocused();
          expect(
            await focus.evaluate((n) =>
              parseFloat(getComputedStyle(n).outlineWidth),
            ),
          ).toBeGreaterThanOrEqual(2);
          await capture("keyboard-focus-visible", focus);
          const targets = await owner()
            .locator("button,select,input:not([type=checkbox])")
            .evaluateAll((ns) =>
              ns
                .filter((n) => n.getClientRects().length)
                .map((n) => ({
                  tag: n.tagName,
                  height: n.getBoundingClientRect().height,
                })),
            );
          expect(targets.every((n) => n.height >= 43)).toBe(true);
          await page.setViewportSize({
            width: Math.max(320, Math.round(size.width / 2)),
            height: size.height,
          });
          await capture("half-width-reflow-proxy", last);
          await page.setViewportSize({ width: 320, height: 844 });
          await capture("320px-narrow-reflow", last);
          await page.setViewportSize(size);
          // True React Query cache: reconnect triggers the inherited stale refresh.
          await yf
            .getByLabel(t.code, { exact: true })
            .fill("RAW unsaved cached draft");
          for (const path of [...new Set(c.reads)])
            c.modes.set(`GET ${path}`, "error");
          const before = c.reads.length;
          // Advance Date only beyond the unchanged provider's 30s stale window.
          // Real browser offline/online events exercise inherited query reconnect.
          await page.clock.setFixedTime(Date.now() + 31_000);
          await page.context().setOffline(true);
          await expect
            .poll(() => page.evaluate(() => navigator.onLine))
            .toBe(false);
          await page.context().setOffline(false);
          await expect.poll(() => c.reads.length).toBeGreaterThan(before);
          await expect(
            page.getByText(t.loadError, { exact: true }),
          ).toBeVisible({ timeout: 20_000 });
          await expect(owner().getByRole("alert")).toHaveCount(7, {
            timeout: 20_000,
          });
          await expect(sequence.getByRole("listitem")).toHaveCount(24);
          await expect(yf.getByLabel(t.code, { exact: true })).toHaveValue(
            "RAW unsaved cached draft",
          );
          await expect(
            last.getByRole("button", { name: t.removeFromPlan, exact: true }),
          ).toBeEnabled();
          await capture("cached-refresh-errors-context-retained", last);
          c.modes.clear();
          // Fresh navigation clears cache. Explicit cold/loading/error/empty states.
          for (const [name, path, message] of [
            ["initial", `${prefix}/academic-years?pageSize=100`, t.loading],
            [
              "terms",
              `${prefix}/academic-years/${years[0].id}/terms?pageSize=100`,
              t.loadingTerms,
            ],
            [
              "plans",
              `${prefix}/plans?academicYearId=${years[0].id}&pageSize=100`,
              t.loadingPlans,
            ],
            ["selected", `${prefix}/plans/${summary.id}`, t.loadingPlan],
            [
              "units",
              `${prefix}/qualification-versions/${versions[0].id}/units?pageSize=100`,
              t.loadingUnits,
            ],
          ] as const) {
            c.modes.set(`GET ${path}`, "pending");
            await page.reload({ waitUntil: "domcontentloaded" });
            await expect(
              page.getByText(message, { exact: true }),
            ).toBeVisible();
            await capture(
              `cold-${name}-loading`,
              page.getByText(message, { exact: true }),
            );
            c.modes.set(`GET ${path}`, "error");
            await c.release(`GET ${path}`);
            const error =
              name === "initial"
                ? t.loadError
                : name === "terms"
                  ? t.termsError
                  : name === "plans"
                    ? t.plansError
                    : name === "selected"
                      ? t.planError
                      : t.unitsError;
            await expect(page.getByText(error, { exact: true })).toBeVisible({
              timeout: 20_000,
            });
            await capture(
              `cold-${name}-error`,
              page.getByText(error, { exact: true }),
            );
            c.modes.clear();
          }
          c.state.years = [];
          await page.reload({ waitUntil: "domcontentloaded" });
          await expect(
            page.getByText(t.noYears, { exact: true }),
          ).toBeVisible();
          await capture("empty-years");
          expect(c.errors).toEqual([]);
          expect(c.unexpected).toEqual([]);
        } finally {
          mkdirSync(info.outputDir, { recursive: true });
          writeFileSync(
            info.outputPath("evidence.json"),
            JSON.stringify(
              {
                classification: "MOCKED UI-CONTRACT EVIDENCE",
                locale,
                theme,
                viewport: size,
                records,
                reads: c.reads,
                writes: c.writes,
                unexpected: c.unexpected,
                pageErrors: c.errors,
                status: info.status,
              },
              null,
              2,
            ),
          );
        }
      });
    }
