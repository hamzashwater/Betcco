import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { AcademicCatalogue } from "@/features/admin/academic-catalogue";

const version = {
  id: "version-1",
  qualificationCode: "Q1",
  versionCode: "2026",
  isActive: true,
};
const catalogue = {
  version,
  units: [
    {
      id: "unit-1",
      code: "U1",
      arabicTitle: "وحدة الاختبار",
      englishTitle: "Test unit",
      isActive: true,
      aims: [
        {
          id: "aim-1",
          code: "A",
          arabicTitle: "هدف الاختبار",
          englishTitle: "Test aim",
          criteria: [
            {
              id: "criterion-1",
              code: "A.P1",
              band: "Pass",
              arabicDescription: "وصف عربي",
              englishDescription: "English description",
            },
          ],
        },
      ],
      definitions: [
        {
          id: "definition-1",
          code: "ASSIGNMENT",
          version: 1,
          arabicTitle: "تقييم",
          englishTitle: "Assessment",
          sourceReference: "test",
          isActive: true,
          aimIds: ["aim-1"],
          criterionIds: ["criterion-1"],
          validation: [],
          scopes: [
            {
              id: "scope-1",
              version: 1,
              gradeArabicName: "صف",
              gradeEnglishName: "Grade",
              specializationArabicName: "تخصص",
              specializationEnglishName: "Specialization",
              rubricArabicTitle: "روبرك",
              rubricEnglishTitle: "Rubric",
              isActive: false,
              validation: ["RubricMismatch"],
            },
          ],
        },
      ],
    },
  ],
};

function renderCatalogue(locale: "en" | "ar" = "en") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? arMessages : enMessages}
      >
        <AcademicCatalogue />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AcademicCatalogue", () => {
  it("shows loading before the versions response", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderCatalogue();
    expect(screen.getByText("Loading qualification versions…")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("shows an API error with retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ detail: "unavailable" }, { status: 503 }),
      ),
    );
    renderCatalogue();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The academic catalogue could not be loaded.",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  it("shows an empty qualification state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([])),
    );
    renderCatalogue();
    expect(
      await screen.findByText("No qualification versions are registered yet."),
    ).toBeVisible();
  });

  it.each(["en", "ar"] as const)(
    "renders hierarchy and readiness in %s",
    async (locale) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input) =>
          Response.json(
            String(input).endsWith("/versions") ? [version] : catalogue,
          ),
        ),
      );
      renderCatalogue(locale);
      expect(
        await screen.findByText(
          locale === "ar" ? /وحدة الاختبار/ : /Test unit/,
        ),
      ).toBeVisible();
      expect(screen.getByText("A.P1")).toBeVisible();
      expect(
        screen.getByText(
          locale === "ar" ? "الروبرك غير متوافق" : "Rubric mismatch",
        ),
      ).toBeVisible();
      expect(
        screen.getByRole("combobox", {
          name: locale === "ar" ? "إصدار المؤهل" : "Qualification version",
        }),
      ).toBeVisible();
    },
  );
});
