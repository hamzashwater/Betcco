import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { DeliveryPlanning } from "@/features/admin/delivery-planning";

const year = {
  id: "year-1",
  code: "AY-FLEX",
  startDate: "2026-08-10",
  endDate: "2027-07-05",
  isActive: true,
};
const term = {
  id: "term-1",
  academicYearId: year.id,
  code: "BLOCK-A",
  startDate: "2026-08-10",
  endDate: "2026-12-20",
  sortOrder: 10,
  isActive: true,
};
const version = {
  id: "version-1",
  qualificationCode: "BTEC-L3-IT",
  versionCode: "2026",
  isActive: true,
};
const summary = {
  id: "plan-1",
  qualificationVersionId: version.id,
  qualificationCode: version.qualificationCode,
  qualificationVersionCode: version.versionCode,
  academicYearId: year.id,
  academicYearCode: year.code,
  isActive: true,
  entryCount: 1,
};
const entry = {
  id: "entry-1",
  unitDefinitionId: "unit-1",
  unitCode: "U1",
  unitArabicTitle: "الوحدة الأولى",
  unitEnglishTitle: "Unit one",
  academicTermId: term.id,
  termCode: term.code,
  sortOrder: 10,
};

function page<T>(items: T[]) {
  return { items, page: 1, pageSize: 100, totalCount: items.length };
}

function renderPlanning(locale: "en" | "ar" = "en") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? arMessages : enMessages}
      >
        <DeliveryPlanning />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DeliveryPlanning", () => {
  it("shows a localized loading state", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderPlanning();
    expect(screen.getByText("Loading delivery planning…")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("shows an error with a keyboard-usable retry action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ detail: "unavailable" }, { status: 503 }),
      ),
    );
    renderPlanning();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Delivery planning could not be loaded.",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  it.each(["en", "ar"] as const)(
    "renders the canonical plan hierarchy in %s",
    async (locale) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input) => {
          const url = String(input);
          if (url.includes("academic-years/year-1/terms"))
            return Response.json(page([term]));
          if (url.includes("qualification-versions/version-1/units"))
            return Response.json(
              page([
                {
                  id: "unit-1",
                  code: "U1",
                  arabicTitle: "الوحدة الأولى",
                  englishTitle: "Unit one",
                  isActive: true,
                },
              ]),
            );
          if (url.endsWith("/plans/plan-1"))
            return Response.json({ plan: summary, entries: [entry] });
          if (url.includes("/plans?")) return Response.json(page([summary]));
          if (url.includes("qualification-versions"))
            return Response.json(page([version]));
          return Response.json(page([year]));
        }),
      );
      renderPlanning(locale);

      expect(
        await screen.findByRole("heading", {
          name:
            locale === "ar"
              ? "تخطيط التسليم الأكاديمي"
              : "Academic delivery planning",
        }),
      ).toBeVisible();
      expect(await screen.findByText("AY-FLEX")).toBeVisible();
      expect(await screen.findByText(/BLOCK-A/)).toBeVisible();
      expect(
        await screen.findByText(locale === "ar" ? /الوحدة الأولى/ : /Unit one/),
      ).toBeVisible();
      expect(
        screen.getByRole("button", {
          name: locale === "ar" ? "نقل U1 إلى أعلى" : "Move U1 up",
        }),
      ).toBeDisabled();
    },
  );

  it("renders empty states without horizontal table dependencies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) =>
        Response.json(
          String(input).includes("qualification-versions")
            ? page([])
            : page([]),
        ),
      ),
    );
    renderPlanning();
    expect(
      await screen.findByText("No academic years have been created."),
    ).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
