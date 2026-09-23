import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CurriculumEditor } from "@/features/teacher/course-editor";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

const course = {
  id: "course-1",
  isBtecFocused: true,
  arabicTitle: "دورة",
  englishTitle: "Course",
  arabicDescription: "وصف",
  englishDescription: "Description",
  status: "Draft",
  price: 0,
  isFree: true,
  hasCover: false,
  outcomes: [],
  modules: [],
} satisfies ComponentProps<typeof CurriculumEditor>["course"];

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

describe("canonical BTEC unit selection", () => {
  it.each(["en", "ar"] as const)(
    "sends only a selected UnitDefinition ID for %s authoring",
    async (locale) => {
      apiMock.mockImplementation(async (path: string) => {
        if (path.endsWith("/academic-units"))
          return [
            {
              id: "unit-1",
              code: "U1",
              arabicTitle: "الوحدة الأولى",
              englishTitle: "Unit one",
              qualificationVersionId: "version-1",
              qualificationCode: "Q",
              versionCode: "2026",
            },
          ];
        if (path === "/teacher/courses/modules") return { id: "delivery-1" };
        throw new Error(`Unexpected API request: ${path}`);
      });
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      render(
        <QueryClientProvider client={client}>
          <NextIntlClientProvider locale={locale} messages={{}}>
            <CurriculumEditor course={course} disabled={false} />
          </NextIntlClientProvider>
        </QueryClientProvider>,
      );

      const selector = await screen.findByRole("combobox", {
        name: locale === "ar" ? "الوحدة الأكاديمية" : "Academic unit",
      });
      expect(
        screen.queryByPlaceholderText("Unit code (e.g. UNIT-1)"),
      ).toBeNull();
      const add = screen.getByRole("button", {
        name: locale === "ar" ? "إضافة الوحدة" : "Add module",
      });
      expect(add).toBeDisabled();
      await screen.findByRole("option", {
        name: locale === "ar" ? /الوحدة الأولى/ : /Unit one/,
      });
      await userEvent.selectOptions(selector, "unit-1");
      await userEvent.click(add);
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/teacher/courses/modules",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining('"unitDefinitionId":"unit-1"'),
          }),
        ),
      );
    },
  );

  it("keeps delivery topic authoring available while academic fields are locked", async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path.endsWith("/academic-units")) return [];
      if (path === "/teacher/courses/topics") return { id: "topic-1" };
      throw new Error(`Unexpected API request: ${path}`);
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const mappedCourse = {
      ...course,
      modules: [
        {
          id: "delivery-1",
          unitDefinitionId: "unit-1",
          arabicTitle: "الوحدة الأولى",
          englishTitle: "Unit one",
          unitCode: "U1",
          publicationStatus: "Published",
          sortOrder: 1,
          learningAims: [
            {
              id: "aim-1",
              code: "A",
              arabicTitle: "هدف",
              englishTitle: "Aim",
              publicationStatus: "Published",
              sortOrder: 1,
              topics: [],
            },
          ],
          criteria: [],
          lessons: [],
        },
      ],
    } satisfies ComponentProps<typeof CurriculumEditor>["course"];
    render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={{}}>
          <CurriculumEditor course={mappedCourse} disabled={false} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(
      screen.queryByRole("textbox", { name: "Learning aim code" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("Arabic topic"), "موضوع");
    await userEvent.type(screen.getByPlaceholderText("English topic"), "Topic");
    await userEvent.click(screen.getByRole("button", { name: "Topic" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/teacher/courses/topics",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"learningAimId":"aim-1"'),
        }),
      ),
    );
  });
});
