import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  auditTeacherSource,
  reviewedTechnicalCandidates,
  teacherFiles,
} from "./helpers/teacher-i18n-audit";
import technical from "./fixtures/teacher-i18n-technical-strings.json";
import ts from "typescript";

const currentAudit = (path: string) =>
  auditTeacherSource(
    path,
    readFileSync(path, "utf8"),
    false,
    path === "src/components/forms/file-picker.tsx",
  );

describe("whole Teacher residual i18n source audit", () => {
  it("covers every Teacher feature file and the route, including reachable practice functions", () => {
    const actual = readdirSync("src/features/teacher")
      .filter((name) => /\.tsx?$/.test(name))
      .map((name) => `src/features/teacher/${name}`)
      .sort();
    expect(actual).toEqual(
      teacherFiles
        .filter((path) => path.startsWith("src/features/teacher/"))
        .slice()
        .sort(),
    );
    const discovered = readdirSync("src/features", {
      recursive: true,
      encoding: "utf8",
    })
      .filter((name) => /\.tsx?$/.test(name))
      .map((name) => `src/features/${name.replaceAll("\\", "/")}`)
      .map((path) => {
        const source = ts.createSourceFile(
          path,
          readFileSync(path, "utf8"),
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        );
        return {
          path,
          names: source.statements.flatMap((node) =>
            ts.isFunctionDeclaration(node) &&
            node.name?.text.startsWith("Teacher")
              ? [node.name.text]
              : [],
          ),
        };
      });
    expect(
      discovered.filter(
        ({ path, names }) =>
          names.length > 0 &&
          !(teacherFiles as readonly string[]).includes(path),
      ),
    ).toEqual([
      // These names describe Admin invitation management and the public directory, not the Teacher workspace.
      { path: "src/features/admin/admin-area.tsx", names: ["TeacherInvites"] },
      {
        path: "src/features/public/public-content.tsx",
        names: ["TeacherDirectory"],
      },
    ]);
  });
  it.each(teacherFiles)(
    "classifies all copy/locale/technical candidates in %s",
    (path) => {
      const result = currentAudit(path);
      expect(
        result.candidates.filter((c) => c.classification === "STATIC_UI"),
      ).toEqual([]);
      expect(result.staticArabic).toBe(0);
      expect(result.staticEnglish).toBe(0);
      expect(result.staticLocaleBranches).toBe(0);
      expect(result.staticHelperCalls).toBe(0);
      expect(reviewedTechnicalCandidates(result)).toEqual(technical[path]);
    },
  );
  it("freezes 26 Teacher server-data selections, three shared data selectors, four direction conditionals and six practice data-helper calls", () => {
    const results = teacherFiles.map((path) => currentAudit(path));
    expect(results.reduce((n, r) => n + r.serverBranches, 0)).toBe(29);
    expect(results.reduce((n, r) => n + r.directionBranches, 0)).toBe(4);
    expect(results.reduce((n, r) => n + r.serverHelperCalls, 0)).toBe(6);
    const branches = results.flatMap((r) =>
      r.candidates
        .filter(
          (c) =>
            c.kind === "locale-branch" &&
            c.classification !== "COMPATIBILITY_DEFAULT",
        )
        .map((c) => `${r.path}: ${c.owner}: ${c.text.replace(/\s+/g, " ")}`),
    );
    expect(branches).toEqual(localeBranches);
  });
  it("supplies full catalogue copy at all five Teacher FilePicker call sites and leaves Student callers alone", () => {
    const callers: string[] = [];
    for (const path of teacherFiles) {
      const source = readFileSync(path, "utf8");
      const file = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      for (const statement of file.statements) {
        if (
          path.includes("/learning/") &&
          !(
            ts.isFunctionDeclaration(statement) &&
            statement.name?.text.startsWith("Teacher")
          )
        )
          continue;
        const owner = ts.isFunctionDeclaration(statement)
          ? statement.name?.text
          : "module";
        const visit = (node: ts.Node) => {
          if (
            (ts.isJsxSelfClosingElement(node) ||
              ts.isJsxOpeningElement(node)) &&
            node.tagName.getText(file) === "FilePicker"
          ) {
            const copy = node.attributes.properties.find(
              (p) => ts.isJsxAttribute(p) && p.name.getText(file) === "copy",
            );
            expect(copy?.getText(file)).toBe("copy={teacherFilePickerCopy(t)}");
            callers.push(`${path}: ${owner}`);
          }
          ts.forEachChild(node, visit);
        };
        visit(statement);
      }
    }
    expect(callers).toEqual([
      "src/features/teacher/course-editor.tsx: CoverManager",
      "src/features/teacher/course-editor.tsx: LessonEditor",
      "src/features/teacher/course-editor.tsx: LessonEditor",
      "src/features/teacher/course-editor.tsx: CourseAssignmentCard",
      "src/features/learning/comprehensive-practice.tsx: TeacherComprehensiveResources",
    ]);
    const picker = currentAudit("src/components/forms/file-picker.tsx");
    // T7-A6.1 migrates the shared defaults; all five Teacher injections above
    // retain priority and the Student caller source remains untouched.
    expect(picker.compatibilityDefaultArabic).toBe(0);
    // The sole remaining compatibility literal is the frozen raw fileType
    // metadata fallback "File", already overridden by Teacher typeLabel.
    expect(picker.compatibilityDefaultEnglish).toBe(1);
    expect(picker.compatibilityDefaultLocaleBranches).toBe(0);
    // The raw fileType helper is retained; Teacher presentation also overrides its generic fallback.
    expect(
      readFileSync("src/components/forms/file-picker.tsx", "utf8"),
    ).toMatch(
      /copy\s*\? copy\.typeLabel\(fileType\(file\)\)\s*: fileType\(file\)/,
    );
    expect(
      readFileSync("src/features/teacher/file-picker-copy.ts", "utf8"),
    ).toMatch(/t\("filePicker.genericFile"\)/);
  });
  it("detects Arabic, English-only JSX/attributes, bilingual arrays and static language switches", () => {
    for (const fragment of [
      "<p>Untranslated heading</p>",
      '<input placeholder="Untranslated input" />',
      "<p>نص ثابت</p>",
      'locale === "ar" ? "Arabic copy" : "English copy"',
      'isArabic ? "Arabic copy" : "English copy"',
      "<p>{`Untranslated prefix ${data}`}</p>",
      'tr(locale, "عربي", "English")',
      '[["field", "عربي", "English"]]',
    ]) {
      const result = auditTeacherSource(
        "probe.tsx",
        `function Probe() { const locale = "ar"; return (${fragment}); }`,
      );
      expect(
        result.candidates.some((c) => c.classification === "STATIC_UI"),
      ).toBe(true);
    }
  });
  it("does not excuse unguarded FilePicker copy as a compatibility default", () => {
    const result = auditTeacherSource(
      "src/components/forms/file-picker.tsx",
      "function FilePicker() { return <p>Untranslated copy</p>; }",
      false,
      true,
    );
    expect(
      result.candidates.filter((c) => c.classification === "STATIC_UI"),
    ).not.toEqual([]);
  });
});

// Individually reviewed server selections and semantic direction branches; no broad locale allowlist.
const localeBranches: string[] = [
  'src/features/teacher/course-editor.tsx: CreateCourse: locale === "ar" ? plan.specializationArabicName : plan.specializationEnglishName',
  'src/features/teacher/course-editor.tsx: CreateCourse: locale === "ar" ? plan.gradeArabicName : plan.gradeEnglishName',
  'src/features/teacher/course-editor.tsx: ExistingCourseEditor: locale === "ar" ? course.data.arabicTitle : course.data.englishTitle',
  'src/features/teacher/course-editor.tsx: CourseAnnouncementsEditor: locale === "ar" ? announcement.arabicTitle : announcement.englishTitle',
  'src/features/teacher/course-editor.tsx: LearningAccessEditor: locale === "ar" ? item.arabicTitle : item.englishTitle',
  'src/features/teacher/course-editor.tsx: CoverManager: locale === "ar" ? course.arabicTitle : course.englishTitle',
  'src/features/teacher/course-editor.tsx: BtecStructureEditor: locale === "ar" ? item.arabicTitle : item.englishTitle',
  'src/features/teacher/course-editor.tsx: LearningAimEditor: locale === "ar" ? aim.arabicTitle : aim.englishTitle',
  'src/features/teacher/course-editor.tsx: TopicEditor: locale === "ar" ? topic.arabicTitle : topic.englishTitle',
  'src/features/teacher/course-editor.tsx: CriterionEditor: locale === "ar" ? criterion.arabicDescription : criterion.englishDescription',
  'src/features/teacher/course-editor.tsx: LessonEditor: locale === "ar" ? lesson.arabicTitle : lesson.englishTitle',
  'src/features/teacher/course-editor.tsx: LessonEditor: locale === "ar" ? aim.arabicTitle : aim.englishTitle',
  'src/features/teacher/course-editor.tsx: LessonEditor: locale === "ar" ? topic.arabicTitle : topic.englishTitle',
  'src/features/teacher/course-editor.tsx: LessonEditor: locale === "ar" ? lesson.arabicTitle : lesson.englishTitle',
  'src/features/teacher/course-editor.tsx: CourseAssignmentsEditor: locale === "ar" ? lesson.arabicTitle : lesson.englishTitle',
  'src/features/teacher/course-editor.tsx: CourseAssignmentsEditor: locale === "ar" ? aim.arabicTitle : aim.englishTitle',
  'src/features/teacher/course-editor.tsx: CourseAssignmentCard: locale === "ar" ? assignment.arabicTitle : assignment.englishTitle',
  'src/features/teacher/course-editor.tsx: CourseAssignmentCard: locale === "ar" ? assignment.arabicInstructions : assignment.englishInstructions',
  'src/features/teacher/course-editor.tsx: CourseAssignmentCard: locale === "ar" ? criterion.arabicDescription : criterion.englishDescription',
  'src/features/teacher/course-editor.tsx: CourseAssignmentCard: locale === "ar" ? criterion.arabicDescription : criterion.englishDescription',
  'src/features/teacher/course-editor.tsx: AssignmentSubmissionCard: locale === "ar" ? assignment.arabicTitle : assignment.englishTitle',
  'src/features/teacher/course-editor.tsx: AssignmentSubmissionCard: locale === "ar" ? criterion.arabicDescription : criterion.englishDescription',
  'src/features/teacher/course-workspace-navigation.tsx: CourseWorkspaceNavigation: locale === "ar" ? "rtl" : "ltr"',
  'src/features/teacher/teacher-courses-management.tsx: localizedTitle: locale === "ar" ? course.arabicTitle : course.englishTitle',
  'src/features/teacher/teacher-courses-management.tsx: TeacherCoursesManagement: locale === "ar" ? "rtl" : "ltr"',
  'src/features/teacher/teacher-courses-management.tsx: TeacherCoursesManagement: locale === "ar" ? "rtl" : "ltr"',
  'src/features/teacher/teacher-student-follow-up.tsx: TeacherStudentFollowUp: locale === "ar" ? "rtl" : "ltr"',
  'src/features/teacher/teacher-student-follow-up.tsx: FormativeSignalCard: locale === "ar" ? signal.courseArabicTitle : signal.courseEnglishTitle',
  'src/features/teacher/teacher-student-follow-up.tsx: FormativeSignalCard: locale === "ar" ? signal.unitArabicTitle : signal.unitEnglishTitle',
  'src/features/teacher/teacher-student-follow-up.tsx: FormativeSignalCard: locale === "ar" ? signal.learningAimArabicTitle : signal.learningAimEnglishTitle',
  'src/features/learning/learning-aim-practice.tsx: tr: locale === "ar" ? ar : en',
  'src/features/learning/comprehensive-practice.tsx: tr: locale === "ar" ? ar : en',
  'src/lib/academic-localization.ts: academicText: locale.startsWith("ar") ? arabicText || englishText : englishText || arabicText',
];
