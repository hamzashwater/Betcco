import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-15-delivery-planning-baseline.json";
import { deliveryPlanningContracts } from "./helpers/delivery-planning-contracts";
import {
  projectDeliveryPlanningBoundary,
  withoutDeliveryPlanningAdditions,
} from "./helpers/delivery-planning-projection";
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n"),
  hash = (s: string) => createHash("sha256").update(s).digest("hex"),
  path = baseline.path,
  source = read(path);
describe("Slice8 independent Delivery Planning boundary", () => {
  it("pins actual pre-edit main/source/fixture independently of view projection", () => {
    expect(baseline.base).toBe("a4d3cdecdf7e00cc8ed3037b15ae22683d672b89");
    expect(baseline.originalHash).toBe(
      "0460f2f7e2fc7d0dd7b395c7ec4b0d9d7c4d7af82e3da07daa5448491c191d0c",
    );
    expect(hash(JSON.stringify(baseline))).toBe(
      "8604e113177c25cc60ed1cf9acb180b7a3f79d32f4191d810b4c1bded90a80fa",
    );
    expect(deliveryPlanningContracts(source)).toEqual(baseline.invariants);
    expect(baseline.invariants.apis).toHaveLength(16);
    expect(baseline.invariants.props).toHaveLength(108);
    expect(baseline.invariants.filters).toHaveLength(5);
  });
  it("retains8 query hooks/8 mutations and no new business algorithm, inference, drag/drop or identity exposure", () => {
    expect(source.match(/useQuery\(/g)).toHaveLength(8);
    expect(source.match(/useMutation\(/g)).toHaveLength(8);
    expect(source.match(/\bapi</g)).toHaveLength(16);
    expect(source).not.toMatch(
      /\.sort\(|\.toSorted\(|useEffect|setHours|new Date\(|Date\.now|latestVersion|activeYearId|\bfetch\(|axios|draggable|onDrop|profile|email|phone|OwnerUserId|CreatedByUserId|UpdatedByUserId|RowVersion|IsDeleted/,
    );
    expect(source).toContain("hidden={!plan.data.plan.isActive}");
    expect(source).toContain('t("assignedTerm", { term: entry.termCode })');
    expect(source).toContain('t("removeFromPlan")');
    expect(source).toContain("years.data === undefined");
    expect(source).toContain("versions.data === undefined");
    expect(source).toContain("terms.data === undefined");
    expect(source).toContain("plans.data === undefined");
    expect(source).toContain("plan.data === undefined");
    expect(source).not.toMatch(
      /confirm\(|window\.alert|optimistic|setQueryData/,
    );
  });
  it("canonicalizes only optional object trailing punctuation while preserving actual literals and property values", () => {
    const formatted = source.replace(
      "setYearForm({ ...yearForm, code: e.target.value })",
      "setYearForm({ ...yearForm, code: e.target.value, })",
    );
    expect(deliveryPlanningContracts(formatted)).toEqual(baseline.invariants);
    expect(
      deliveryPlanningContracts(
        source.replace("code: e.target.value", 'code: "changed"'),
      ),
    ).not.toEqual(baseline.invariants);
  });
  it("reverses exact unique approved owner seams only, with fail-closed changed/missing/duplicate hunks", () => {
    for (const p of [path, "C:/workspace/" + path])
      expect(hash(projectDeliveryPlanningBoundary(source, p))).toBe(
        baseline.originalHash,
      );
    expect(
      projectDeliveryPlanningBoundary(
        source,
        "src/other/delivery-planning.tsx",
      ),
    ).toBe(source);
    for (const seam of baseline.seams)
      for (const replacement of [
        "",
        seam.approved + seam.approved,
        seam.approved.replace(/\S/, "#"),
      ])
        expect(
          hash(
            projectDeliveryPlanningBoundary(
              source.replace(seam.approved, replacement),
              path,
            ),
          ),
        ).not.toBe(baseline.originalHash);
  });
  it.each<[string | RegExp, string]>([
    ['["delivery-planning-years"]', '["changed-years"]'],
    ['["delivery-planning-versions"]', '["changed-versions"]'],
    ['["academic-taxonomy-grades"]', '["changed-grades"]'],
    ['["academic-taxonomy-specializations"]', '["changed-specializations"]'],
    [
      '["delivery-planning-terms", currentYearId]',
      '["delivery-planning-terms"]',
    ],
    [
      '["delivery-planning-plans", currentYearId]',
      '["delivery-planning-plans"]',
    ],
    ['["delivery-planning-plan", currentPlanId]', '["delivery-planning-plan"]'],
    [
      '["delivery-planning-units", planVersionId]',
      '["delivery-planning-units"]',
    ],
    ["academic-years?pageSize=100", "academic-years?pageSize=50"],
    [
      "qualification-versions?pageSize=100",
      "qualification-versions?pageSize=50",
    ],
    ["/admin/academic-taxonomy/grades", "/changed/grades"],
    ["/admin/academic-taxonomy/specializations", "/changed/specializations"],
    [
      "academic-years/${currentYearId}/terms?pageSize=100",
      "academic-years/other/terms?pageSize=100",
    ],
    [
      "plans?academicYearId=${currentYearId}&pageSize=100",
      "plans?academicYearId=other&pageSize=100",
    ],
    ["plans/${currentPlanId}`", "plans/other`"],
    [
      "qualification-versions/${planVersionId}/units?pageSize=100",
      "qualification-versions/other/units?pageSize=100",
    ],
    ["enabled: Boolean(currentYearId)", "enabled: true"],
    ["enabled: Boolean(currentPlanId)", "enabled: true"],
    ["enabled: Boolean(planVersionId)", "enabled: true"],
    ["Array.isArray(value) ? value : []", "value"],
    ['years.data?.items[0]?.id ?? ""', '"latest"'],
    ['plans.data?.items[0]?.id ?? ""', '"latest"'],
    ["item.id === entryTermId && item.isActive", "item.id === entryTermId"],
    [
      "terms.data?.items.find((item) => item.isActive)?.id",
      "terms.data?.items[0]?.id",
    ],
    [
      "JSON.stringify(yearForm)",
      "JSON.stringify({ ...yearForm, invented: true })",
    ],
    ['yearId ? "PUT" : "POST"', '"POST"'],
    ['termId ? "PUT" : "POST"', '"POST"'],
    [
      "...termForm, academicYearId: currentYearId",
      '...termForm, academicYearId: "other"',
    ],
    ["qualificationVersionId: versionId", 'qualificationVersionId: "other"'],
    ["gradeId,", "specializationId: gradeId,"],
    [
      "JSON.stringify({ isActive })",
      "JSON.stringify({ isActive, publish: true })",
    ],
    ["unitDefinitionId: unitId", 'unitDefinitionId: "other"'],
    ["academicTermId: currentEntryTermId", 'academicTermId: "other"'],
    [
      "JSON.stringify({ academicTermId })",
      "JSON.stringify({ academicTermId, entry: true })",
    ],
    [
      "JSON.stringify({ entryIds })",
      "JSON.stringify({ entryIds: entryIds.slice(1) })",
    ],
    ['method: "DELETE"', 'method: "POST"'],
    ["setSelectedYearId(saved.id)", 'setSelectedYearId("")'],
    ["setYearForm(emptyYear)", "setYearForm(yearForm)"],
    ["setTermForm(emptyTerm)", "setTermForm(termForm)"],
    ["setSelectedPlanId(saved.plan.id)", 'setSelectedPlanId("")'],
    ['setUnitId("")', "setUnitId(unitId)"],
    ["await invalidate()", "void 0"],
    ["item.isActive && !selected.has(item.id)", "item.isActive"],
    ["item.isActive && Boolean(item.specializationId)", "item.isActive"],
    ["item.isVisible &&", "true &&"],
    ["selectedSpecialization?.learningTrackId", '"other-track"'],
    ["target < 0 || target >= ids.length", "false"],
    ["[ids[index], ids[target]] = [ids[target], ids[index]]", "ids.reverse()"],
    ["reorder.mutate(ids)", "reorder.mutate(ids.slice(1))"],
    ["disabled={!plan.data.plan.isActive || isSaving}", "disabled={isSaving}"],
    ["index === 0 ||", "false ||"],
    ["index === plan.data.entries.length - 1 ||", "false ||"],
    [
      "disabled={!unitId || !currentEntryTermId || isSaving}",
      "disabled={isSaving}",
    ],
    ["item.gradeId === gradeId", "false"],
    [
      "onClick={() => removeEntry.mutate(entry.id)}",
      'onClick={() => removeEntry.mutate("other")}',
    ],
    ["value={entry.academicTermId}", 'value="other"'],
    ["saving={isSaving}", "saving={false}"],
    ["minLength={2}", "minLength={1}"],
    ["maxLength={64}", "maxLength={65}"],
    ["max={10000}", "max={10001}"],
    ["sortOrder: Number(e.target.value)", "sortOrder: 0"],
    ['errorCode === "OverlappingActiveTerm"', 'errorCode === "Other"'],
    ['errorCode?.includes("HasActive")', "false"],
    ['t("errors.inactivePlan")', 't("saveError")'],
  ])(
    "rejects actual query/payload/filter/selection/guard/policy drift at %s",
    (from, to) => {
      const changed = source.replace(from, to);
      expect(changed).not.toBe(source);
      expect(deliveryPlanningContracts(changed)).not.toEqual(
        baseline.invariants,
      );
      expect(hash(projectDeliveryPlanningBoundary(changed, path))).not.toBe(
        baseline.originalHash,
      );
    },
  );
  it.each(Object.entries(baseline.protected))(
    "keeps historical owners/backend/dependencies/fixtures frozen: %s",
    (p, expected) =>
      expect(hash(projectDeliveryPlanningBoundary(read(p), p)), p).toBe(
        expected,
      ),
  );
  it.each(["en", "ar"] as const)(
    "permits only37 exact paired factual %s additions and keeps old copy",
    (locale) => {
      const p = `messages/${locale}.json`,
        raw = read(p),
        m = JSON.parse(raw);
      expect(hash(projectDeliveryPlanningBoundary(raw, p))).toBe(
        baseline.messageHashes[locale],
      );
      expect(Object.keys(baseline.additions.en)).toEqual(
        Object.keys(baseline.additions.ar),
      );
      expect(Object.keys(baseline.additions[locale])).toHaveLength(37);
      expect(
        JSON.stringify(withoutDeliveryPlanningAdditions(JSON.parse(raw))),
      ).toBe(
        JSON.stringify(JSON.parse(projectDeliveryPlanningBoundary(raw, p))),
      );
      for (const [key, value] of Object.entries(baseline.additions[locale])) {
        expect(m.deliveryPlanning[key]).toBe(value);
        const bad = JSON.parse(raw);
        bad.deliveryPlanning[key] += "changed";
        expect(() => withoutDeliveryPlanningAdditions(bad)).toThrow();
      }
      const extra = JSON.parse(raw);
      extra.deliveryPlanning.unapproved = "kept";
      expect(
        (
          withoutDeliveryPlanningAdditions(extra).deliveryPlanning as Record<
            string,
            unknown
          >
        ).unapproved,
      ).toBe("kept");
    },
  );
  it.each(Object.entries(baseline.guardSeams))(
    "permits only exact test-only alignment in %s",
    (p, seams) => {
      expect(hash(projectDeliveryPlanningBoundary(read(p), p))).toBe(
        baseline.protected[p as keyof typeof baseline.protected],
      );
      for (const seam of seams)
        expect(
          projectDeliveryPlanningBoundary(
            read(p).replace(seam.approved, seam.approved + "changed"),
            p,
          ),
        ).not.toBe(projectDeliveryPlanningBoundary(read(p), p));
    },
  );
  it("uses opaque scoped roles, DC03 weights, logical RTL/reflow, focus and noncolor selection", () => {
    const css = read("src/features/admin/delivery-planning.module.css"),
      global = read("src/app/globals.css");
    expect(source).not.toMatch(
      /font-black|font-extrabold|disabled:opacity|animate-pulse|bg-primary|text-red-/,
    );
    expect(css).not.toMatch(
      /gradient|blur|box-shadow|animation|opacity|font-weight:\s*(800|900)/,
    );
    for (const m of css.matchAll(/font-weight:\s*(\d+)/g))
      expect([400, 500, 600, 700]).toContain(Number(m[1]));
    for (const m of css.matchAll(/var\((--ui-[a-z-]+)\)/g))
      expect(global, m[1]).toContain(m[1] + ":");
    for (const s of [
      "min-height: 44px",
      "outline-offset: 2px",
      "overflow-wrap: anywhere",
      "border-inline-start",
      "[hidden]",
    ])
      expect(css).toContain(s);
    expect(source).toContain("aria-pressed={currentYearId === item.id}");
    expect(source).toContain("aria-pressed={currentPlanId === item.id}");
  });
});
