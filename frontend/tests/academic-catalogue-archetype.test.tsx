import { AcademicCatalogue } from "@/features/admin/academic-catalogue";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, it, describe, expect, vi } from "vitest";
import {
  mount,
  deferred,
  refreshKeys,
} from "./helpers/admin-governance-gradebook-render";
import { catalogueFixture } from "./fixtures/academic-catalogue-archetype";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("@/features/admin/academic-catalog-management", () => ({
  AcademicCatalogManagement: () => <div data-testid="slice9-child" />,
}));
let data = catalogueFixture();
const read = (p: string) =>
  p === "/admin/academic-catalogue/versions"
    ? data.versions
    : p.endsWith("/version-a")
      ? { version: data.versions[1], units: [] }
      : data.catalogue;
beforeEach(() => {
  data = catalogueFixture();
  apiMock.mockReset();
  apiMock.mockImplementation((p: string, o?: RequestInit) =>
    Promise.resolve(o?.method ? {} : read(p)),
  );
});
for (const locale of ["en", "ar"] as const)
  describe(`Catalogue runtime contracts ${locale}`, () => {
    const t = (locale === "en" ? en : ar).academicCatalogue;
    async function ready() {
      const mounted = mount(locale, <AcademicCatalogue />);
      await screen.findByRole("heading", {
        name: locale === "en" ? /Unit U1/ : /الوحدة U1/,
      });
      return mounted;
    }
    it("retains exact query keys/order and explicit selection; no cross-version unit rendering", async () => {
      const { client } = await ready();
      expect(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ).toEqual([
        ["academic-catalogue", "versions"],
        ["academic-catalogue", ""],
        ["academic-catalogue", "version-z"],
      ]);
      expect(
        client
          .getQueryCache()
          .find({ queryKey: ["academic-catalogue", ""], exact: true })
          ?.isActive(),
      ).toBe(false);
      expect(apiMock).not.toHaveBeenCalledWith(
        "/admin/academic-catalogue/versions/",
      );
      const select = screen.getByRole("combobox");
      expect(
        Array.from(select.querySelectorAll("option")).map((o) => o.value),
      ).toEqual(["version-z", "version-a"]);
      expect(select).toHaveValue("version-z");
      expect(screen.getByTestId("slice9-child")).toBeInTheDocument();
      fireEvent.change(select, { target: { value: "version-a" } });
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/admin/academic-catalogue/versions/version-a",
        ),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole("heading", {
            name: locale === "en" ? /Unit U1/ : /الوحدة U1/,
          }),
        ).not.toBeInTheDocument(),
      );
    });
    it.each(["publish", "activate", "status"] as const)(
      "preserves exact %s transport and invalidation; success follows response",
      async (kind) => {
        const { invalidations } = await ready(),
          pending = deferred();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method ? pending.promise : Promise.resolve(read(p)),
        );
        const name =
          kind === "publish"
            ? t.publish
            : kind === "activate"
              ? t.activate
              : t.residualarchive;
        const button = screen.getByRole("button", { name });
        fireEvent.click(button);
        const path =
          kind === "publish"
            ? "/admin/academic-catalogue/definitions/definition-valid/publish"
            : kind === "activate"
              ? "/admin/academic-catalogue/scopes/scope-valid/activate"
              : "/admin/academic-records/units/official-1/status";
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(
            path,
            kind === "status"
              ? { method: "PUT", body: JSON.stringify({ isActive: false }) }
              : { method: "POST" },
          ),
        );
        expect(button).toBeDisabled();
        expect(screen.queryByText(t.saved)).not.toBeInTheDocument();
        pending.resolve({});
        await waitFor(() =>
          expect(refreshKeys(invalidations)).toEqual([
            ["academic-catalogue", "version-z"],
          ]),
        );
      },
    );
    it("keeps Pearson-only localization, raw payload, independent drafts and target-only success clearing", async () => {
      const { invalidations } = await ready();
      const articles = screen.getAllByRole("article");
      fireEvent.click(articles[1].querySelector("summary")!);
      const inputs = screen.getAllByLabelText(
        t.residualbETCCOArabicDisplayTitle,
      );
      expect(inputs).toHaveLength(2);
      const save = within(articles[0]).getByRole("button", {
        name: t.residualsaveArabicDisplayTitle,
      });
      expect(save).toBeDisabled();
      fireEvent.change(inputs[0], { target: { value: "   " } });
      expect(save).toBeDisabled();
      fireEvent.change(inputs[0], { target: { value: " عنوان محلي خام " } });
      fireEvent.change(inputs[1], { target: { value: "مسودة أخرى" } });
      fireEvent.click(save);
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/admin/academic-records/units/official-1/arabic-localization",
          {
            method: "PUT",
            body: JSON.stringify({ arabicTitle: " عنوان محلي خام " }),
          },
        ),
      );
      await waitFor(() =>
        expect(inputs[0]).toHaveValue(data.catalogue.units[0].arabicTitle),
      );
      expect(inputs[1]).toHaveValue("مسودة أخرى");
      expect(refreshKeys(invalidations)).toEqual([
        ["academic-catalogue", "version-z"],
      ]);
    });
    it("retains failed drafts, factual failure and no fake success", async () => {
      await ready();
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o?.method
          ? Promise.reject(Error("Synthetic error"))
          : Promise.resolve(read(p)),
      );
      const input = within(screen.getAllByRole("article")[0]).getByLabelText(
        t.residualbETCCOArabicDisplayTitle,
      );
      fireEvent.change(input, { target: { value: "مسودة محفوظة" } });
      fireEvent.click(
        within(screen.getAllByRole("article")[0]).getByRole("button", {
          name: t.residualsaveArabicDisplayTitle,
        }),
      );
      await screen.findByRole("alert");
      expect(input).toHaveValue("مسودة محفوظة");
    });
    it("keeps usable cached catalogue on refresh failure and never displays false empty", async () => {
      const { client } = await ready();
      apiMock.mockRejectedValue(Error("Refresh failed"));
      await client.invalidateQueries({
        queryKey: ["academic-catalogue", "version-z"],
      });
      await screen.findByRole("alert");
      expect(
        screen.getByRole("heading", {
          name: locale === "en" ? /Unit U1/ : /الوحدة U1/,
        }),
      ).toBeVisible();
    });
    it("does not render the child or catalogue during a cold versions failure", async () => {
      apiMock.mockRejectedValue(Error("Cold failure"));
      mount(locale, <AcademicCatalogue />);
      await screen.findByRole("alert");
      expect(screen.queryByTestId("slice9-child")).not.toBeInTheDocument();
      expect(apiMock).toHaveBeenCalledTimes(1);
    });
  });
