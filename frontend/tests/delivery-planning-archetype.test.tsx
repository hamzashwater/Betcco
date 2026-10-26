import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeliveryPlanning } from "@/features/admin/delivery-planning";
import { ApiError } from "@/lib/api";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import {
  mount,
  deferred,
  refreshKeys,
} from "./helpers/admin-governance-gradebook-render";
import {
  fixtureState,
  fixtureRead,
  prefix,
  id,
  years,
  terms,
  versions,
  grades,
  entries,
  summary,
  inactivePlan,
  type Plan,
} from "./fixtures/delivery-planning-archetype";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: apiMock,
}));
let state: ReturnType<typeof fixtureState>;
let readOverride: (path: string) => unknown;
let write: (path: string, options: RequestInit) => unknown;
const never = () => new Promise(() => {});
const reads = () =>
  apiMock.mock.calls.filter(([, o]) => !o?.method).map(([p]) => p as string);
const writes = () => apiMock.mock.calls.filter(([, o]) => o?.method);
const form = (name: string) => within(screen.getByRole("form", { name }));
const region = (name: string) => within(screen.getByRole("region", { name }));
const change = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } });
const invalidationKeys = [
  ["delivery-planning-years"],
  ["delivery-planning-terms"],
  ["delivery-planning-plans"],
  ["delivery-planning-plan"],
];
beforeEach(() => {
  state = fixtureState();
  readOverride = (p) => fixtureRead(state, p);
  write = () => {
    throw new Error("Unexpected write");
  };
  apiMock
    .mockReset()
    .mockImplementation(async (p: string, options: RequestInit = {}) =>
      options.method ? write(p, options) : readOverride(p),
    );
});
async function ready(locale: "en" | "ar" = "en") {
  const result = mount(locale, <DeliveryPlanning />),
    t = (locale === "ar" ? ar : en).deliveryPlanning;
  await screen.findByRole("button", {
    name: t.moveDown.replace("{unit}", "RAW-U1"),
  });
  await waitFor(() => expect(reads()).toHaveLength(8));
  return { ...result, t };
}
function draft(t: typeof en.deliveryPlanning, kind: "year" | "term") {
  const f = form(kind === "year" ? t.yearWorkbench : t.termWorkbench);
  change(f.getByLabelText(t.code), ` RAW ${kind} `);
  change(
    f.getByLabelText(t.startDate),
    kind === "year" ? "2028-01-01" : "2026-01-01",
  );
  change(
    f.getByLabelText(t.endDate),
    kind === "year" ? "2028-12-31" : "2026-01-31",
  );
  if (kind === "year")
    change(f.getByRole("combobox", { name: t.status }), "false");
  else {
    change(f.getByLabelText(t.sortOrder), "73");
    fireEvent.click(f.getByRole("checkbox", { name: t.active }));
  }
  return f;
}
async function assertWrite(path: string, method: string, payload?: unknown) {
  await waitFor(() => expect(writes()).toHaveLength(1));
  const [p, o] = writes()[0] as [string, RequestInit];
  expect(p).toBe(path);
  expect(o.method).toBe(method);
  expect(o.body === undefined ? undefined : JSON.parse(String(o.body))).toEqual(
    payload,
  );
  expect(Object.keys(o)).toEqual(
    payload === undefined ? ["method"] : ["method", "body"],
  );
}
describe.each(["en", "ar"] as const)(
  "Delivery Planning component %s",
  (locale) => {
    it("issues exact eight query keys/URLs, server sequence and first active term", async () => {
      const { client, t } = await ready(locale);
      expect(
        client
          .getQueryCache()
          .getAll()
          .filter((q) => q.getObserversCount() > 0)
          .map((q) => q.queryKey),
      ).toEqual([
        ["delivery-planning-years"],
        ["delivery-planning-versions"],
        ["academic-taxonomy-grades"],
        ["academic-taxonomy-specializations"],
        ["delivery-planning-terms", years[0].id],
        ["delivery-planning-plans", years[0].id],
        ["delivery-planning-plan", summary.id],
        ["delivery-planning-units", versions[0].id],
      ]);
      expect(reads()).toEqual([
        `${prefix}/academic-years?pageSize=100`,
        `${prefix}/qualification-versions?pageSize=100`,
        "/admin/academic-taxonomy/grades",
        "/admin/academic-taxonomy/specializations",
        `${prefix}/academic-years/${years[0].id}/terms?pageSize=100`,
        `${prefix}/plans?academicYearId=${years[0].id}&pageSize=100`,
        `${prefix}/plans/${summary.id}`,
        `${prefix}/qualification-versions/${versions[0].id}/units?pageSize=100`,
      ]);
      expect(
        region(t.unitSequence)
          .getAllByRole("listitem")
          .map((n) => n.textContent?.match(/RAW-U\d/)?.[0]),
      ).toEqual(["RAW-U1", "RAW-U2", "RAW-U3"]);
      expect(
        region(t.unitWorkbench).getByRole("combobox", { name: t.term }),
      ).toHaveValue(terms[1].id);
      expect(
        screen.getByRole("button", { name: /^RAW-AY-2026/ }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(writes()).toHaveLength(0);
    });
    it("separates selected year from edit/cancel; missing year falls back to first returned even inactive", async () => {
      const { client, t } = await ready(locale);
      fireEvent.click(
        screen.getByRole("button", {
          name: t.editYearLabel.replace("{year}", years[1].code),
        }),
      );
      expect(form(t.yearWorkbench).getByLabelText(t.code)).toHaveValue(
        years[1].code,
      );
      expect(
        screen.getByRole("button", { name: /^RAW-AY-2026/ }),
      ).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(
        form(t.yearWorkbench).getByRole("button", { name: t.cancel }),
      );
      expect(form(t.yearWorkbench).getByLabelText(t.code)).toHaveValue("");
      fireEvent.click(screen.getByRole("button", { name: /^RAW-AY-2027/ }));
      await screen.findByText(t.noTerms);
      state.years = [years[2], years[0]];
      await act(async () => {
        await client.refetchQueries({ queryKey: ["delivery-planning-years"] });
      });
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /^RAW-AY-INACTIVE/ }),
        ).toHaveAttribute("aria-pressed", "true"),
      );
      await screen.findByText(t.noPlans);
      expect(writes()).toHaveLength(0);
    });
    it("POST year raw payload, pending duplicate guard, selects returned server ID, reset and four invalidations", async () => {
      const { invalidations, t } = await ready(locale),
        gate = deferred();
      write = () => gate.promise;
      const f = draft(t, "year");
      expect(f.getByLabelText(t.code)).toHaveAttribute("minlength", "2");
      expect(f.getByLabelText(t.code)).toHaveAttribute("maxlength", "64");
      expect(f.getByLabelText(t.startDate)).toBeRequired();
      fireEvent.click(f.getByRole("button", { name: t.create }));
      await assertWrite(`${prefix}/academic-years`, "POST", {
        code: " RAW year ",
        startDate: "2028-01-01",
        endDate: "2028-12-31",
        isActive: false,
      });
      await waitFor(() =>
        expect(f.getByRole("button", { name: t.saving })).toBeDisabled(),
      );
      fireEvent.click(f.getByRole("button", { name: t.saving }));
      expect(writes()).toHaveLength(1);
      const saved = {
        id: id(104),
        code: "RAW server year",
        startDate: "2028-01-01",
        endDate: "2028-12-31",
        isActive: false,
      };
      state.years.push(saved);
      state.terms[saved.id] = [];
      state.plans[saved.id] = [];
      await act(async () => {
        gate.resolve(saved);
      });
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /^RAW server year/ }),
        ).toHaveAttribute("aria-pressed", "true"),
      );
      expect(f.getByLabelText(t.code)).toHaveValue("");
      expect(refreshKeys(invalidations)).toEqual(invalidationKeys);
      expect(f.getByRole("status")).toHaveTextContent(t.saved);
    });
    it("PUT year/term exact IDs and payloads, numeric limits, failure preserves draft and cancel resets", async () => {
      const { t } = await ready(locale);
      write = () =>
        Promise.reject(new ApiError(409, "RAW", "InvalidDateRange"));
      fireEvent.click(
        screen.getByRole("button", {
          name: t.editYearLabel.replace("{year}", years[0].code),
        }),
      );
      change(form(t.yearWorkbench).getByLabelText(t.code), "RAW revised");
      fireEvent.click(
        form(t.yearWorkbench).getByRole("button", { name: t.update }),
      );
      await assertWrite(`${prefix}/academic-years/${years[0].id}`, "PUT", {
        code: "RAW revised",
        startDate: years[0].startDate,
        endDate: years[0].endDate,
        isActive: true,
      });
      await waitFor(() =>
        expect(form(t.yearWorkbench).getByRole("alert")).toHaveTextContent(
          t.errors.invalidDates,
        ),
      );
      expect(form(t.yearWorkbench).getByLabelText(t.code)).toHaveValue(
        "RAW revised",
      );
      apiMock.mockClear();
      fireEvent.click(
        screen.getByRole("button", {
          name: t.editTermLabel.replace("{term}", terms[1].code),
        }),
      );
      const f = form(t.termWorkbench);
      expect(f.getByLabelText(t.sortOrder)).toHaveAttribute("min", "0");
      expect(f.getByLabelText(t.sortOrder)).toHaveAttribute("max", "10000");
      change(f.getByLabelText(t.sortOrder), "88");
      fireEvent.click(f.getByRole("button", { name: t.update }));
      await assertWrite(`${prefix}/terms/${terms[1].id}`, "PUT", {
        code: terms[1].code,
        startDate: terms[1].startDate,
        endDate: terms[1].endDate,
        sortOrder: 88,
        isActive: true,
        academicYearId: years[0].id,
      });
      await waitFor(() =>
        expect(f.getByRole("alert")).toHaveTextContent(t.errors.invalidDates),
      );
      expect(f.getByLabelText(t.sortOrder)).toHaveValue(88);
      fireEvent.click(f.getByRole("button", { name: t.cancel }));
      expect(f.getByLabelText(t.code)).toHaveValue("");
      expect(f.getByLabelText(t.sortOrder)).toHaveValue(10);
    });
    it("POST term exact current year/raw fields and resets after success", async () => {
      const { invalidations, t } = await ready(locale);
      write = () => ({ ...terms[0], id: id(204) });
      const f = draft(t, "term");
      fireEvent.click(f.getByRole("button", { name: t.create }));
      await assertWrite(`${prefix}/terms`, "POST", {
        code: " RAW term ",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        sortOrder: 73,
        isActive: false,
        academicYearId: years[0].id,
      });
      await waitFor(() =>
        expect(f.getByRole("status")).toHaveTextContent(t.saved),
      );
      expect(f.getByLabelText(t.code)).toHaveValue("");
      expect(refreshKeys(invalidations)).toEqual(invalidationKeys);
    });
    it("filters versions and grade track, resets grade, guards duplicate, POST plan only 3 fields and selects returned ID", async () => {
      const { t, invalidations } = await ready(locale),
        f = region(t.planWorkbench),
        v = f.getByRole("combobox", { name: t.qualificationVersion }),
        g = f.getByRole("combobox", { name: t.residualgrade });
      expect(
        within(v)
          .getAllByRole("option")
          .map((n) => n.getAttribute("value")),
      ).toEqual(["", versions[0].id, versions[1].id]);
      change(v, versions[0].id);
      expect(
        within(g)
          .getAllByRole("option")
          .map((n) => n.getAttribute("value")),
      ).toEqual(["", grades[0].id, grades[1].id]);
      change(g, grades[0].id);
      expect(f.getByRole("button", { name: t.createPlan })).toBeDisabled();
      expect(f.getByText(t.loadedDuplicate)).toBeVisible();
      change(v, versions[1].id);
      expect(g).toHaveValue("");
      expect(
        within(g)
          .getAllByRole("option")
          .map((n) => n.getAttribute("value")),
      ).toEqual(["", grades[2].id]);
      change(g, grades[2].id);
      const saved: Plan = {
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
        },
        entries: [],
      };
      write = () => {
        state.plans[years[0].id].push(saved.plan);
        state.detail[saved.plan.id] = saved;
        return saved;
      };
      fireEvent.click(f.getByRole("button", { name: t.createPlan }));
      await assertWrite(`${prefix}/plans`, "POST", {
        qualificationVersionId: versions[1].id,
        academicYearId: years[0].id,
        gradeId: grades[2].id,
      });
      await waitFor(() =>
        expect(reads()).toContain(`${prefix}/plans/${saved.plan.id}`),
      );
      await waitFor(() =>
        expect(
          region(t.selectedPlanWorkspace).getByRole("heading", {
            level: 3,
            name: /RAW-V-TWO/,
          }),
        ).toBeVisible(),
      );
      expect(refreshKeys(invalidations)).toEqual(invalidationKeys);
    });
    it("inactive plan shows saved inactive term, real disabled controls, activation PUT only isActive", async () => {
      const { t, invalidations } = await ready(locale),
        name = locale === "ar" ? grades[1].arabicName : grades[1].englishName;
      fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
      await waitFor(() =>
        expect(
          region(t.selectedPlanWorkspace).getByText(t.inactivePlan),
        ).toBeVisible(),
      );
      const seq = region(t.unitSequence);
      expect(
        seq.getByText(t.assignedTerm.replace("{term}", terms[0].code)),
      ).toBeVisible();
      expect(seq.queryByRole("combobox")).toBeNull();
      expect(seq.getByRole("combobox", { hidden: true })).toBeDisabled();
      for (const b of seq.getAllByRole("button")) expect(b).toBeDisabled();
      expect(
        region(t.unitWorkbench).queryByRole("button", { name: t.addUnit }),
      ).toBeNull();
      write = () => {
        const updated = {
          ...state.detail[inactivePlan.plan.id],
          plan: { ...inactivePlan.plan, isActive: true },
        };
        state.detail[inactivePlan.plan.id] = updated;
        return updated;
      };
      fireEvent.click(
        region(t.selectedPlanWorkspace).getByRole("button", {
          name: t.activate,
        }),
      );
      await assertWrite(`${prefix}/plans/${inactivePlan.plan.id}`, "PUT", {
        isActive: true,
      });
      await waitFor(() =>
        expect(
          region(t.selectedPlanWorkspace).getByRole("button", {
            name: t.deactivate,
          }),
        ).toBeEnabled(),
      );
      expect(refreshKeys(invalidations)).toEqual(invalidationKeys);
    });
    it("add excludes used/inactive units, active term only, exact POST and reset/invalidation", async () => {
      const { t, invalidations } = await ready(locale),
        f = region(t.unitWorkbench),
        u = f.getByRole("combobox", { name: t.canonicalUnit });
      expect(
        within(u)
          .getAllByRole("option")
          .map((n) => n.getAttribute("value")),
      ).toEqual(["", id(605), id(606), id(607)]);
      expect(
        within(f.getByRole("combobox", { name: t.term }))
          .getAllByRole("option")
          .map((n) => n.getAttribute("value")),
      ).toEqual(["", terms[1].id, terms[2].id]);
      write = () => state.detail[summary.id];
      change(u, id(605));
      fireEvent.click(f.getByRole("button", { name: t.addUnit }));
      await assertWrite(`${prefix}/plans/${summary.id}/entries`, "POST", {
        unitDefinitionId: id(605),
        academicTermId: terms[1].id,
      });
      await waitFor(() => expect(u).toHaveValue(""));
      expect(refreshKeys(invalidations)).toEqual(invalidationKeys);
    });
    it("entry PUT one field, full ordered ID swaps, first/last boundaries and scoped DELETE no body", async () => {
      const { t } = await ready(locale);
      write = () => state.detail[summary.id];
      const seq = region(t.unitSequence),
        rows = seq.getAllByRole("listitem");
      expect(
        within(rows[0]).getByRole("button", {
          name: t.moveUp.replace("{unit}", "RAW-U1"),
        }),
      ).toBeDisabled();
      expect(
        within(rows[2]).getByRole("button", {
          name: t.moveDown.replace("{unit}", "RAW-U3"),
        }),
      ).toBeDisabled();
      change(within(rows[1]).getByRole("combobox"), terms[2].id);
      await assertWrite(`${prefix}/entries/${entries[1].id}`, "PUT", {
        academicTermId: terms[2].id,
      });
      await waitFor(() =>
        expect(within(rows[1]).getByRole("combobox")).toBeEnabled(),
      );
      for (const [name, ids] of [
        [
          t.moveDown.replace("{unit}", "RAW-U1"),
          [entries[1].id, entries[0].id, entries[2].id],
        ],
        [
          t.moveUp.replace("{unit}", "RAW-U2"),
          [entries[1].id, entries[0].id, entries[2].id],
        ],
        [
          t.moveUp.replace("{unit}", "RAW-U3"),
          [entries[0].id, entries[2].id, entries[1].id],
        ],
      ] as const) {
        apiMock.mockClear();
        fireEvent.click(seq.getByRole("button", { name }));
        await assertWrite(`${prefix}/plans/${summary.id}/entry-order`, "PUT", {
          entryIds: ids,
        });
        await waitFor(() =>
          expect(seq.getByRole("button", { name })).toBeEnabled(),
        );
      }
      apiMock.mockClear();
      fireEvent.click(
        within(rows[1]).getByRole("button", { name: t.removeFromPlan }),
      );
      await assertWrite(`${prefix}/entries/${entries[1].id}`, "DELETE");
      expect(state.units[versions[0].id].map((u) => u.id)).toContain(
        entries[1].unitDefinitionId,
      );
    });
    it("keeps actual cached data, actions and unsaved drafts on all eight background errors", async () => {
      const { client, t } = await ready(locale),
        f = draft(t, "year");
      draft(t, "term");
      readOverride = () =>
        Promise.reject(new ApiError(503, "Synthetic refresh"));
      await act(async () => {
        await client.refetchQueries();
      });
      await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(7));
      expect(f.getByLabelText(t.code)).toHaveValue(" RAW year ");
      expect(form(t.termWorkbench).getByLabelText(t.code)).toHaveValue(
        " RAW term ",
      );
      expect(region(t.unitSequence).getAllByRole("listitem")).toHaveLength(3);
      expect(
        region(t.unitSequence).getByRole("button", {
          name: t.moveDown.replace("{unit}", "RAW-U1"),
        }),
      ).toBeEnabled();
      expect(
        region(t.unitWorkbench).getByRole("combobox", {
          name: t.canonicalUnit,
        }),
      ).toBeEnabled();
      expect(
        client.getQueryData(["delivery-planning-plan", summary.id]),
      ).toEqual(state.detail[summary.id]);
      expect(writes()).toHaveLength(0);
    });
  },
);
describe("cold boundaries and factual operation errors", () => {
  it.each(["pending", "error", "empty"] as const)(
    "initial years %s suppresses dependent reads",
    async (mode) => {
      state.years = [];
      const original = readOverride;
      readOverride = (p) =>
        p.includes("/academic-years?")
          ? mode === "pending"
            ? never()
            : mode === "error"
              ? Promise.reject(new Error("Synthetic"))
              : fixtureRead(state, p)
          : original(p);
      mount("en", <DeliveryPlanning />);
      if (mode === "pending")
        expect(screen.getByText(en.deliveryPlanning.loading)).toHaveAttribute(
          "aria-busy",
          "true",
        );
      else
        await screen.findByText(
          mode === "error"
            ? en.deliveryPlanning.loadError
            : en.deliveryPlanning.noYears,
        );
      expect(reads()).toHaveLength(4);
      expect(writes()).toHaveLength(0);
    },
  );
  it.each([
    ["terms", "loadingTerms", "termsError", "noTerms"],
    ["plans", "loadingPlans", "plansError", "noPlans"],
    ["selected", "loadingPlan", "planError", "noSelectedPlan"],
    ["units", "loadingUnits", "unitsError", null],
  ] as const)(
    "%s cold loading/error/empty distinctions",
    async (kind, loading, error, empty) => {
      const { cleanup } = await import("@testing-library/react");
      for (const mode of ["pending", "error", "empty"] as const) {
        if (mode === "empty" && !empty) continue;
        const matcher = (p: string) =>
          kind === "terms"
            ? p.includes("/terms?")
            : kind === "plans"
              ? p.includes("/plans?")
              : kind === "selected"
                ? p === `${prefix}/plans/${summary.id}`
                : p.includes("/units?");
        readOverride = (p) =>
          matcher(p)
            ? mode === "pending"
              ? never()
              : mode === "error"
                ? Promise.reject(new Error("Synthetic"))
                : kind === "selected"
                  ? null
                  : { items: [], page: 1, pageSize: 100, totalCount: 0 }
            : fixtureRead(state, p);
        const { client } = mount("en", <DeliveryPlanning />);
        await screen.findByText(
          en.deliveryPlanning[
            mode === "pending" ? loading : mode === "error" ? error : empty!
          ],
        );
        if (kind === "plans")
          expect(reads()).not.toContain(`${prefix}/plans/${summary.id}`);
        if (kind === "selected")
          expect(reads().some((p) => p.includes("/units?"))).toBe(false);
        expect(writes()).toHaveLength(0);
        cleanup();
        client.clear();
        apiMock.mockClear();
      }
    },
  );
  it.each(["grades", "specializations"] as const)(
    "non-array %s normalizes to [] and no inferred grade",
    async (kind) => {
      const original = readOverride;
      readOverride = (p) =>
        p === `/admin/academic-taxonomy/${kind}`
          ? { notAnArray: true }
          : original(p);
      const { client, t } = await ready();
      expect(client.getQueryData([`academic-taxonomy-${kind}`])).toEqual([]);
      change(
        region(t.planWorkbench).getByRole("combobox", {
          name: t.qualificationVersion,
        }),
        versions[0].id,
      );
      expect(
        within(
          region(t.planWorkbench).getByRole("combobox", {
            name: t.residualgrade,
          }),
        ).getAllByRole("option"),
      ).toHaveLength(1);
    },
  );
  it("missing selected plan and deactivated chosen term use first returned/first active fallback", async () => {
    const { client, t } = await ready();
    fireEvent.click(screen.getByRole("button", { name: /RAW Grade12/ }));
    await screen.findByText(t.inactivePlan);
    state.plans[years[0].id] = [summary];
    await act(async () => {
      await client.refetchQueries({ queryKey: ["delivery-planning-plans"] });
    });
    await screen.findByText(t.editable);
    const f = region(t.unitWorkbench);
    change(f.getByRole("combobox", { name: t.term }), terms[2].id);
    state.terms[years[0].id] = [
      { ...terms[2], isActive: false },
      terms[1],
      terms[0],
    ];
    await act(async () => {
      await client.refetchQueries({ queryKey: ["delivery-planning-terms"] });
    });
    await waitFor(() =>
      expect(f.getByRole("combobox", { name: t.term })).toHaveValue(
        terms[1].id,
      ),
    );
  });
  it.each([
    ["InvalidCode", "invalidCode"],
    ["InvalidDateRange", "invalidDates"],
    ["TermOutsideAcademicYear", "invalidDates"],
    ["OverlappingActiveTerm", "overlap"],
    ["DuplicateDeliveryPlan", "duplicate"],
    ["UnitOutsideVersion", "wrongAssociation"],
    ["AcademicYearImmutable", "wrongAssociation"],
    ["YearHasActivePlans", "inUse"],
    ["DeliveryPlanNotEditable", "inactivePlan"],
    ["UnknownBusinessFailure", null],
  ] as const)(
    "%s retains mapped meaning and draft in term context",
    async (code, key) => {
      const { t } = await ready();
      write = () => Promise.reject(new ApiError(409, "RAW", code));
      const f = draft(t, "term");
      fireEvent.click(f.getByRole("button", { name: t.create }));
      await waitFor(() =>
        expect(f.getByRole("alert")).toHaveTextContent(
          key ? t.errors[key] : t.saveError,
        ),
      );
      expect(f.getByLabelText(t.code)).toHaveValue(" RAW term ");
      expect(form(t.yearWorkbench).queryByRole("alert")).toBeNull();
      expect(f.queryByText(t.saved)).toBeNull();
      expect(writes()).toHaveLength(1);
    },
  );
  it("keyboard year selection, edit and cancel use real buttons", async () => {
    const { t } = await ready(),
      user = userEvent.setup(),
      y = screen.getByRole("button", { name: /^RAW-AY-2027/ });
    y.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(y).toHaveAttribute("aria-pressed", "true"));
    screen
      .getByRole("button", {
        name: t.editYearLabel.replace("{year}", years[0].code),
      })
      .focus();
    await user.keyboard(" ");
    expect(form(t.yearWorkbench).getByLabelText(t.code)).toHaveValue(
      years[0].code,
    );
    form(t.yearWorkbench).getByRole("button", { name: t.cancel }).focus();
    await user.keyboard("{Enter}");
    expect(form(t.yearWorkbench).getByLabelText(t.code)).toHaveValue("");
    expect(writes()).toHaveLength(0);
  });
});
