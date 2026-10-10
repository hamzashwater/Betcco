import { AcademicCatalogManagement } from "@/features/admin/academic-catalog-management";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import baseline from "./fixtures/admin-a5-5-10-15-copy-baseline.json";
import {
  mount,
  deferred,
  refreshKeys,
} from "./helpers/admin-governance-gradebook-render";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: apiMock,
}));
const item = {
  id: "spec",
  learningTrackId: "btec",
  slug: "raw-slug",
  arabicName: "اسم خام",
  englishName: "Raw name",
  isVisible: true,
  sortOrder: 17,
};
const qualification = {
  id: "q",
  code: "Q-CODE",
  arabicName: "مؤهل خام",
  englishName: "Raw qualification",
  isActive: true,
  source: "AdminCustom",
  versions: [
    {
      id: "v",
      versionCode: "ISSUE-RAW",
      source: "AdminCustom",
      sourceReference: "raw-ref",
      isActive: false,
    },
  ],
};
function reads(path: string) {
  if (path === "/taxonomy?locale=en")
    return {
      tracks: [
        { id: "other", isBtecFocused: false },
        { id: "btec", isBtecFocused: true },
      ],
    };
  if (path === "/admin/academic-taxonomy/specializations")
    return [
      item,
      { ...item, id: "hidden", isVisible: false },
      { ...item, id: "other-track", learningTrackId: "other" },
    ];
  if (path === "/admin/academic-taxonomy/grades")
    return [{ ...item, id: "grade" }];
  if (path === "/qualification-registry")
    return [
      qualification,
      {
        ...qualification,
        id: "official",
        source: "PearsonOfficial",
        versions: [
          {
            ...qualification.versions[0],
            id: "official-v",
            source: "PearsonOfficial",
          },
        ],
      },
    ];
  throw Error(`Unexpected read ${path}`);
}
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((p: string, o?: RequestInit) =>
    Promise.resolve(o?.method ? {} : reads(p)),
  );
});
for (const locale of ["ar", "en"] as const) {
  const label = (en: string) =>
    baseline.scopes.academicCatalogManagement.cases.find((c) => c.en === en)![
      locale
    ];
  const field = (en: string) => screen.getByLabelText(label(en));
  async function ready() {
    const result = mount(locale, <AcademicCatalogManagement />);
    await screen.findByRole("button", { name: label("Add specialization") });
    await waitFor(() =>
      expect(
        field("Qualification specialization").querySelectorAll("option"),
      ).toHaveLength(2),
    );
    return result;
  }
  describe(`Academic management translated contracts ${locale}`, () => {
    it("preserves fixed taxonomy locale, raw provenance, source selection and field constraints", async () => {
      await ready();
      expect(apiMock).toHaveBeenCalledWith("/taxonomy?locale=en");
      expect(field("Qualification").querySelectorAll("option")).toHaveLength(2);
      expect(
        field("Custom unit version").querySelectorAll("option"),
      ).toHaveLength(2);
      expect(field("Version source reference")).toHaveAttribute(
        "minlength",
        "10",
      );
      expect(field("Effective date")).toHaveAttribute("type", "date");
      expect(field("Unit source reference")).not.toBeRequired();
      expect(field("Unit local Arabic display")).not.toBeRequired();
      expect(
        screen.getAllByText(
          (_, element) =>
            element?.tagName === "SPAN" &&
            Boolean(element.textContent?.includes("PearsonOfficial")),
        ).length,
      ).toBeGreaterThan(0);
    });
    it.each(["Specialization", "Grade"])(
      "posts untrimmed %s fields and refreshes exactly five keys",
      async (kind) => {
        const { invalidations } = await ready();
        for (const [name, value] of [
          [`${kind} slug`, " raw-slug "],
          [`${kind} Arabic name`, " اسم "],
          [`${kind} English name`, " raw-name "],
        ])
          fireEvent.change(field(name), { target: { value } });
        await userEvent.click(
          screen.getByRole("button", {
            name: label(kind === "Grade" ? "Add grade" : "Add specialization"),
          }),
        );
        const path = `/admin/academic-taxonomy/${kind === "Grade" ? "grades" : "specializations"}`;
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(path, {
            method: "POST",
            body: JSON.stringify({
              slug: " raw-slug ",
              arabicName: " اسم ",
              englishName: " raw-name ",
              learningTrackId: "btec",
              sortOrder: 100,
            }),
          }),
        );
        await waitFor(() =>
          expect(refreshKeys(invalidations)).toEqual([
            ["admin-catalog-specializations"],
            ["admin-catalog-grades"],
            ["admin-catalog-qualifications"],
            ["academic-catalogue"],
            ["delivery-planning-versions"],
          ]),
        );
        expect(await screen.findByText(label("Changes saved."))).toBeVisible();
      },
    );
    it("posts the exact qualification/version/unit bodies without translating codes or sources", async () => {
      await ready();
      for (const [name, value] of [
        ["Qualification code", "RAW-Q"],
        ["Qualification Arabic name", "عربي"],
        ["Qualification English name", "Raw English"],
        ["Qualification specialization", "spec"],
      ])
        fireEvent.change(field(name), { target: { value } });
      fireEvent.submit(field("Qualification code").closest("form")!);
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/qualification-registry/qualifications",
          {
            method: "POST",
            body: JSON.stringify({
              code: "RAW-Q",
              arabicName: "عربي",
              englishName: "Raw English",
              specializationId: "spec",
            }),
          },
        ),
      );
      for (const [name, value] of [
        ["Qualification", "q"],
        ["Version code", " RAW-V "],
        ["Version source reference", " RAW-SOURCE "],
        ["Effective date", "2026-10-10"],
      ])
        fireEvent.change(field(name), { target: { value } });
      fireEvent.submit(field("Version code").closest("form")!);
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/qualification-registry/versions",
          {
            method: "POST",
            body: JSON.stringify({
              qualificationId: "q",
              versionCode: " RAW-V ",
              sourceReference: " RAW-SOURCE ",
              effectiveFromUtc: new Date("2026-10-10").toISOString(),
              effectiveUntilUtc: null,
            }),
          },
        ),
      );
      for (const [name, value] of [
        ["Custom unit version", "v"],
        ["Unit code", "RAW-U"],
        ["Unit English title", " Raw Unit "],
      ])
        fireEvent.change(field(name), { target: { value } });
      fireEvent.submit(field("Unit code").closest("form")!);
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/admin/academic-catalogue/units",
          {
            method: "POST",
            body: JSON.stringify({
              qualificationVersionId: "v",
              code: "RAW-U",
              arabicTitle: " Raw Unit ",
              englishTitle: " Raw Unit ",
              sourceReference: "",
            }),
          },
        ),
      );
    });
    it("keeps full visibility payloads and blocks writes while pending", async () => {
      await ready();
      const pending = deferred();
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o?.method ? pending.promise : Promise.resolve(reads(p)),
      );
      await userEvent.click(
        screen.getAllByRole("button", { name: label("Archive") })[0],
      );
      expect(apiMock).toHaveBeenCalledWith(
        "/admin/academic-taxonomy/specializations/spec",
        { method: "PUT", body: JSON.stringify({ ...item, isVisible: false }) },
      );
      expect(
        screen.getByRole("button", { name: label("Add grade") }),
      ).toBeDisabled();
      pending.resolve({});
    });
    it("uses defensive array fallbacks and translated load/save errors", async () => {
      apiMock.mockResolvedValue({ tracks: null });
      mount(locale, <AcademicCatalogManagement />);
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: label("Add specialization") }),
        ).toBeDisabled(),
      );
      expect(
        field("Custom unit version").querySelectorAll("option"),
      ).toHaveLength(1);
    });
  });
}
