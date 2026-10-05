import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  type MutationFunction,
} from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CourseEditor,
  CurriculumEditor,
} from "@/features/teacher/course-editor";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";

const { apiMock, replace, mutations } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  replace: vi.fn(),
  mutations: [] as MutationFunction<unknown, unknown>[],
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
// Observe real mutation options so guards can be tested even when the UI prevents submission.
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: (...args: Parameters<typeof actual.useMutation>) => {
      if (args[0].mutationFn) mutations.push(args[0].mutationFn);
      return actual.useMutation(...args);
    },
  };
});

const course = {
  id: "course-1",
  isBtecFocused: false,
  arabicTitle: "عنوان من الخادم",
  englishTitle: "Server course title",
  arabicDescription: "وصف من الخادم",
  englishDescription: "Server description",
  status: "Draft",
  price: 12.125,
  isFree: false,
  hasCover: false,
  outcomes: [],
  modules: [
    {
      id: "unit-1",
      arabicTitle: "وحدة الخادم",
      englishTitle: "Server unit",
      publicationStatus: "Published",
      sortOrder: 1,
      learningAims: [],
      criteria: [],
      lessons: [],
    },
  ],
} satisfies ComponentProps<typeof CurriculumEditor>["course"];
const taxonomy = {
  tracks: [
    { id: "btec", name: "Server BTEC", isBtecFocused: true },
    { id: "other", name: "Server other", isBtecFocused: false },
  ],
  grades: [
    { id: "other-grade", learningTrackId: "other", name: "Server grade" },
  ],
  specializations: [
    {
      id: "other-spec",
      learningTrackId: "other",
      name: "Server specialization",
    },
  ],
  subjects: [
    {
      id: "subject-1",
      specializationId: "spec-1",
      name: "Raw subject",
      isPendingReview: true,
    },
  ],
};
const plan = {
  id: "plan-1",
  learningTrackId: "btec",
  gradeId: "grade-1",
  gradeArabicName: "صف الخادم",
  gradeEnglishName: "Server plan grade",
  specializationId: "spec-1",
  specializationArabicName: "تخصص الخادم",
  specializationEnglishName: "Server plan specialization",
  academicYearId: "year-1",
  academicYearCode: "2026/27",
  qualificationCode: "RAW-QUAL",
  qualificationArabicName: "مؤهل الخادم",
  qualificationEnglishName: "Server qualification",
  versionCode: "ISSUE-4",
};
const access = {
  items: [
    {
      type: "Unit",
      id: "unit-1",
      arabicTitle: "وحدة الخادم",
      englishTitle: "Server unit",
    },
    {
      type: "Lesson",
      id: "lesson-1",
      arabicTitle: "درس الخادم",
      englishTitle: "Server lesson",
    },
    {
      type: "Assignment",
      id: "assignment-1",
      arabicTitle: "مهمة الخادم",
      englishTitle: "Server assignment",
    },
  ],
  prerequisiteCourses: [
    {
      type: "Course",
      id: "prior-course",
      arabicTitle: "دورة سابقة",
      englishTitle: "Prior course",
    },
  ],
  rules: [],
  prerequisites: [
    {
      id: "prerequisite-1",
      targetType: "Unit",
      targetId: "unit-1",
      requiredContentType: "Lesson",
      requiredContentId: "lesson-1",
    },
  ],
};
let announcements = [
  {
    id: "announcement-1",
    arabicTitle: "إعلان الخادم",
    englishTitle: "Raw announcement",
    audience: "SelectedStudents",
    selectedStudentIds: ["student-1"],
    isPublished: false,
  },
];
const clients: QueryClient[] = [];
beforeEach(() => {
  apiMock.mockReset();
  replace.mockReset();
  mutations.length = 0;
  announcements = [
    {
      id: "announcement-1",
      arabicTitle: "إعلان الخادم",
      englishTitle: "Raw announcement",
      audience: "SelectedStudents",
      selectedStudentIds: ["student-1"],
      isPublished: false,
    },
  ];
  apiMock.mockImplementation(async (path: string, options?: RequestInit) => {
    if (options?.method) {
      if (path === "/teacher/courses") return { id: course.id };
      if (path === "/teacher/taxonomy/subjects")
        return { id: "created-subject" };
      return {};
    }
    if (path.startsWith("/taxonomy?")) return taxonomy;
    if (path.endsWith("available-delivery-plans"))
      return [
        plan,
        {
          ...plan,
          id: "unrelated-plan",
          learningTrackId: "other",
          specializationId: "unrelated-spec",
        },
      ];
    if (path === `/teacher/courses/${course.id}`) return course;
    if (path.endsWith("/learning-access")) return access;
    if (path.endsWith("/announcements/students"))
      return [{ id: "student-1", displayName: "Raw Student اسم" }];
    if (path.endsWith("/announcements")) return announcements;
    if (path.startsWith("/gradebook/"))
      return { students: [], totalStudents: 0, page: 1, pageSize: 25 };
    return [];
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
});

function mount(locale: "ar" | "en", create = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const messages = locale === "ar" ? arMessages : enMessages;
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <CourseEditor {...(create ? {} : { courseId: course.id })} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { client, m: messages.teacherWorkspace };
}
function change(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
}
function area(id: string) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing workspace ${id}`);
  return within(element);
}
function writes(path: string, method: string) {
  return apiMock.mock.calls.filter(
    ([url, options]) => url === path && options?.method === method,
  );
}
function payload(path: string, method: string) {
  return JSON.parse(writes(path, method).at(-1)![1].body);
}
async function selectPlan(m: typeof enMessages.teacherWorkspace) {
  await waitFor(() =>
    expect(
      screen
        .getByLabelText(m.courseSetup.specialization)
        .querySelector('option[value="spec-1"]'),
    ).not.toBeNull(),
  );
  change(await screen.findByLabelText(m.courseSetup.specialization), "spec-1");
  change(screen.getByLabelText(m.courseSetup.grade), "grade-1");
  change(screen.getByLabelText(m.courseSetup.academicYear), "year-1");
  change(screen.getByLabelText(m.courseSetup.programmePlan), "plan-1");
}
async function existing(locale: "ar" | "en") {
  const mounted = mount(locale);
  await screen.findByRole("heading", {
    name: locale === "ar" ? course.arabicTitle : course.englishTitle,
  });
  await waitFor(() =>
    expect(
      area("access").getByLabelText(mounted.m.learningAccess.target),
    ).toBeInTheDocument(),
  );
  return mounted;
}

describe.each(["en", "ar"] as const)(
  "teacher course setup and access (%s)",
  (locale) => {
    it("creates a BTEC free draft with exact fallback, plan, subject and routing contracts", async () => {
      const { client, m } = mount(locale, true);
      expect(
        screen.getByRole("heading", { name: m.courseSetup.title }),
      ).toBeVisible();
      const submit = screen.getByRole("button", { name: m.courseSetup.submit });
      expect(submit).toBeDisabled();
      await selectPlan(m);
      expect(
        screen.getByRole("option", {
          name:
            locale === "ar"
              ? plan.specializationArabicName
              : plan.specializationEnglishName,
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "unrelated-spec" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("option", {
          name: `${locale === "ar" ? plan.qualificationArabicName : plan.qualificationEnglishName} · ISSUE-4`,
        }),
      ).toBeInTheDocument();
      expect(client.getQueryData(["taxonomy", locale])).toEqual(taxonomy);
      expect(
        client.getQueryData(["teacher-available-delivery-plans"]),
      ).toBeDefined();
      expect(apiMock).toHaveBeenCalledWith(`/taxonomy?locale=${locale}`);
      expect(apiMock).toHaveBeenCalledWith(
        "/teacher/courses/available-delivery-plans",
      );
      change(screen.getByLabelText(m.courseDetails.arabicTitle), "  عنوان  ");
      change(
        screen.getByLabelText(m.courseDetails.arabicDescription),
        "  وصف  ",
      );
      expect(
        screen.getByLabelText(m.courseSetup.englishTitleOptional),
      ).not.toBeRequired();
      expect(
        screen.getByLabelText(m.courseSetup.englishDescriptionOptional),
      ).not.toBeRequired();
      const price = screen.getByLabelText(m.courseSetup.price);
      expect(price).toHaveAttribute("min", "0");
      expect(price).toBeRequired();
      fireEvent.click(screen.getByLabelText(m.courseSetup.free));
      expect(price).toBeDisabled();
      expect(price).not.toBeRequired();
      fireEvent.click(screen.getByText(m.courseSetup.classification));
      change(screen.getByLabelText(m.courseSetup.subject), "subject-1");
      expect(
        screen.getByRole("option", {
          name: `Raw subject ${m.subjects.pendingReview}`,
        }),
      ).toBeInTheDocument();
      fireEvent.click(submit);
      await waitFor(() =>
        expect(replace).toHaveBeenCalledWith(
          `/${locale}/teacher/courses/course-1`,
        ),
      );
      expect(payload("/teacher/courses", "POST")).toEqual({
        arabicTitle: "  عنوان  ",
        englishTitle: "عنوان",
        arabicDescription: "  وصف  ",
        englishDescription: "وصف",
        learningTrackId: "btec",
        gradeId: "grade-1",
        specializationId: "spec-1",
        subjectId: "subject-1",
        price: 0,
        isFree: true,
        deliveryPlanId: "plan-1",
      });
    });

    it("creates a paid non-BTEC draft and preserves dependent selector resets", async () => {
      const { m } = mount(locale, true);
      await selectPlan(m);
      change(screen.getByLabelText(m.courseSetup.specialization), "");
      expect(screen.getByLabelText(m.courseSetup.grade)).toHaveValue("");
      expect(screen.getByLabelText(m.courseSetup.academicYear)).toHaveValue("");
      expect(screen.getByLabelText(m.courseSetup.programmePlan)).toHaveValue(
        "",
      );
      fireEvent.click(screen.getByText(m.courseSetup.classification));
      change(screen.getByLabelText(m.courseSetup.learningTrack), "other");
      change(screen.getByLabelText(m.courseSetup.grade), "other-grade");
      change(screen.getByLabelText(m.courseSetup.specialization), "other-spec");
      change(screen.getByLabelText(m.courseDetails.arabicTitle), "ع");
      change(screen.getByLabelText(m.courseDetails.arabicDescription), "و");
      change(
        screen.getByLabelText(m.courseSetup.englishTitleOptional),
        " English ",
      );
      change(
        screen.getByLabelText(m.courseSetup.englishDescriptionOptional),
        " Description ",
      );
      change(screen.getByLabelText(m.courseSetup.price), "7.125");
      fireEvent.click(
        screen.getByRole("button", { name: m.courseSetup.submit }),
      );
      await waitFor(() =>
        expect(writes("/teacher/courses", "POST")).toHaveLength(1),
      );
      expect(payload("/teacher/courses", "POST")).toEqual({
        arabicTitle: "ع",
        englishTitle: "English",
        arabicDescription: "و",
        englishDescription: "Description",
        learningTrackId: "other",
        gradeId: "other-grade",
        specializationId: "other-spec",
        subjectId: null,
        deliveryPlanId: null,
        price: 7.125,
        isFree: false,
      });
    });

    it("validates, creates and resets a linked subject, selecting its raw ID and invalidating taxonomy", async () => {
      const { client, m } = mount(locale, true);
      await screen.findByLabelText(m.courseSetup.specialization);
      fireEvent.click(screen.getByText(m.courseSetup.classification));
      const open = screen.getByRole("button", { name: m.subjects.open });
      expect(open).toBeDisabled();
      await selectPlan(m);
      expect(open).toBeEnabled();
      fireEvent.click(open);
      const arabic = screen.getByLabelText(m.subjects.arabicName),
        english = screen.getByLabelText(m.subjects.englishName);
      expect(arabic).toHaveAttribute("maxlength", "120");
      expect(english).toHaveAttribute("maxlength", "120");
      const add = screen.getByRole("button", {
        name: m.subjects.add,
      });
      expect(add).toBeDisabled();
      change(arabic, "  مادة  ");
      change(english, " ");
      expect(add).toBeDisabled();
      change(english, " Subject ");
      const invalidate = vi.spyOn(client, "invalidateQueries");
      // A refreshed server catalog contains the new subject selected by onCreated.
      apiMock.mockImplementationOnce(async () => ({ id: "created-subject" }));
      fireEvent.click(add);
      await waitFor(() =>
        expect(
          screen.queryByLabelText(m.subjects.arabicName),
        ).not.toBeInTheDocument(),
      );
      expect(payload("/teacher/taxonomy/subjects", "POST")).toEqual({
        specializationId: "spec-1",
        arabicName: "  مادة  ",
        englishName: " Subject ",
      });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["taxonomy"] });
      // HTML select has no option until the catalog includes the new subject; its state is proved by the create payload.
      change(screen.getByLabelText(m.courseDetails.arabicTitle), "ع");
      change(screen.getByLabelText(m.courseDetails.arabicDescription), "و");
      fireEvent.click(
        screen.getByRole("button", { name: m.courseSetup.submit }),
      );
      await waitFor(() =>
        expect(writes("/teacher/courses", "POST")).toHaveLength(1),
      );
      expect(payload("/teacher/courses", "POST").subjectId).toBe(
        "created-subject",
      );
      fireEvent.click(open);
      expect(screen.getByLabelText(m.subjects.arabicName)).toHaveValue("");
      expect(screen.getByLabelText(m.subjects.englishName)).toHaveValue("");
    });

    it("keeps existing editor queries, sections, paid/free detail payloads and refresh", async () => {
      const { client, m } = await existing(locale);
      expect(client.getQueryData(["teacher-course", course.id])).toEqual(
        course,
      );
      expect(apiMock).toHaveBeenCalledWith(`/teacher/courses/${course.id}`);
      expect(screen.getByText(m.courseEditor.editable)).toBeVisible();
      [
        "details",
        "access",
        "announcements",
        "curriculum",
        "assignments",
        "review",
      ].forEach((id) =>
        expect(document.getElementById(id)).toBeInTheDocument(),
      );
      const detail = area("details"),
        price = detail.getByLabelText(m.courseDetails.price);
      expect(price).toHaveAttribute("min", "0");
      change(price, "9.875");
      const invalidate = vi.spyOn(client, "invalidateQueries");
      fireEvent.click(
        detail.getByRole("button", { name: m.courseDetails.save }),
      );
      await waitFor(() =>
        expect(writes(`/teacher/courses/${course.id}`, "PUT")).toHaveLength(1),
      );
      expect(payload(`/teacher/courses/${course.id}`, "PUT")).toEqual({
        arabicTitle: course.arabicTitle,
        englishTitle: course.englishTitle,
        arabicDescription: course.arabicDescription,
        englishDescription: course.englishDescription,
        isFree: false,
        price: 9.875,
      });
      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({
          queryKey: ["teacher-course", course.id],
        }),
      );
      expect(await detail.findByRole("status")).toHaveTextContent(
        m.courseDetails.saved,
      );
      fireEvent.click(detail.getByLabelText(m.courseDetails.free));
      expect(price).toBeDisabled();
      fireEvent.click(
        detail.getByRole("button", { name: m.courseDetails.save }),
      );
      await waitFor(() =>
        expect(writes(`/teacher/courses/${course.id}`, "PUT")).toHaveLength(2),
      );
      expect(payload(`/teacher/courses/${course.id}`, "PUT")).toEqual({
        arabicTitle: course.arabicTitle,
        englishTitle: course.englishTitle,
        arabicDescription: course.arabicDescription,
        englishDescription: course.englishDescription,
        isFree: true,
        price: 0,
      });
    });

    it.each(["Course", "Unit", "SelectedStudents"])(
      "preserves %s announcement creation, limits, conditional student query and reset",
      async (audience) => {
        const { client, m } = await existing(locale);
        const a = area("announcements"),
          path = `/teacher/courses/${course.id}/announcements`;
        expect(apiMock).toHaveBeenCalledWith(path);
        expect(
          client.getQueryData(["teacher-course-announcements", course.id]),
        ).toEqual(announcements);
        expect(apiMock).not.toHaveBeenCalledWith(`${path}/students`);
        expect(
          a.getByText(locale === "ar" ? "إعلان الخادم" : "Raw announcement"),
        ).toBeVisible();
        for (const label of [
          m.courseDetails.arabicTitle,
          m.courseDetails.englishTitle,
        ]) {
          const input = a.getByPlaceholderText(label);
          expect(input).toBeRequired();
          expect(input).toHaveAttribute("maxlength", "180");
          change(input, label);
        }
        for (const label of [
          m.announcements.arabicBody,
          m.announcements.englishBody,
        ]) {
          const input = a.getByPlaceholderText(label);
          expect(input).toBeRequired();
          expect(input).toHaveAttribute("maxlength", "6000");
          change(input, label);
        }
        change(a.getByLabelText(m.announcements.audience), audience);
        if (audience === "Unit") {
          expect(a.getByLabelText(m.announcements.unit)).toBeRequired();
          change(a.getByLabelText(m.announcements.unit), "unit-1");
          expect(
            a.getByRole("option", {
              name: locale === "ar" ? "وحدة الخادم" : "Server unit",
            }),
          ).toBeInTheDocument();
        }
        if (audience === "SelectedStudents") {
          fireEvent.click(await a.findByLabelText("Raw Student اسم"));
          expect(apiMock).toHaveBeenCalledWith(`${path}/students`);
          expect(
            client.getQueryData(["teacher-course-students", course.id]),
          ).toEqual([{ id: "student-1", displayName: "Raw Student اسم" }]);
        } else expect(apiMock).not.toHaveBeenCalledWith(`${path}/students`);
        fireEvent.click(a.getByLabelText(m.announcements.publishNow));
        const invalidate = vi.spyOn(client, "invalidateQueries");
        fireEvent.click(
          a.getByRole("button", { name: m.announcements.saveDraft }),
        );
        await waitFor(() => expect(writes(path, "POST")).toHaveLength(1));
        expect(payload(path, "POST")).toEqual({
          arabicTitle: m.courseDetails.arabicTitle,
          englishTitle: m.courseDetails.englishTitle,
          arabicBody: m.announcements.arabicBody,
          englishBody: m.announcements.englishBody,
          audience,
          courseModuleId: audience === "Unit" ? "unit-1" : null,
          selectedStudentIds:
            audience === "SelectedStudents" ? ["student-1"] : [],
          publish: false,
        });
        await waitFor(() =>
          expect(
            a.getByPlaceholderText(m.courseDetails.arabicTitle),
          ).toHaveValue(""),
        );
        [
          m.courseDetails.englishTitle,
          m.announcements.arabicBody,
          m.announcements.englishBody,
        ].forEach((label) =>
          expect(a.getByPlaceholderText(label)).toHaveValue(""),
        );
        expect(a.getByLabelText(m.announcements.audience)).toHaveValue(
          "Course",
        );
        expect(a.getByLabelText(m.announcements.publishNow)).toBeChecked();
        expect(invalidate).toHaveBeenCalledWith({
          queryKey: ["teacher-course-announcements", course.id],
        });
        change(a.getByLabelText(m.announcements.audience), "SelectedStudents");
        expect(await a.findByLabelText("Raw Student اسم")).not.toBeChecked();
        change(a.getByLabelText(m.announcements.audience), "Unit");
        expect(a.getByLabelText(m.announcements.unit)).toHaveValue("");
      },
    );

    it("publishes announcements without a body and deletes with the same refresh", async () => {
      const { client, m } = await existing(locale),
        a = area("announcements"),
        path = `/teacher/courses/${course.id}/announcements`;
      const invalidate = vi.spyOn(client, "invalidateQueries");
      fireEvent.click(
        await a.findByRole("button", {
          name: m.announcements.publish,
        }),
      );
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(`${path}/announcement-1/publish`, {
          method: "POST",
        }),
      );
      fireEvent.click(a.getByRole("button", { name: m.announcements.delete }));
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(`${path}/announcement-1`, {
          method: "DELETE",
        }),
      );
      expect(
        invalidate.mock.calls.filter(
          ([options]) =>
            JSON.stringify(options?.queryKey) ===
            JSON.stringify(["teacher-course-announcements", course.id]),
        ),
      ).toHaveLength(2);
    });

    it("preserves all release modes, ISO/Number conversions, numeric limits and raw typed content", async () => {
      const { client, m } = await existing(locale),
        a = area("access"),
        path = `/teacher/courses/${course.id}/learning-access`;
      expect(apiMock).toHaveBeenCalledWith(path);
      expect(
        client.getQueryData(["course-learning-access", course.id]),
      ).toEqual(access);
      expect(
        a.queryByRole("button", { name: m.learningAccess.saveRelease }),
      ).not.toBeInTheDocument();
      expect(
        a.getByRole("option", {
          name: `${m.learningAccess.contentType.unit} · ${locale === "ar" ? "وحدة الخادم" : "Server unit"}`,
        }),
      ).toHaveValue("Unit:unit-1");
      change(a.getByLabelText(m.learningAccess.target), "Unit:unit-1");
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const expected = {
        targetType: "Unit",
        targetId: "unit-1",
        releaseMode: "Immediately",
        specificDateUtc: null,
        daysAfterEnrollment: null,
        previousContentType: null,
        previousContentId: null,
      };
      const save = () =>
        fireEvent.click(
          a.getByRole("button", { name: m.learningAccess.saveRelease }),
        );
      save();
      await waitFor(() =>
        expect(writes(`${path}/release`, "PUT")).toHaveLength(1),
      );
      expect(payload(`${path}/release`, "PUT")).toEqual(expected);
      change(a.getByLabelText(m.learningAccess.releaseMethod), "SpecificDate");
      expect(
        a.getByRole("button", { name: m.learningAccess.saveRelease }),
      ).toBeDisabled();
      change(
        a.getByLabelText(m.learningAccess.releaseDate),
        "2026-10-06T12:30",
      );
      save();
      await waitFor(() =>
        expect(writes(`${path}/release`, "PUT")).toHaveLength(2),
      );
      expect(payload(`${path}/release`, "PUT")).toEqual({
        ...expected,
        releaseMode: "SpecificDate",
        specificDateUtc: new Date("2026-10-06T12:30").toISOString(),
      });
      change(
        a.getByLabelText(m.learningAccess.releaseMethod),
        "DaysAfterEnrollment",
      );
      const days = a.getByLabelText(m.learningAccess.numberOfDays);
      expect(days).toHaveAttribute("min", "0");
      expect(days).toHaveAttribute("max", "3650");
      change(days, "17");
      save();
      await waitFor(() =>
        expect(writes(`${path}/release`, "PUT")).toHaveLength(3),
      );
      expect(payload(`${path}/release`, "PUT")).toEqual({
        ...expected,
        releaseMode: "DaysAfterEnrollment",
        daysAfterEnrollment: 17,
      });
      change(
        a.getByLabelText(m.learningAccess.releaseMethod),
        "AfterPreviousContentCompletion",
      );
      expect(
        a.getByRole("button", { name: m.learningAccess.saveRelease }),
      ).toBeDisabled();
      change(
        a.getByLabelText(m.learningAccess.previousContent),
        "Course:prior-course",
      );
      save();
      await waitFor(() =>
        expect(writes(`${path}/release`, "PUT")).toHaveLength(4),
      );
      expect(payload(`${path}/release`, "PUT")).toEqual({
        ...expected,
        releaseMode: "AfterPreviousContentCompletion",
        previousContentType: "Course",
        previousContentId: "prior-course",
      });
      await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["course-learning-access", course.id],
      });
    });

    it("preserves prerequisite payload, raw IDs, reset and delete refresh", async () => {
      const { client, m } = await existing(locale),
        a = area("access"),
        path = `/teacher/courses/${course.id}/learning-access/prerequisites`;
      change(a.getByLabelText(m.learningAccess.target), "Unit:unit-1");
      const prerequisite = a.getAllByRole("combobox").at(-1)!;
      const add = a.getByRole("button", {
        name: m.learningAccess.addPrerequisite,
      });
      expect(add).toBeDisabled();
      change(prerequisite, "Assignment:assignment-1");
      const invalidate = vi.spyOn(client, "invalidateQueries");
      fireEvent.click(add);
      await waitFor(() => expect(writes(path, "POST")).toHaveLength(1));
      expect(payload(path, "POST")).toEqual({
        targetType: "Unit",
        targetId: "unit-1",
        requiredContentType: "Assignment",
        requiredContentId: "assignment-1",
      });
      await waitFor(() => expect(prerequisite).toHaveValue(""));
      expect(add).toBeDisabled();
      fireEvent.click(
        a.getByRole("button", { name: m.learningAccess.removePrerequisite }),
      );
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(`${path}/prerequisite-1`, {
          method: "DELETE",
        }),
      );
      await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["course-learning-access", course.id],
      });
    });

    it("retains translated target/prerequisite guards without issuing API requests", async () => {
      const { client, m } = await existing(locale);
      const mutation = (path: string) =>
        mutations
          .filter(
            (fn) =>
              String(fn).includes(path) &&
              String(fn).includes("chooseContentFirst"),
          )
          .at(-1)!;
      const context = { client, meta: undefined, mutationKey: undefined };
      expect(() =>
        mutation("/learning-access/release")(undefined, context),
      ).toThrow(m.learningAccess.chooseContentFirst);
      expect(() =>
        mutation("/learning-access/prerequisites")(undefined, context),
      ).toThrow(m.learningAccess.chooseContentFirst);
      change(
        area("access").getByLabelText(m.learningAccess.target),
        "Unit:unit-1",
      );
      expect(() =>
        mutation("/learning-access/prerequisites")(undefined, context),
      ).toThrow(m.learningAccess.prerequisiteRequired);
      expect(
        apiMock.mock.calls.filter(([, options]) => options?.method),
      ).toEqual([]);
    });

    it("renders editor loading and translated unavailable state", async () => {
      let reject!: (error: Error) => void;
      apiMock.mockImplementation(
        () =>
          new Promise((_, fail) => {
            reject = fail;
          }),
      );
      const { m } = mount(locale);
      expect(screen.getByText(m.shared.loading)).toHaveAttribute(
        "aria-busy",
        "true",
      );
      await act(async () => reject(new Error("unavailable")));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        m.courseEditor.unavailable,
      );
    });

    it.each(["Rejected", "SubmittedForReview", "Approved", "Published"])(
      "preserves %s locking and access/announcement eligibility",
      async (status) => {
        apiMock.mockImplementationOnce(async () => ({ ...course, status }));
        const { m } = await existing(locale);
        const editable = status === "Rejected",
          assignmentsEditable = status !== "SubmittedForReview";
        expect(
          area("details").getByRole("button", { name: m.courseDetails.save }),
        ).toHaveProperty("disabled", !editable);
        expect(
          area("details").getByLabelText(m.courseDetails.arabicTitle),
        ).toHaveProperty("disabled", !editable);
        expect(
          area("access").getByLabelText(m.learningAccess.target),
        ).toHaveProperty("disabled", !assignmentsEditable);
        expect(
          area("announcements").queryByRole("heading", {
            name: m.announcements.new,
          }) !== null,
        ).toBe(assignmentsEditable);
        expect(
          screen.getByText(
            editable ? m.courseEditor.editable : m.courseEditor.locked,
          ),
        ).toBeVisible();
      },
    );

    it.each(["unknown", "fallback", "mapped"])(
      "preserves %s RequestError behavior",
      async (kind) => {
        const { m } = await existing(locale),
          detail = area("details");
        apiMock.mockImplementationOnce(async () => {
          throw kind === "fallback"
            ? "non-Error failure"
            : new Error(
                kind === "mapped"
                  ? "Course title is required."
                  : "Raw backend error CODE-42",
              );
        });
        fireEvent.click(
          detail.getByRole("button", { name: m.courseDetails.save }),
        );
        expect(await detail.findByRole("alert")).toHaveTextContent(
          kind === "fallback"
            ? m.courseEditor.requestFailed
            : kind === "mapped" && locale === "ar"
              ? "أدخل عنوان الدورة."
              : kind === "mapped"
                ? "Course title is required."
                : "Raw backend error CODE-42",
        );
      },
    );
  },
);
