import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QualificationRegistryManagement } from "@/features/admin/qualification-registry-management";
import {
  mount,
  refreshKeys,
} from "./helpers/admin-governance-gradebook-render";
import {
  registryQualifications as qualifications,
  registryRubrics as rubrics,
} from "./fixtures/qualification-registry-archetype";
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
const registry = "/qualification-registry",
  rubricPath = registry + "/rubrics";
const read = (p: string) =>
  p === registry
    ? qualifications
    : p === rubricPath
      ? rubrics
      : Promise.reject(Error("Unexpected GET " + p));
const writes = () =>
  apiMock.mock.calls.filter(([, options]) => options?.method);
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  apiMock
    .mockReset()
    .mockImplementation((p: string, o?: RequestInit) =>
      Promise.resolve(o ? undefined : read(p)),
    );
});
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
async function setup(locale: "en" | "ar") {
  const view = mount(locale, <QualificationRegistryManagement />),
    c = view.copy.qualificationRegistry;
  await screen.findByRole("heading", {
    name: locale === "ar" ? rubrics[0].arabicTitle : rubrics[0].englishTitle,
  });
  const rows = () => document.querySelectorAll("article");
  const row = (i: number) =>
    within(rows()[qualifications.length + i] as HTMLElement);
  const fillQualification = () => {
    change(c.code, "  QC  ");
    change(c.arabicName, "  مؤهل خام  ");
    change(c.englishName, "  Raw qualification  ");
  };
  const fillVersion = () => {
    change(c.qualification, "qualification-z");
    change(c.versionCode, "  V2  ");
    change(c.sourceReference, "  Source reference raw  ");
    change(c.effectiveFrom, "2026-10-23");
  };
  const saveQualification = () =>
    screen.getByRole("button", { name: c.saveQualification });
  const saveVersion = () => screen.getByRole("button", { name: c.saveVersion });
  return {
    ...view,
    c,
    row,
    rows,
    fillQualification,
    fillVersion,
    saveQualification,
    saveVersion,
  };
}
describe.each(["en", "ar"] as const)(
  "Slice 3 Qualification Registry %s — MOCKED UI-CONTRACT EVIDENCE",
  (locale) => {
    it("preserves two exact GETs, independent query keys, retry=false and no fan-out", async () => {
      const v = await setup(locale);
      expect(apiMock.mock.calls).toEqual([[registry], [rubricPath]]);
      expect(
        v.client
          .getQueryCache()
          .getAll()
          .map((q) => [q.queryKey, q.options.retry]),
      ).toEqual([
        [["qualification-registry"], false],
        [["qualification-registry", "rubrics"], false],
      ]);
      expect(writes()).toEqual([]);
    });
    it("retains raw qualification/version/rubric order, inactive entries, IDs, localized names and no automatic latest selection", async () => {
      const v = await setup(locale),
        select = screen.getByRole("combobox", { name: v.c.qualification });
      expect(
        Array.from(select.querySelectorAll("option")).map((o) => o.value),
      ).toEqual(["", ...qualifications.map((q) => q.id)]);
      qualifications.forEach((q, i) =>
        expect(v.rows()[i].querySelector("h3")!.textContent).toBe(
          `${q.code} · ${locale === "ar" ? q.arabicName : q.englishName}`,
        ),
      );
      expect(
        Array.from(v.rows()[0].querySelectorAll("strong")).map(
          (el) => el.textContent,
        ),
      ).toEqual(qualifications[0].versions.map((v) => v.versionCode));
      rubrics.forEach((r, i) =>
        expect(v.row(i).getByRole("heading").textContent).toBe(
          locale === "ar" ? r.arabicTitle : r.englishTitle,
        ),
      );
      expect(
        Array.from(
          v.row(1).getByRole("combobox").querySelectorAll("option"),
        ).map((o) => o.value),
      ).toEqual(["", "version-old", "version-new", "version-third"]);
      expect(v.row(1).getByRole("combobox")).toHaveValue("");
      expect(
        screen.getByText(qualifications[0].versions[0].sourceReference)
          .textContent,
      ).toBe(qualifications[0].versions[0].sourceReference);
    });
    it("distinguishes server binding from local drafts, ID-only and partial codes without inventing binding", async () => {
      const v = await setup(locale);
      expect(
        v.row(0).getByText("Z-RAW · RAW-2024", { selector: "p" }),
      ).toBeVisible();
      expect(v.row(0).getByRole("combobox")).toHaveValue("version-old");
      for (const i of [1, 2, 3])
        expect(v.row(i).getByText(v.c.unbound)).toBeVisible();
      fireEvent.change(v.row(1).getByRole("combobox"), {
        target: { value: "version-third" },
      });
      expect(v.row(1).getByText(v.c.unbound)).toBeVisible();
      expect(v.row(0).getByRole("combobox")).toHaveValue("version-old");
      expect(v.row(2).getByRole("combobox")).toHaveValue("version-new");
      expect(writes()).toEqual([]);
    });
    it.each(["code", "arabicName", "englishName"] as const)(
      "retains trimmed two-character eligibility for %s, exact untrimmed POST and independent drafts",
      async (field) => {
        const pending = deferred<unknown>();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o ? pending.promise : Promise.resolve(read(p)),
        );
        const v = await setup(locale);
        v.fillQualification();
        v.fillVersion();
        change(v.c[field], " x ");
        expect(v.saveQualification()).toBeDisabled();
        fireEvent.submit(v.saveQualification().closest("form")!);
        expect(writes()).toEqual([]);
        v.fillQualification();
        await userEvent.click(v.saveQualification());
        await waitFor(() => expect(writes()).toHaveLength(1));
        expect(writes()[0]).toEqual([
          registry + "/qualifications",
          {
            method: "POST",
            body: JSON.stringify({
              code: "  QC  ",
              arabicName: "  مؤهل خام  ",
              englishName: "  Raw qualification  ",
            }),
          },
        ]);
        expect(screen.getByRole("button", { name: v.c.saving })).toBeDisabled();
        await act(async () => pending.resolve({}));
        await waitFor(() =>
          expect(screen.getByLabelText(v.c.code)).toHaveValue(""),
        );
        for (const label of [v.c.code, v.c.arabicName, v.c.englishName])
          expect(screen.getByLabelText(label)).toHaveValue("");
        expect(screen.getByLabelText(v.c.versionCode)).toHaveValue("  V2  ");
        expect(screen.getByLabelText(v.c.sourceReference)).toHaveValue(
          "  Source reference raw  ",
        );
        expect(refreshKeys(v.invalidations)).toEqual([
          ["qualification-registry"],
        ]);
      },
    );
    it.each([
      "qualificationId",
      "versionCode",
      "sourceReference",
      "effectiveFromUtc",
    ] as const)(
      "retains version eligibility for %s without a new academic rule",
      async (field) => {
        const v = await setup(locale);
        v.fillVersion();
        const values = {
          qualificationId: [v.c.qualification, ""],
          versionCode: [v.c.versionCode, " x "],
          sourceReference: [v.c.sourceReference, "123456789"],
          effectiveFromUtc: [v.c.effectiveFrom, ""],
        };
        change(...(values[field] as [string, string]));
        expect(v.saveVersion()).toBeDisabled();
        fireEvent.submit(v.saveVersion().closest("form")!);
        expect(writes()).toEqual([]);
        v.fillVersion();
        change(v.c.versionCode, "xy");
        change(v.c.sourceReference, "1234567890");
        expect(v.saveVersion()).toBeEnabled();
      },
    );
    it.each([true, false])(
      "retains exact version POST, UTC midnight/end-or-null (end=%s), clears only five version fields",
      async (hasEnd) => {
        const pending = deferred<unknown>();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o ? pending.promise : Promise.resolve(read(p)),
        );
        const v = await setup(locale);
        v.fillQualification();
        v.fillVersion();
        if (hasEnd) change(v.c.effectiveUntil, "2027-02-01");
        await userEvent.click(v.saveVersion());
        await waitFor(() => expect(writes()).toHaveLength(1));
        expect(writes()[0]).toEqual([
          registry + "/versions",
          {
            method: "POST",
            body: JSON.stringify({
              qualificationId: "qualification-z",
              versionCode: "  V2  ",
              sourceReference: "  Source reference raw  ",
              effectiveFromUtc: "2026-10-23T00:00:00.000Z",
              effectiveUntilUtc: hasEnd ? "2027-02-01T00:00:00.000Z" : null,
            }),
          },
        ]);
        expect(screen.getByRole("button", { name: v.c.saving })).toBeDisabled();
        await act(async () => pending.resolve({}));
        await waitFor(() =>
          expect(screen.getByLabelText(v.c.versionCode)).toHaveValue(""),
        );
        for (const label of [
          v.c.qualification,
          v.c.versionCode,
          v.c.sourceReference,
          v.c.effectiveFrom,
          v.c.effectiveUntil,
        ])
          expect(screen.getByLabelText(label)).toHaveValue("");
        expect(screen.getByLabelText(v.c.code)).toHaveValue("  QC  ");
        expect(refreshKeys(v.invalidations)).toEqual([
          ["qualification-registry"],
        ]);
      },
    );
    it.each(["qualification", "version"] as const)(
      "retains both mounted drafts on %s mutation failure",
      async (owner) => {
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o
            ? Promise.reject(Error("Synthetic retained draft error"))
            : Promise.resolve(read(p)),
        );
        const v = await setup(locale);
        v.fillQualification();
        v.fillVersion();
        const qualificationInput = screen.getByLabelText(v.c.code),
          versionInput = screen.getByLabelText(v.c.versionCode);
        fireEvent.change(v.row(1).getByRole("combobox"), {
          target: { value: "version-third" },
        });
        await userEvent.click(
          owner === "qualification" ? v.saveQualification() : v.saveVersion(),
        );
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "Synthetic retained draft error",
        );
        expect(screen.getByLabelText(v.c.code)).toBe(qualificationInput);
        expect(qualificationInput).toHaveValue("  QC  ");
        expect(screen.getByLabelText(v.c.versionCode)).toBe(versionInput);
        expect(versionInput).toHaveValue("  V2  ");
        expect(v.row(1).getByRole("combobox")).toHaveValue("version-third");
        expect(refreshKeys(v.invalidations)).toEqual([]);
      },
    );
    it("preserves blank/same/pending binding guards, exact bodyless POST, map reset, form drafts and only rubric invalidation", async () => {
      const pending = deferred<unknown>();
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o ? pending.promise : Promise.resolve(read(p)),
      );
      const v = await setup(locale);
      v.fillQualification();
      v.fillVersion();
      expect(v.row(0).getByRole("button")).toBeDisabled();
      expect(v.row(1).getByRole("button")).toBeDisabled();
      fireEvent.change(v.row(0).getByRole("combobox"), {
        target: { value: "version-new" },
      });
      fireEvent.change(v.row(1).getByRole("combobox"), {
        target: { value: "version-third" },
      });
      expect(v.row(0).getByRole("button")).toBeEnabled();
      await userEvent.click(v.row(0).getByRole("button"));
      await waitFor(() => expect(writes()).toHaveLength(1));
      expect(writes()[0]).toEqual([
        registry + "/rubrics/rubric-z/qualification-version/version-new",
        { method: "POST" },
      ]);
      for (let i = 0; i < rubrics.length; i++)
        expect(v.row(i).getByRole("button")).toBeDisabled();
      await userEvent.click(v.row(1).getByRole("button"));
      expect(writes()).toHaveLength(1);
      await act(async () => pending.resolve(undefined));
      await waitFor(() =>
        expect(v.row(0).getByRole("combobox")).toHaveValue("version-old"),
      );
      expect(v.row(1).getByRole("combobox")).toHaveValue("");
      expect(
        v.row(0).getByText("Z-RAW · RAW-2024", { selector: "p" }),
      ).toBeVisible();
      expect(screen.getByLabelText(v.c.code)).toHaveValue("  QC  ");
      expect(screen.getByLabelText(v.c.versionCode)).toHaveValue("  V2  ");
      expect(refreshKeys(v.invalidations)).toEqual([
        ["qualification-registry", "rubrics"],
      ]);
    });
    it("retains local binding drafts and both forms when binding fails", async () => {
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o
          ? Promise.reject(Error("Synthetic binding failure"))
          : Promise.resolve(read(p)),
      );
      const v = await setup(locale);
      v.fillQualification();
      v.fillVersion();
      fireEvent.change(v.row(1).getByRole("combobox"), {
        target: { value: "version-third" },
      });
      await userEvent.click(v.row(1).getByRole("button"));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Synthetic binding failure",
      );
      expect(v.row(1).getByRole("combobox")).toHaveValue("version-third");
      expect(v.row(1).getByText(v.c.unbound)).toBeVisible();
      expect(screen.getByLabelText(v.c.code)).toHaveValue("  QC  ");
      expect(screen.getByLabelText(v.c.versionCode)).toHaveValue("  V2  ");
      expect(refreshKeys(v.invalidations)).toEqual([]);
    });
    it.each([registry, rubricPath])(
      "keeps independent cold pending/error/empty for %s",
      async (path) => {
        const pending = deferred<unknown>();
        apiMock.mockImplementation((p: string) =>
          p === path ? pending.promise : Promise.resolve(read(p)),
        );
        const v = mount(locale, <QualificationRegistryManagement />),
          c = v.copy.qualificationRegistry;
        expect(await screen.findByRole("status")).toHaveTextContent(
          path === registry ? c.loadingQualifications : c.loadingRubrics,
        );
        expect(screen.queryByText(c.empty)).not.toBeInTheDocument();
        expect(screen.queryByText(c.emptyRubrics)).not.toBeInTheDocument();
        await act(async () =>
          pending.reject(Error("Synthetic cold request failure")),
        );
        expect(await screen.findByRole("alert")).toHaveTextContent(
          path === registry ? c.qualificationError : c.rubricsError,
        );
        expect(screen.queryByText(c.empty)).not.toBeInTheDocument();
        expect(screen.queryByText(c.emptyRubrics)).not.toBeInTheDocument();
        expect(writes()).toEqual([]);
        expect(apiMock.mock.calls.filter(([p]) => p === path)).toHaveLength(1);
      },
    );
    it.each([registry, rubricPath])(
      "retains cached rows, exact identity and usable binding selection after %s refresh error",
      async (path) => {
        const v = await setup(locale);
        fireEvent.change(v.row(1).getByRole("combobox"), {
          target: { value: "version-third" },
        });
        apiMock.mockImplementation((p: string) =>
          p === path
            ? Promise.reject(Error("Synthetic refresh failure"))
            : Promise.resolve(read(p)),
        );
        await act(async () => {
          await v.client.refetchQueries({
            queryKey:
              path === registry
                ? ["qualification-registry"]
                : ["qualification-registry", "rubrics"],
            exact: true,
          });
        });
        expect(await screen.findByRole("alert")).toHaveTextContent(
          path === registry ? v.c.qualificationError : v.c.rubricsError,
        );
        expect(v.rows()).toHaveLength(qualifications.length + rubrics.length);
        expect(
          v.row(0).getByText("Z-RAW · RAW-2024", { selector: "p" }),
        ).toBeVisible();
        expect(v.row(1).getByRole("combobox")).toHaveValue("version-third");
        expect(v.row(1).getByRole("button")).toBeEnabled();
        expect(writes()).toEqual([]);
      },
    );
    it("shows successful registry/rubrics empties distinctly from a qualification with zero versions", async () => {
      const v = await setup(locale);
      expect(
        within(v.rows()[1] as HTMLElement).getByText(v.c.noVersion),
      ).toBeVisible();
      expect(screen.queryByText(v.c.empty)).not.toBeInTheDocument();
      apiMock.mockResolvedValue([]);
      await act(async () => {
        await v.client.refetchQueries();
      });
      expect(await screen.findByText(v.c.empty)).toBeVisible();
      expect(await screen.findByText(v.c.emptyRubrics)).toBeVisible();
      expect(screen.queryByText(v.c.noVersion)).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(writes()).toEqual([]);
    });
    it("keeps forms, selectors and enabled actions keyboard accessible without resetting drafts", async () => {
      const v = await setup(locale),
        user = userEvent.setup();
      const code = screen.getByLabelText(v.c.code);
      code.focus();
      await user.keyboard("AB{Tab}");
      expect(screen.getByLabelText(v.c.arabicName)).toHaveFocus();
      v.fillQualification();
      v.fillVersion();
      const select = v.row(1).getByRole("combobox");
      select.focus();
      await user.selectOptions(select, "version-third");
      await user.tab();
      expect(v.row(1).getByRole("button")).toHaveFocus();
      expect(screen.getByLabelText(v.c.code)).toHaveValue("  QC  ");
      expect(screen.getByLabelText(v.c.versionCode)).toHaveValue("  V2  ");
      expect(writes()).toEqual([]);
    });
  },
);
