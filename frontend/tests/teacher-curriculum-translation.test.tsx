import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CourseEditor,
  CurriculumEditor,
} from "@/features/teacher/course-editor";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";

type Course = ComponentProps<typeof CurriculumEditor>["course"];
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
const topic = {
  id: "topic-1",
  arabicTitle: "موضوع الخادم",
  englishTitle: "Server topic",
  arabicDescription: "وصف الموضوع",
  englishDescription: "Topic description",
  publicationStatus: "Published",
  sortOrder: 2,
};
const aim = {
  id: "aim-1",
  code: "A",
  arabicTitle: "هدف الخادم",
  englishTitle: "Server aim",
  arabicDescription: "وصف الهدف",
  englishDescription: "Aim description",
  publicationStatus: "Published",
  sortOrder: 2,
  topics: [topic],
};
const criterion = {
  id: "criterion-1",
  code: "A.P1",
  band: "Pass" as const,
  arabicDescription: "معيار الخادم",
  englishDescription: "Server criterion",
  arabicEvidenceGuidance: "إرشاد",
  englishEvidenceGuidance: "Guidance",
  publicationStatus: "Published",
  sortOrder: 2,
};
const lesson = {
  id: "lesson-1",
  arabicTitle: "درس الخادم",
  englishTitle: "Server lesson",
  arabicBody: "نص الخادم",
  englishBody: "Server body",
  type: "Video",
  durationSeconds: 900,
  isPreview: false,
  publicationStatus: "Published",
  sortOrder: 2,
  video: {
    id: "video-1",
    displayName: "RAW video.mp4",
    contentType: "video/mp4",
  },
  resources: [
    {
      id: "video-1",
      displayName: "Hidden video resource",
      contentType: "video/mp4",
      scanStatus: "Clean",
      isDownloadable: false,
    },
    {
      id: "resource-1",
      displayName: "RAW file اسم.pdf",
      contentType: "application/pdf",
      scanStatus: "RAW_SCAN",
      isDownloadable: true,
    },
    {
      id: "external-1",
      displayName: "RAW external",
      externalUrl: "https://example.com/resource",
      contentType: "text/html",
      scanStatus: "Clean",
      isDownloadable: true,
    },
  ],
};
const courseModule = {
  id: "module-1",
  arabicTitle: "وحدة الخادم",
  englishTitle: "Server module",
  unitCode: "RAW-U1",
  arabicDescription: "وصف الوحدة",
  englishDescription: "Unit description",
  guidedLearningHours: 60,
  credits: 10,
  qualificationLevel: "L3",
  publicationStatus: "Published",
  sortOrder: 2,
  learningAims: [aim],
  criteria: [criterion],
  lessons: [lesson],
};
const baseCourse: Course = {
  id: "course-1",
  isBtecFocused: false,
  deliveryPlanId: "plan-1",
  arabicTitle: "دورة الخادم",
  englishTitle: "Server course",
  arabicDescription: "وصف",
  englishDescription: "Description",
  status: "Draft",
  price: 12,
  isFree: false,
  hasCover: true,
  outcomes: [
    {
      id: "outcome-1",
      arabicText: "ناتج الخادم",
      englishText: "Server outcome",
      sortOrder: 1,
    },
  ],
  modules: [courseModule],
};
const academicUnit = {
  id: "academic-1",
  deliveryPlanEntryId: "entry-1",
  code: "1",
  arabicTitle: "الوحدة الأكاديمية",
  englishTitle: "Server academic unit",
  qualificationVersionId: "version-1",
  qualificationCode: "RAW-Q",
  versionCode: "ISSUE-4",
  termCode: "T1",
};
let currentCourse: Course;
const clients: QueryClient[] = [];
beforeEach(() => {
  apiMock.mockReset();
  currentCourse = structuredClone(baseCourse);
  apiMock.mockImplementation(async (path: string, options?: RequestInit) => {
    if (options?.method) return { id: "created-1" };
    if (path === `/teacher/courses/${baseCourse.id}`) return currentCourse;
    if (path.endsWith("/academic-units")) return [academicUnit];
    if (path.endsWith("/learning-access"))
      return {
        items: [],
        prerequisiteCourses: [],
        rules: [],
        prerequisites: [],
      };
    if (path.startsWith("/gradebook/"))
      return { students: [], totalStudents: 0, page: 1, pageSize: 25 };
    return [];
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.restoreAllMocks();
});
function mount(
  locale: "ar" | "en",
  options: {
    course?: Partial<Course>;
    full?: boolean;
    disabled?: boolean;
  } = {},
) {
  currentCourse = { ...currentCourse, ...options.course };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const messages = locale === "ar" ? arMessages : enMessages;
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {options.full ? (
          <CourseEditor courseId={currentCourse.id} />
        ) : (
          <CurriculumEditor
            course={currentCourse}
            disabled={options.disabled ?? false}
          />
        )}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { client, m: messages.teacherWorkspace };
}
function change(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
}
function writes(path: string, method: string) {
  return apiMock.mock.calls.filter(
    ([url, options]) => url === path && options?.method === method,
  );
}
function payload(path: string, method: string) {
  return JSON.parse(writes(path, method).at(-1)![1].body);
}
function container(text: string, selector: string) {
  const node = screen
    .getByText(text, { selector: "p,h3,h4,span" })
    .closest(selector);
  if (!(node instanceof HTMLElement)) throw new Error(`Missing ${text}`);
  return node;
}
function scope(text: string, selector = "article") {
  return within(container(text, selector));
}
function picker(locale: "ar" | "en", label: string) {
  return screen.getByLabelText(
    `${locale === "ar" ? "اختيار" : "Choose"} ${label}`,
  );
}
async function sent(path: string, method: string, count = 1) {
  await waitFor(() => expect(writes(path, method)).toHaveLength(count));
}
function assertRefresh(client: QueryClient) {
  expect(client.invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["teacher-course", currentCourse.id],
  });
}

describe.each(["en", "ar"] as const)(
  "teacher curriculum translation (%s)",
  (locale) => {
    const title = (ar: string, en: string) => (locale === "ar" ? ar : en);
    it.each([false, true])(
      "preserves cover FormData, SEO fallbacks/overrides, limits, URL and reset (SEO=%s)",
      async (seo) => {
        const { client, m } = mount(locale, {
          full: true,
          course: seo
            ? { seoTitle: "RAW SEO", seoDescription: "RAW SEO description" }
            : {},
        });
        await screen.findByRole("heading", { name: m.cover.title });
        const image = screen.getByRole("img", {
          name:
            locale === "ar"
              ? `غلاف ${baseCourse.arabicTitle}`
              : `${baseCourse.englishTitle} cover`,
        });
        expect(image).toHaveAttribute(
          "src",
          `/api/v1/teacher/courses/${baseCourse.id}/cover`,
        );
        const input = picker(locale, m.cover.image);
        expect(input).toHaveAttribute(
          "accept",
          "image/jpeg,image/png,image/webp",
        );
        const button = screen.getByRole("button", { name: m.cover.upload });
        expect(button).toBeDisabled();
        const oversized = new File(["x"], "oversize.png", {
          type: "image/png",
        });
        Object.defineProperty(oversized, "size", {
          value: 5 * 1024 * 1024 + 1,
        });
        fireEvent.change(input, { target: { files: [oversized] } });
        expect(button).toBeDisabled();
        expect(screen.getByRole("alert")).toHaveTextContent("5.00 MB");
        const file = new File(["cover"], "raw cover.png", {
          type: "image/png",
        });
        fireEvent.change(input, { target: { files: [file] } });
        vi.spyOn(client, "invalidateQueries");
        fireEvent.click(button);
        const path = `/teacher/courses/${baseCourse.id}/cover`;
        await sent(path, "POST");
        const body = writes(path, "POST")[0][1].body as FormData;
        expect([...body.keys()]).toEqual([
          "file",
          "seoTitle",
          "seoDescription",
        ]);
        expect(body.get("file")).toBe(file);
        expect(body.get("seoTitle")).toBe(
          seo ? "RAW SEO" : baseCourse.englishTitle,
        );
        expect(body.get("seoDescription")).toBe(
          seo ? "RAW SEO description" : baseCourse.englishDescription,
        );
        await waitFor(() =>
          expect(screen.queryByText(file.name)).not.toBeInTheDocument(),
        );
        expect(button).toBeDisabled();
        assertRefresh(client);
      },
    );

    it("preserves cover empty/disabled states and raw outcome payload/order/reset", async () => {
      const { client, m } = mount(locale, {
        full: true,
        course: { hasCover: false },
      });
      expect(await screen.findByText(m.cover.empty)).toBeVisible();
      expect(screen.getByText("ناتج الخادم")).toBeVisible();
      expect(screen.getByText("Server outcome")).toBeVisible();
      const add = screen.getByRole("button", { name: m.outcomes.add });
      expect(add).toBeDisabled();
      change(screen.getByPlaceholderText(m.outcomes.arabic), "  عربي  ");
      change(screen.getByPlaceholderText(m.outcomes.english), " English ");
      vi.spyOn(client, "invalidateQueries");
      fireEvent.click(add);
      await sent("/teacher/courses/outcomes", "POST");
      expect(payload("/teacher/courses/outcomes", "POST")).toEqual({
        courseId: currentCourse.id,
        arabicText: "  عربي  ",
        englishText: " English ",
        sortOrder: 2,
      });
      await waitFor(() =>
        expect(screen.getByPlaceholderText(m.outcomes.arabic)).toHaveValue(""),
      );
      expect(screen.getByPlaceholderText(m.outcomes.english)).toHaveValue("");
      assertRefresh(client);
    });

    it("preserves non-BTEC module creation, title fallback, null code, order and both invalidations", async () => {
      const { client, m } = mount(locale, { course: { modules: [] } });
      expect(screen.getByText(m.curriculum.empty)).toBeVisible();
      expect(apiMock).not.toHaveBeenCalledWith(
        `/teacher/courses/${currentCourse.id}/academic-units`,
      );
      change(screen.getByPlaceholderText(m.curriculum.arabicTitle), " عنوان ");
      const invalidate = vi.spyOn(client, "invalidateQueries");
      fireEvent.click(screen.getByRole("button", { name: m.curriculum.add }));
      await sent("/teacher/courses/modules", "POST");
      expect(payload("/teacher/courses/modules", "POST")).toEqual({
        courseId: currentCourse.id,
        deliveryPlanEntryId: null,
        arabicTitle: " عنوان ",
        englishTitle: "عنوان",
        unitCode: null,
        sortOrder: 1,
      });
      await waitFor(() =>
        expect(
          screen.getByPlaceholderText(m.curriculum.arabicTitle),
        ).toHaveValue(""),
      );
      expect(
        screen.getByPlaceholderText(m.curriculum.englishTitleOptional),
      ).toHaveValue("");
      expect(screen.getByPlaceholderText(m.curriculum.unitCode)).toHaveValue(
        "",
      );
      expect(invalidate.mock.calls).toEqual([
        [{ queryKey: ["teacher-course", currentCourse.id] }],
        [{ queryKey: ["teacher-course-academic-units", currentCourse.id] }],
      ]);
    });

    it("preserves BTEC academic query/selection and blocks new units in a legacy course without a plan", async () => {
      const { client, m } = mount(locale, {
        course: { isBtecFocused: true, modules: [] },
      });
      const select = screen.getByLabelText(m.curriculum.academicUnit),
        button = screen.getByRole("button", { name: m.curriculum.add });
      expect(button).toBeDisabled();
      await screen.findByRole("option", {
        name: new RegExp(
          title(academicUnit.arabicTitle, academicUnit.englishTitle),
        ),
      });
      expect(apiMock).toHaveBeenCalledWith(
        `/teacher/courses/${currentCourse.id}/academic-units`,
      );
      expect(
        client.getQueryData([
          "teacher-course-academic-units",
          currentCourse.id,
        ]),
      ).toEqual([academicUnit]);
      change(select, "entry-1");
      vi.spyOn(client, "invalidateQueries");
      fireEvent.click(button);
      await sent("/teacher/courses/modules", "POST");
      expect(payload("/teacher/courses/modules", "POST")).toEqual({
        courseId: currentCourse.id,
        deliveryPlanEntryId: "entry-1",
        arabicTitle: "",
        englishTitle: "",
        unitCode: null,
        sortOrder: 1,
      });
      await waitFor(() => expect(select).toHaveValue(""));
      assertRefresh(client);
      expect(client.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["teacher-course-academic-units", currentCourse.id],
      });
      cleanup();
      mount(locale, {
        course: { isBtecFocused: true, deliveryPlanId: undefined, modules: [] },
      });
      expect(screen.getByText(m.curriculum.legacyNoPlan)).toBeVisible();
      expect(
        screen.queryByRole("button", { name: m.curriculum.add }),
      ).not.toBeInTheDocument();
    });

    it("preserves module numeric/null conversions, scheduling, duplicate/delete and refresh", async () => {
      const { client, m } = mount(locale),
        unit = scope(
          title(courseModule.arabicTitle, courseModule.englishTitle),
        ),
        path = `/teacher/courses/modules/${courseModule.id}`;
      const hours = unit.getByLabelText(m.module.guidedLearningHours),
        credits = unit.getByLabelText(m.module.unitCredits),
        order = unit.getByLabelText(m.module.order);
      [hours, credits, order].forEach((input) =>
        expect(input).toHaveAttribute("min", "0"),
      );
      change(hours, "0");
      change(credits, "");
      change(order, "7");
      const status = unit.getAllByRole("combobox")[0];
      change(status, "Scheduled");
      change(unit.getByLabelText(m.module.releaseTime), "2026-10-07T11:30");
      vi.spyOn(client, "invalidateQueries");
      fireEvent.click(unit.getByRole("button", { name: m.module.save }));
      await sent(path, "PUT");
      expect(payload(path, "PUT")).toEqual({
        arabicTitle: courseModule.arabicTitle,
        englishTitle: courseModule.englishTitle,
        unitCode: "RAW-U1",
        arabicDescription: courseModule.arabicDescription,
        englishDescription: courseModule.englishDescription,
        guidedLearningHours: 0,
        credits: null,
        qualificationLevel: "L3",
        publicationStatus: "Scheduled",
        sortOrder: 7,
        availableFromUtc: new Date("2026-10-07T11:30").toISOString(),
      });
      change(status, "Published");
      fireEvent.click(unit.getByRole("button", { name: m.module.save }));
      await sent(path, "PUT", 2);
      expect(payload(path, "PUT").availableFromUtc).toBeNull();
      fireEvent.click(
        unit.getAllByRole("button", { name: m.shared.duplicate })[0],
      );
      await sent(`${path}/duplicate`, "POST");
      expect(writes(`${path}/duplicate`, "POST")[0][1]).toEqual({
        method: "POST",
      });
      fireEvent.click(
        unit.getAllByRole("button", { name: m.announcements.delete })[0],
      );
      await sent(path, "DELETE");
      assertRefresh(client);
    });

    it("preserves legacy academic link eligibility, payload, selector reset and academic-unit refresh", async () => {
      const legacy = {
        ...courseModule,
        learningAims: [],
        criteria: [],
        lessons: [],
      };
      const { client, m } = mount(locale, {
        course: { isBtecFocused: true, modules: [legacy] },
      });
      const select = screen.getByLabelText(m.module.academicLink),
        link = screen.getByRole("button", { name: m.module.linkUnit });
      expect(link).toBeDisabled();
      await screen.findAllByRole("option", {
        name: new RegExp(
          title(academicUnit.arabicTitle, academicUnit.englishTitle),
        ),
      });
      change(select, "academic-1");
      vi.spyOn(client, "invalidateQueries");
      fireEvent.click(link);
      const path = `/teacher/courses/modules/${courseModule.id}/academic-link`;
      await sent(path, "POST");
      expect(payload(path, "POST")).toEqual({ unitDefinitionId: "academic-1" });
      await waitFor(() => expect(select).toHaveValue(""));
      assertRefresh(client);
      expect(client.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["teacher-course-academic-units", currentCourse.id],
      });
      cleanup();
      mount(locale, {
        course: { isBtecFocused: true, modules: [courseModule] },
      });
      expect(
        screen.queryByLabelText(m.module.academicLink),
      ).not.toBeInTheDocument();
    });

    it("keeps catalogue fields/aims/criteria locked, duplicate disabled and delivery topics editable", async () => {
      const { m } = mount(locale, {
        course: {
          isBtecFocused: true,
          modules: [{ ...courseModule, unitDefinitionId: "academic-1" }],
        },
      });
      expect(screen.getByText(m.module.catalogueDescription)).toBeVisible();
      expect(
        screen.queryByPlaceholderText(m.module.unitCode),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText(m.learningAim.code),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText(m.criterion.code)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: m.btecStructure.addAim }),
      ).not.toBeInTheDocument();
      const unit = scope(
        title(courseModule.arabicTitle, courseModule.englishTitle),
      );
      expect(
        unit.getAllByRole("button", { name: m.shared.duplicate })[0],
      ).toBeDisabled();
      expect(
        screen.getByText(
          title(criterion.arabicDescription, criterion.englishDescription),
        ),
      ).toBeVisible();
      expect(screen.getByLabelText(m.topic.arabic)).toBeEnabled();
      change(screen.getByPlaceholderText(m.topic.arabic), "موضوع جديد");
      change(screen.getByPlaceholderText(m.topic.english), "New topic");
      fireEvent.click(screen.getByRole("button", { name: m.topic.add }));
      await sent("/teacher/courses/topics", "POST");
      expect(payload("/teacher/courses/topics", "POST").learningAimId).toBe(
        "aim-1",
      );
    });

    it("preserves lesson creation fallbacks, numeric duration, ordering, internal types and reset defaults", async () => {
      const { client, m } = mount(locale),
        unit = scope(
          title(courseModule.arabicTitle, courseModule.englishTitle),
        );
      const arabic = unit.getByPlaceholderText(m.module.arabicLessonTitle);
      change(arabic, " درس ");
      change(unit.getByPlaceholderText(m.module.arabicLessonContent), " نص ");
      change(unit.getByLabelText(m.module.lessonDuration), "120");
      fireEvent.click(unit.getByLabelText(m.module.previewLesson));
      const lessonType = unit.getAllByRole("combobox").at(-1)!;
      expect(
        [...lessonType.querySelectorAll("option")].map((o) => o.value),
      ).toEqual(["Text", "Video", "Activity", "Assignment", "LiveSession"]);
      change(lessonType, "Activity");
      vi.spyOn(client, "invalidateQueries");
      fireEvent.click(unit.getByRole("button", { name: m.module.addLesson }));
      await sent("/teacher/courses/lessons", "POST");
      expect(payload("/teacher/courses/lessons", "POST")).toEqual({
        moduleId: courseModule.id,
        arabicTitle: " درس ",
        englishTitle: "درس",
        arabicBody: " نص ",
        englishBody: "نص",
        type: "Activity",
        durationSeconds: 120,
        isPreview: true,
        sortOrder: 2,
      });
      await waitFor(() => expect(arabic).toHaveValue(""));
      [
        m.module.englishLessonTitleOptional,
        m.module.arabicLessonContent,
        m.module.englishLessonContentOptional,
      ].forEach((p) => expect(unit.getByPlaceholderText(p)).toHaveValue(""));
      expect(unit.getByLabelText(m.module.lessonDuration)).toHaveValue(900);
      expect(lessonType).toHaveValue("Text");
      expect(unit.getByLabelText(m.module.previewLesson)).not.toBeChecked();
      assertRefresh(client);
    });

    it("preserves aim creation/reset and criterion null/link/band/order contracts", async () => {
      const { client, m } = mount(locale);
      change(screen.getByPlaceholderText(m.btecStructure.aimCode), "B");
      change(
        screen.getByPlaceholderText(m.btecStructure.arabicAim),
        "هدف جديد",
      );
      change(
        screen.getByPlaceholderText(m.btecStructure.englishAim),
        "New aim",
      );
      change(
        screen.getByPlaceholderText(m.btecStructure.arabicDescriptionOptional),
        "شرح",
      );
      change(
        screen.getByPlaceholderText(m.btecStructure.englishDescriptionOptional),
        "Description",
      );
      vi.spyOn(client, "invalidateQueries");
      fireEvent.click(
        screen.getByRole("button", { name: m.btecStructure.addAim }),
      );
      await sent("/teacher/courses/learning-aims", "POST");
      expect(payload("/teacher/courses/learning-aims", "POST")).toEqual({
        moduleId: courseModule.id,
        code: "B",
        arabicTitle: "هدف جديد",
        englishTitle: "New aim",
        arabicDescription: "شرح",
        englishDescription: "Description",
        sortOrder: 2,
      });
      await waitFor(() =>
        expect(
          screen.getByPlaceholderText(m.btecStructure.aimCode),
        ).toHaveValue(""),
      );
      [
        m.btecStructure.arabicAim,
        m.btecStructure.englishAim,
        m.btecStructure.arabicDescriptionOptional,
        m.btecStructure.englishDescriptionOptional,
      ].forEach((p) => expect(screen.getByPlaceholderText(p)).toHaveValue(""));
      const code = screen.getByPlaceholderText("A.P1"),
        form = within(code.parentElement!),
        band = form.getAllByRole("combobox")[1],
        linkedAim = form.getAllByRole("combobox")[0];
      expect([...band.querySelectorAll("option")].map((o) => o.value)).toEqual([
        "Pass",
        "Merit",
        "Distinction",
      ]);
      for (const [index, value] of ["Pass", "Merit", "Distinction"].entries()) {
        change(code, `B.${index}`);
        change(
          screen.getByPlaceholderText(m.btecStructure.arabicCriterion),
          "وصف",
        );
        change(
          screen.getByPlaceholderText(m.btecStructure.englishCriterion),
          "Description",
        );
        change(band, value);
        if (index > 0) change(linkedAim, "aim-1");
        fireEvent.click(
          screen.getByRole("button", { name: m.btecStructure.addCriterion }),
        );
        await sent("/teacher/courses/criteria", "POST", index + 1);
        expect(payload("/teacher/courses/criteria", "POST")).toEqual({
          moduleId: courseModule.id,
          learningAimId: index > 0 ? "aim-1" : null,
          code: `B.${index}`,
          band: value,
          arabicDescription: "وصف",
          englishDescription: "Description",
          arabicEvidenceGuidance: "",
          englishEvidenceGuidance: "",
          sortOrder: 2,
        });
        await waitFor(() => expect(code).toHaveValue(""));
        expect(band).toHaveValue("Pass");
        expect(linkedAim).toHaveValue("");
      }
      assertRefresh(client);
    });

    it("preserves learning aim/topic/criterion PUT, DELETE, Number order and topic reset/refresh", async () => {
      const { client, m } = mount(locale);
      vi.spyOn(client, "invalidateQueries");
      const aimScope = scope(`A — ${title(aim.arabicTitle, aim.englishTitle)}`),
        criterionScope = scope("A.P1 · Pass");
      const topicNode = container(
          `• ${title(topic.arabicTitle, topic.englishTitle)}`,
          "div",
        ),
        topicScope = within(topicNode);
      change(aimScope.getByLabelText(m.learningAim.order), "8");
      fireEvent.click(
        aimScope.getAllByRole("button", { name: m.shared.save })[0],
      );
      const aimPath = `/teacher/courses/learning-aims/${aim.id}`;
      await sent(aimPath, "PUT");
      expect(payload(aimPath, "PUT")).toEqual({
        code: "A",
        arabicTitle: aim.arabicTitle,
        englishTitle: aim.englishTitle,
        arabicDescription: aim.arabicDescription,
        englishDescription: aim.englishDescription,
        sortOrder: 8,
      });
      change(topicScope.getByLabelText(m.topic.order), "9");
      fireEvent.click(topicScope.getByRole("button", { name: m.shared.save }));
      const topicPath = `/teacher/courses/topics/${topic.id}`;
      await sent(topicPath, "PUT");
      expect(payload(topicPath, "PUT")).toEqual({
        arabicTitle: topic.arabicTitle,
        englishTitle: topic.englishTitle,
        arabicDescription: topic.arabicDescription,
        englishDescription: topic.englishDescription,
        sortOrder: 9,
      });
      change(criterionScope.getByLabelText(m.criterion.order), "10");
      fireEvent.click(
        criterionScope.getByRole("button", { name: m.shared.save }),
      );
      const criterionPath = `/teacher/courses/criteria/${criterion.id}`;
      await sent(criterionPath, "PUT");
      expect(payload(criterionPath, "PUT")).toEqual({
        code: "A.P1",
        band: "Pass",
        arabicDescription: criterion.arabicDescription,
        englishDescription: criterion.englishDescription,
        arabicEvidenceGuidance: "إرشاد",
        englishEvidenceGuidance: "Guidance",
        sortOrder: 10,
      });
      change(aimScope.getByPlaceholderText(m.topic.arabic), "ع");
      change(aimScope.getByPlaceholderText(m.topic.english), "En");
      fireEvent.click(aimScope.getByRole("button", { name: m.topic.add }));
      await sent("/teacher/courses/topics", "POST");
      expect(payload("/teacher/courses/topics", "POST")).toEqual({
        learningAimId: aim.id,
        arabicTitle: "ع",
        englishTitle: "En",
        arabicDescription: "",
        englishDescription: "",
        sortOrder: 2,
      });
      await waitFor(() =>
        expect(aimScope.getByPlaceholderText(m.topic.arabic)).toHaveValue(""),
      );
      expect(aimScope.getByPlaceholderText(m.topic.english)).toHaveValue("");
      fireEvent.click(
        topicScope.getByRole("button", { name: m.announcements.delete }),
      );
      await sent(topicPath, "DELETE");
      fireEvent.click(
        criterionScope.getByRole("button", { name: m.announcements.delete }),
      );
      await sent(criterionPath, "DELETE");
      fireEvent.click(
        aimScope.getAllByRole("button", { name: m.announcements.delete })[0],
      );
      await sent(aimPath, "DELETE");
      await waitFor(() =>
        expect(client.invalidateQueries).toHaveBeenCalledTimes(7),
      );
      assertRefresh(client);
    });

    it("preserves lesson PUT scheduling, type, aim/topic selection, duration/order and duplicate/delete", async () => {
      const { client, m } = mount(locale),
        editor = scope(title(lesson.arabicTitle, lesson.englishTitle)),
        path = `/teacher/courses/lessons/${lesson.id}`;
      const numbers = editor.getAllByRole("spinbutton");
      change(numbers[0], "125");
      change(editor.getByLabelText(m.lesson.order), "11");
      numbers.forEach((n) => expect(n).toHaveAttribute("min", "0"));
      change(editor.getByLabelText(m.lesson.status), "Scheduled");
      change(editor.getByLabelText(m.lesson.releaseTime), "2026-10-08T12:45");
      change(editor.getByLabelText(m.lesson.learningAim), "aim-1");
      change(editor.getByLabelText(m.lesson.topic), "topic-1");
      vi.spyOn(client, "invalidateQueries");
      fireEvent.click(editor.getByRole("button", { name: m.lesson.save }));
      await sent(path, "PUT");
      expect(payload(path, "PUT")).toEqual({
        arabicTitle: lesson.arabicTitle,
        englishTitle: lesson.englishTitle,
        arabicBody: lesson.arabicBody,
        englishBody: lesson.englishBody,
        type: "Video",
        durationSeconds: 125,
        sortOrder: 11,
        isPreview: false,
        learningAimId: "aim-1",
        topicId: "topic-1",
        publicationStatus: "Scheduled",
        availableFromUtc: new Date("2026-10-08T12:45").toISOString(),
      });
      change(editor.getByLabelText(m.lesson.learningAim), "");
      expect(editor.getByLabelText(m.lesson.topic)).toHaveValue("");
      expect(editor.getByLabelText(m.lesson.topic)).toBeDisabled();
      change(editor.getByLabelText(m.lesson.status), "Draft");
      fireEvent.click(editor.getByRole("button", { name: m.lesson.save }));
      await sent(path, "PUT", 2);
      expect(payload(path, "PUT").availableFromUtc).toBeNull();
      fireEvent.click(editor.getByRole("button", { name: m.shared.duplicate }));
      await sent(`${path}/duplicate`, "POST");
      expect(writes(`${path}/duplicate`, "POST")[0][1]).toEqual({
        method: "POST",
      });
      fireEvent.click(
        editor.getByRole("button", { name: m.announcements.delete }),
      );
      await sent(path, "DELETE");
      assertRefresh(client);
    });

    it("preserves resource per-file FormData uploads, limit, raw links/status, filtering and reset", async () => {
      const { client, m } = mount(locale),
        editor = scope(title(lesson.arabicTitle, lesson.englishTitle));
      expect(
        editor.getByRole("link", { name: "RAW file اسم.pdf" }),
      ).toHaveAttribute("href", "/api/v1/teacher/courses/resources/resource-1");
      expect(
        editor.getByRole("link", { name: "RAW external" }),
      ).toHaveAttribute("href", "https://example.com/resource");
      expect(editor.getByText("RAW_SCAN")).toBeVisible();
      expect(
        editor.queryByText("Hidden video resource"),
      ).not.toBeInTheDocument();
      const input = picker(locale, m.lesson.uploadFiles);
      expect(input).toHaveAttribute("multiple");
      const oversized = new File(["x"], "large.pdf");
      Object.defineProperty(oversized, "size", {
        value: 100 * 1024 * 1024 + 1,
      });
      fireEvent.change(input, { target: { files: [oversized] } });
      expect(editor.getByRole("alert")).toHaveTextContent("100.00 MB");
      const files = [
        new File(["a"], "first.pdf"),
        new File(["b"], "second.pdf"),
      ];
      fireEvent.change(input, { target: { files } });
      vi.spyOn(client, "invalidateQueries");
      fireEvent.click(
        editor.getByRole("button", { name: m.lesson.uploadResources }),
      );
      const path = `/teacher/courses/lessons/${lesson.id}/resources`;
      await sent(path, "POST", 2);
      writes(path, "POST").forEach(([, options], index) => {
        const body = options.body as FormData;
        expect([...body.keys()]).toEqual(["file", "isDownloadable"]);
        expect(body.get("file")).toBe(files[index]);
        expect(body.get("isDownloadable")).toBe("true");
      });
      await waitFor(() =>
        files.forEach((f) =>
          expect(screen.queryByText(f.name)).not.toBeInTheDocument(),
        ),
      );
      assertRefresh(client);
    });

    it("preserves video URL/identity, loading-ready-error-retry and upload/delete resets/limits", async () => {
      const { client, m } = mount(locale),
        editorNode = container(
          title(lesson.arabicTitle, lesson.englishTitle),
          "article",
        ),
        editor = within(editorNode);
      const label =
        locale === "ar"
          ? `معاينة فيديو ${lesson.arabicTitle}`
          : `Preview ${lesson.englishTitle} video`;
      let video = editor.getByLabelText(label);
      expect(video).toHaveAttribute(
        "src",
        `/api/v1/teacher/courses/lessons/${lesson.id}/video?retry=0`,
      );
      expect(editor.getByText("RAW video.mp4", { exact: false })).toBeVisible();
      expect(editor.getByText(m.lesson.loadingVideo)).toBeVisible();
      fireEvent.canPlay(video);
      expect(editor.queryByText(m.lesson.loadingVideo)).not.toBeInTheDocument();
      fireEvent.waiting(video);
      expect(editor.getByText(m.lesson.loadingVideo)).toBeVisible();
      fireEvent.error(video);
      expect(editor.getByRole("alert")).toHaveTextContent(
        m.lesson.videoUnavailable,
      );
      fireEvent.click(
        editor.getByRole("button", { name: m.lesson.retryVideo }),
      );
      video = editor.getByLabelText(label);
      expect(video).toHaveAttribute(
        "src",
        `/api/v1/teacher/courses/lessons/${lesson.id}/video?retry=1`,
      );
      expect(editor.getByText(m.lesson.loadingVideo)).toBeVisible();
      fireEvent.canPlay(video);
      const input = picker(locale, m.lesson.recordedVideo);
      expect(input).toHaveAttribute(
        "accept",
        "video/mp4,video/webm,.mp4,.webm",
      );
      const oversized = new File(["x"], "large.webm");
      Object.defineProperty(oversized, "size", {
        value: 500 * 1024 * 1024 + 1,
      });
      fireEvent.change(input, { target: { files: [oversized] } });
      expect(editor.getByRole("alert")).toHaveTextContent("500.00 MB");
      const file = new File(["video"], "raw-new.webm", { type: "video/webm" });
      fireEvent.change(input, { target: { files: [file] } });
      vi.spyOn(client, "invalidateQueries");
      fireEvent.click(
        editor.getByRole("button", { name: m.lesson.replaceVideo }),
      );
      const path = `/teacher/courses/lessons/${lesson.id}/video`;
      await sent(path, "POST");
      expect((writes(path, "POST")[0][1].body as FormData).get("file")).toBe(
        file,
      );
      await waitFor(() =>
        expect(screen.queryByText(file.name)).not.toBeInTheDocument(),
      );
      expect(editor.getByText(m.lesson.loadingVideo)).toBeVisible();
      fireEvent.canPlay(editor.getByLabelText(label));
      fireEvent.click(
        editor.getByRole("button", { name: m.lesson.removeVideo }),
      );
      await sent(path, "DELETE");
      await waitFor(() =>
        expect(editor.getByText(m.lesson.loadingVideo)).toBeVisible(),
      );
      assertRefresh(client);
    });

    it("preserves resource-link raw payload/reset and disabled editor controls", async () => {
      const { client, m } = mount(locale),
        editor = scope(title(lesson.arabicTitle, lesson.englishTitle));
      change(editor.getByLabelText(m.lesson.linkName), " RAW name ");
      change(
        editor.getByLabelText(m.lesson.httpsLink),
        "https://example.com/raw",
      );
      vi.spyOn(client, "invalidateQueries");
      fireEvent.click(editor.getByRole("button", { name: m.lesson.addLink }));
      const path = `/teacher/courses/lessons/${lesson.id}/resource-links`;
      await sent(path, "POST");
      expect(payload(path, "POST")).toEqual({
        displayName: " RAW name ",
        externalUrl: "https://example.com/raw",
      });
      await waitFor(() =>
        expect(editor.getByLabelText(m.lesson.linkName)).toHaveValue(""),
      );
      expect(editor.getByLabelText(m.lesson.httpsLink)).toHaveValue("");
      assertRefresh(client);
      cleanup();
      mount(locale, { disabled: true });
      expect(
        screen.queryByRole("button", { name: m.module.save }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: m.lesson.save }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: m.btecStructure.addAim }),
      ).not.toBeInTheDocument();
    });
    it.each(["aim", "criterion"])(
      "blocks legacy linking with existing %s data",
      (kind) => {
        const { m } = mount(locale, {
          course: {
            isBtecFocused: true,
            modules: [
              {
                ...courseModule,
                learningAims: kind === "aim" ? [aim] : [],
                criteria: kind === "criterion" ? [criterion] : [],
                lessons: [],
              },
            ],
          },
        });
        expect(screen.getByText(m.module.legacyDescription)).toBeVisible();
        expect(
          screen.queryByLabelText(m.module.academicLink),
        ).not.toBeInTheDocument();
      },
    );
    it("keeps locked cover controls disabled and outcome authoring hidden", async () => {
      const { m } = mount(locale, {
        full: true,
        course: { status: "SubmittedForReview" },
      });
      await screen.findByRole("heading", { name: m.cover.title });
      expect(picker(locale, m.cover.image)).toBeDisabled();
      expect(
        screen.getByRole("button", { name: m.cover.upload }),
      ).toBeDisabled();
      expect(
        screen.queryByPlaceholderText(m.outcomes.arabic),
      ).not.toBeInTheDocument();
    });
    it("keeps empty resource state and video attachment copy with no existing video", () => {
      const { m } = mount(locale, {
        course: {
          modules: [
            {
              ...courseModule,
              lessons: [{ ...lesson, video: undefined, resources: [] }],
            },
          ],
        },
      });
      expect(screen.getByText(m.lesson.noResources)).toBeVisible();
      expect(
        screen.getByRole("button", { name: m.lesson.attachVideo }),
      ).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: m.lesson.removeVideo }),
      ).not.toBeInTheDocument();
    });
    it.each(["raw", "fallback"])(
      "preserves %s error rendering for newly translated callers",
      async (kind) => {
        const { m } = mount(locale, { course: { modules: [] } });
        change(screen.getByPlaceholderText(m.curriculum.arabicTitle), "عنوان");
        apiMock.mockRejectedValueOnce(
          kind === "raw"
            ? new Error("Raw server ERROR-42")
            : "non-Error failure",
        );
        fireEvent.click(screen.getByRole("button", { name: m.curriculum.add }));
        expect(await screen.findByRole("alert")).toHaveTextContent(
          kind === "raw" ? "Raw server ERROR-42" : m.courseEditor.requestFailed,
        );
      },
    );
  },
);
