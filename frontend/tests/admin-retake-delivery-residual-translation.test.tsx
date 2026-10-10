import { RetakeManagement } from "@/features/admin/retake-management";
import { DeliveryPlanning } from "@/features/admin/delivery-planning";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
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
const page = (items: unknown[]) => ({
  items,
  page: 1,
  pageSize: 100,
  totalCount: items.length,
});
const year = {
  id: "y",
  code: "RAW-YEAR",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  isActive: true,
};
const version = {
  id: "v",
  qualificationCode: "RAW-Q",
  versionCode: "RAW-V",
  isActive: true,
  specializationId: "spec",
  specializationArabicName: "تخصص خام",
  specializationEnglishName: "RAW Specialization",
  qualificationArabicName: "مؤهل خام",
  qualificationEnglishName: "RAW Qualification",
};
const grade = {
  id: "g",
  learningTrackId: "track",
  arabicName: "صف خام",
  englishName: "RAW Grade",
  isVisible: true,
};
const created = {
  plan: {
    id: "p",
    qualificationVersionId: "v",
    qualificationCode: "RAW-Q",
    qualificationVersionCode: "RAW-V",
    academicYearId: "y",
    academicYearCode: "RAW-YEAR",
    isActive: true,
    entryCount: 0,
  },
  entries: [],
};
function reads(p: string) {
  if (p.endsWith("/academic-years?pageSize=100")) return page([year]);
  if (p.endsWith("/qualification-versions?pageSize=100"))
    return page([
      version,
      { ...version, id: "inactive", isActive: false },
      { ...version, id: "no-spec", specializationId: null },
    ]);
  if (p === "/admin/academic-taxonomy/grades")
    return [
      grade,
      { ...grade, id: "hidden", isVisible: false },
      { ...grade, id: "other", learningTrackId: "other" },
    ];
  if (p === "/admin/academic-taxonomy/specializations")
    return [{ id: "spec", learningTrackId: "track", isVisible: true }];
  if (p.includes("/plans?")) return page([]);
  if (p.endsWith("/plans/p")) return created;
  if (p.includes("/terms?") || p.includes("/units?")) return page([]);
  throw Error(`Unexpected ${p}`);
}
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((p: string, o?: RequestInit) =>
    Promise.resolve(o?.method ? created : reads(p)),
  );
});
for (const locale of ["ar", "en"] as const) {
  const copy = (locale === "ar" ? ar : en).deliveryPlanning;
  describe(`Legacy Retake and delivery residuals ${locale}`, () => {
    it("renders both unchanged policy paragraphs with no API/write controls", () => {
      mount(locale, <RetakeManagement />);
      for (const c of baseline.scopes.legacyRetakes.cases)
        expect(screen.getByText(c[locale])).toBeVisible();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(apiMock).not.toHaveBeenCalled();
    });
    it("translates grade/placeholder/prefix while preserving raw academic names, filters and direction", async () => {
      mount(locale, <DeliveryPlanning />);
      const versions = await screen.findByLabelText(copy.qualificationVersion);
      expect(versions.querySelectorAll("option")).toHaveLength(2);
      const grades = screen.getByLabelText(copy.residualgrade);
      expect(grades.querySelectorAll("option")).toHaveLength(1);
      expect(grades).toHaveDisplayValue(copy.residualchooseGrade);
      fireEvent.change(versions, { target: { value: "v" } });
      await waitFor(() =>
        expect(grades.querySelectorAll("option")).toHaveLength(2),
      );
      expect(
        screen.getByText(
          copy.residualspecialization +
            (locale === "ar"
              ? version.specializationArabicName
              : version.specializationEnglishName),
        ),
      ).toBeVisible();
      expect(grades.querySelector('option[value="g"]')?.textContent).toBe(
        locale === "ar" ? grade.arabicName : grade.englishName,
      );
      expect(
        screen.getByRole("heading", { name: copy.title }).closest("section"),
      ).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    });
    it("preserves create-plan fields, four invalidations and pending/reset guards", async () => {
      const { invalidations } = mount(locale, <DeliveryPlanning />);
      const versions = await screen.findByLabelText(copy.qualificationVersion);
      const grades = screen.getByLabelText(copy.residualgrade);
      const create = screen.getByRole("button", { name: copy.createPlan });
      expect(create).toBeDisabled();
      fireEvent.change(versions, { target: { value: "v" } });
      await waitFor(() =>
        expect(grades.querySelectorAll("option")).toHaveLength(2),
      );
      expect(create).toBeDisabled();
      fireEvent.change(grades, { target: { value: "g" } });
      expect(create).toBeEnabled();
      const pending = deferred();
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o?.method ? pending.promise : Promise.resolve(reads(p)),
      );
      await userEvent.click(create);
      expect(create).toBeDisabled();
      expect(apiMock).toHaveBeenCalledWith("/admin/delivery-planning/plans", {
        method: "POST",
        body: JSON.stringify({
          qualificationVersionId: "v",
          academicYearId: "y",
          gradeId: "g",
        }),
      });
      pending.resolve(created);
      await waitFor(() =>
        expect(refreshKeys(invalidations)).toEqual([
          ["delivery-planning-years"],
          ["delivery-planning-terms"],
          ["delivery-planning-plans"],
          ["delivery-planning-plan"],
        ]),
      );
      fireEvent.change(versions, { target: { value: "" } });
      expect(grades).toHaveValue("");
      expect(
        screen.getByRole("button", { name: copy.createPlan }),
      ).toBeDisabled();
    });
  });
}
