import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QualificationRegistryManagement } from "@/features/admin/qualification-registry-management";
import { formatLocalizedDate } from "@/i18n/date-time";
import {
  qualifications,
  rubrics,
  version,
} from "./fixtures/admin-governance-gradebook";
import {
  deferred,
  mount,
  refreshKeys,
} from "./helpers/admin-governance-gradebook-render";
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
const registry = "/qualification-registry",
  rubricPath = registry + "/rubrics",
  create = registry + "/qualifications",
  createVersion = registry + "/versions",
  assign = registry + "/rubrics/rubric/qualification-version/version";
function read(p: string) {
  if (p === registry) return qualifications;
  if (p === rubricPath) return rubrics;
  throw Error(`Unexpected GET ${p}`);
}
beforeEach(() => {
  apiMock
    .mockReset()
    .mockImplementation((p: string, o?: RequestInit) =>
      Promise.resolve(o ? undefined : read(p)),
    );
});
function writes() {
  return apiMock.mock.calls.filter(([, o]) => o?.method);
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function setup(locale: "en" | "ar") {
  const v = mount(locale, <QualificationRegistryManagement />),
    c = v.copy.qualificationRegistry;
  const ready = () =>
    screen.findByText(
      locale === "ar" ? rubrics[0].arabicTitle : rubrics[0].englishTitle,
    );
  const rubric = (index = 0) =>
    within(
      document.querySelectorAll("article")[
        qualifications.length + index
      ] as HTMLElement,
    );
  const fillQualification = () => {
    change(c.code, "  QC  ");
    change(c.arabicName, "  اسم خام  ");
    change(c.englishName, "  Raw name  ");
  };
  const fillVersion = () => {
    change(c.qualification, "qualification");
    change(c.versionCode, "  V2  ");
    change(c.sourceReference, "  Source reference raw  ");
    change(c.effectiveFrom, "2026-10-01");
  };
  return { ...v, c, ready, rubric, fillQualification, fillVersion };
}
describe.each(["en", "ar"] as const)(
  "Registry %s — MOCKED UI-CONTRACT EVIDENCE",
  (locale) => {
    it("keeps registry/rubric GETs/keys, retry=false and exact source/binding policies", async () => {
      const v = setup(locale);
      await v.ready();
      expect(screen.getByRole("heading", { name: v.c.title })).toBeVisible();
      expect(screen.getByText(v.c.description)).toBeVisible();
      expect(screen.getByText(v.c.bindingPolicy)).toBeVisible();
      expect(apiMock).toHaveBeenCalledWith(registry);
      expect(apiMock).toHaveBeenCalledWith(rubricPath);
      expect(
        v.client
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ).toEqual([
        ["qualification-registry"],
        ["qualification-registry", "rubrics"],
      ]);
      expect(
        v.client
          .getQueryCache()
          .getAll()
          .every((q) => q.options.retry === false),
      ).toBe(true);
      expect(writes()).toEqual([]);
    });
    it("keeps direct bilingual names/titles including blanks without fallback, raw codes/source and UTC dates", async () => {
      const v = setup(locale);
      await v.ready();
      const q = screen.getByLabelText(v.c.qualification);
      for (const item of qualifications)
        expect(q.querySelector(`option[value="${item.id}"]`)?.textContent).toBe(
          `${item.code} · ${locale === "ar" ? item.arabicName : item.englishName}`,
        );
      for (let i = 0; i < qualifications.length; i++)
        expect(
          document.querySelectorAll("article")[i].querySelector("h3")
            ?.textContent,
        ).toBe(
          `${qualifications[i].code} · ${locale === "ar" ? qualifications[i].arabicName : qualifications[i].englishName}`,
        );
      expect(v.rubric(1).getByRole("heading").textContent).toBe("");
      expect(v.rubric().getByText(v.c.unbound)).toBeVisible();
      expect(screen.getByText(version.sourceReference).textContent).toBe(
        version.sourceReference,
      );
      expect(
        screen.getByText(version.versionCode, { selector: "strong" }),
      ).toBeVisible();
      const li = screen.getByText(version.sourceReference).closest("li")!;
      expect(li.textContent).toContain(
        formatLocalizedDate(version.effectiveFromUtc, locale, {
          dateStyle: "medium",
          timeZone: "UTC",
        }),
      );
      expect(
        v.rubric().getByRole("option", { name: "RAW-QUAL · Raw V1" }),
      ).toHaveValue("version");
    });
    it.each(["code", "arabicName", "englishName"] as const)(
      "requires two trimmed characters in %s but posts the exact UNTRIMMED form",
      async (invalidField) => {
        const pending = deferred();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o ? pending.promise : Promise.resolve(read(p)),
        );
        const v = setup(locale);
        await v.ready();
        v.fillQualification();
        change(v.c[invalidField], "  x  ");
        const save = () =>
          screen.getByRole("button", { name: v.c.saveQualification });
        expect(save()).toBeDisabled();
        fireEvent.submit(save().closest("form")!);
        expect(writes()).toEqual([]);
        v.fillQualification();
        expect(save()).toBeEnabled();
        for (const label of [v.c.code, v.c.arabicName, v.c.englishName])
          expect(screen.getByLabelText(label)).toBeRequired();
        expect(screen.getByLabelText(v.c.code)).toHaveAttribute(
          "placeholder",
          "BTEC-L3-IT",
        );
        fireEvent.submit(save().closest("form")!);
        await waitFor(() => expect(writes()).toHaveLength(1));
        expect(writes()[0]).toEqual([
          create,
          {
            method: "POST",
            body: JSON.stringify({
              code: "  QC  ",
              arabicName: "  اسم خام  ",
              englishName: "  Raw name  ",
            }),
          },
        ]);
        expect(screen.getByRole("button", { name: v.c.saving })).toBeDisabled();
        await act(async () => pending.resolve(qualifications[0]));
        await waitFor(() =>
          expect(screen.getByLabelText(v.c.code)).toHaveValue(""),
        );
        expect(screen.getByLabelText(v.c.arabicName)).toHaveValue("");
        expect(screen.getByLabelText(v.c.englishName)).toHaveValue("");
        expect(refreshKeys(v.invalidations)).toEqual([
          ["qualification-registry"],
        ]);
      },
    );
    it.each([
      "qualification",
      "versionCode",
      "sourceReference",
      "effectiveFrom",
    ] as const)(
      "retains version validation for %s and optional end date",
      async (field) => {
        const v = setup(locale);
        await v.ready();
        v.fillVersion();
        const save = screen.getByRole("button", { name: v.c.saveVersion });
        expect(save).toBeEnabled();
        change(
          v.c[field],
          field === "versionCode"
            ? " x "
            : field === "sourceReference"
              ? " 123456789 "
              : "",
        );
        expect(save).toBeDisabled();
        fireEvent.submit(save.closest("form")!);
        expect(writes()).toEqual([]);
        expect(screen.getByLabelText(v.c.effectiveFrom)).toBeRequired();
        expect(screen.getByLabelText(v.c.effectiveFrom)).toHaveAttribute(
          "type",
          "date",
        );
        expect(screen.getByLabelText(v.c.effectiveUntil)).not.toBeRequired();
        expect(screen.getByLabelText(v.c.versionCode)).toHaveAttribute(
          "placeholder",
          "2026",
        );
        expect(screen.getByLabelText(v.c.sourceReference)).toHaveAttribute(
          "placeholder",
          v.c.sourcePlaceholder,
        );
      },
    );
    it.each([false, true])(
      "posts exact untrimmed version, UTC-midnight dates and optional null (end=%s); resets every field",
      async (hasEnd) => {
        const pending = deferred();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o ? pending.promise : Promise.resolve(read(p)),
        );
        const v = setup(locale);
        await v.ready();
        v.fillVersion();
        if (hasEnd) change(v.c.effectiveUntil, "2027-02-01");
        fireEvent.submit(
          screen
            .getByRole("button", { name: v.c.saveVersion })
            .closest("form")!,
        );
        await waitFor(() => expect(writes()).toHaveLength(1));
        expect(writes()[0]).toEqual([
          createVersion,
          {
            method: "POST",
            body: JSON.stringify({
              qualificationId: "qualification",
              versionCode: "  V2  ",
              sourceReference: "  Source reference raw  ",
              effectiveFromUtc: "2026-10-01T00:00:00.000Z",
              effectiveUntilUtc: hasEnd ? "2027-02-01T00:00:00.000Z" : null,
            }),
          },
        ]);
        expect(screen.getByRole("button", { name: v.c.saving })).toBeDisabled();
        await act(async () => pending.resolve(version));
        await waitFor(() =>
          expect(screen.getByLabelText(v.c.qualification)).toHaveValue(""),
        );
        for (const label of [
          v.c.versionCode,
          v.c.sourceReference,
          v.c.effectiveFrom,
          v.c.effectiveUntil,
        ])
          expect(screen.getByLabelText(label)).toHaveValue("");
        expect(refreshKeys(v.invalidations)).toEqual([
          ["qualification-registry"],
        ]);
      },
    );
    it("keeps blank/same-version/pending guards, exact bodyless assignment POST, reset and rubric invalidation", async () => {
      const pending = deferred();
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o ? pending.promise : Promise.resolve(read(p)),
      );
      const v = setup(locale);
      await v.ready();
      expect(v.rubric().getByRole("button", { name: v.c.bind })).toBeDisabled();
      expect(
        v.rubric(1).getByRole("button", { name: v.c.bind }),
      ).toBeDisabled();
      fireEvent.change(v.rubric().getByRole("combobox"), {
        target: { value: "version" },
      });
      expect(v.rubric().getByRole("button", { name: v.c.bind })).toBeEnabled();
      fireEvent.click(v.rubric().getByRole("button", { name: v.c.bind }));
      await waitFor(() => expect(writes()).toHaveLength(1));
      expect(writes()[0]).toEqual([assign, { method: "POST" }]);
      expect(v.rubric().getByRole("button", { name: v.c.bind })).toBeDisabled();
      await act(async () => pending.resolve(undefined));
      await waitFor(() =>
        expect(v.rubric().getByRole("combobox")).toHaveValue(""),
      );
      expect(refreshKeys(v.invalidations)).toEqual([
        ["qualification-registry", "rubrics"],
      ]);
    });
    it.each([true, false])(
      "preserves create > version > assignment error precedence and localized non-Error fallback (Error=%s)",
      async (isError) => {
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o
            ? Promise.reject(
                isError ? Error(p) : { message: "RAW_OBJECT_NOT_SHOWN" },
              )
            : Promise.resolve(read(p)),
        );
        const v = setup(locale);
        await v.ready();
        fireEvent.change(v.rubric().getByRole("combobox"), {
          target: { value: "version" },
        });
        fireEvent.click(v.rubric().getByRole("button", { name: v.c.bind }));
        await waitFor(() =>
          expect(screen.getByRole("alert")).toHaveTextContent(
            isError ? assign : v.c.saveError,
          ),
        );
        v.fillVersion();
        fireEvent.submit(
          screen
            .getByRole("button", { name: v.c.saveVersion })
            .closest("form")!,
        );
        await waitFor(() =>
          expect(screen.getByRole("alert")).toHaveTextContent(
            isError ? createVersion : v.c.saveError,
          ),
        );
        v.fillQualification();
        fireEvent.submit(
          screen
            .getByRole("button", { name: v.c.saveQualification })
            .closest("form")!,
        );
        await waitFor(() =>
          expect(screen.getByRole("alert")).toHaveTextContent(
            isError ? create : v.c.saveError,
          ),
        );
        expect(refreshKeys(v.invalidations)).toEqual([]);
      },
    );
    it("keeps the registered-qualifications empty state localized", async () => {
      apiMock.mockImplementation((p: string) =>
        Promise.resolve(p === registry ? [] : []),
      );
      const v = setup(locale);
      expect(await screen.findByText(v.c.empty)).toBeVisible();
    });
  },
);
