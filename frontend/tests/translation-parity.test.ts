import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import arabicMessages from "../messages/ar.json";
import englishMessages from "../messages/en.json";
import { projectTeacherWorkloadSource } from "./helpers/teacher-workload-projection";
import { projectTeacherAuthoringSource } from "./helpers/teacher-authoring-projection";

const parityNamespaces = [
  "navigation",
  "footer",
  "cookieConsent",
  "auth",
  "auth.accountLayout",
  "auth.accountProfile",
  "auth.accountSecurity",
  "auth.studentEmailChange",
  "studentWorkspace",
  "teacherWorkspace",
  "teacherCoursesManagement",
  "teacherStudentFollowUp",
  "teacherWorkloadPresentation",
  "teacherAuthoringPresentation",
  "adminWorkspace",
] as const;

function namespaceValue(value: unknown, namespace: string): unknown {
  return namespace.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || !(key in current))
      return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function shape(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => shape(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      shape(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

describe("shared shell, authentication, account, student, and teacher workspace translation parity", () => {
  it.each(parityNamespaces)("has matching AR/EN keys in %s", (namespace) => {
    const arabicShape = shape(namespaceValue(arabicMessages, namespace)).sort();
    const englishShape = shape(
      namespaceValue(englishMessages, namespace),
    ).sort();
    expect(englishShape).toEqual(arabicShape);
    expect(arabicShape.every(Boolean)).toBe(true);
  });

  it("keeps Teacher copy complete with only the exact UI-D01-11 retired launch-card keys", () => {
    const source = readFileSync(
      "src/features/teacher/teacher-area.tsx",
      "utf8",
    );
    expect(source).not.toMatch(/[\u0600-\u06ff]/u);
    expect(source).not.toMatch(/locale\s*===\s*["']ar["']/u);
    const usedKeys = [
      ...new Set(
        [...source.matchAll(/\bt\(\s*"([^"]+)"/gu)].map((match) => match[1]),
      ),
    ].sort();
    const editorSource = readFileSync(
      "src/features/teacher/course-editor.tsx",
      "utf8",
    );
    const practiceSources = [
      "src/features/teacher/practice-presentation.ts",
      "src/features/teacher/file-picker-copy.ts",
      "src/features/learning/learning-aim-practice.tsx",
      "src/features/learning/comprehensive-practice.tsx",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    const editorKeys = [
      ...(editorSource + practiceSources).matchAll(/\bt\(\s*"([^"]+)"/gu),
    ].map((match) => match[1]);
    const priorSource = projectTeacherWorkloadSource(
      source,
      "src/features/teacher/teacher-area.tsx",
    );
    const retired = [
      ...new Set(
        [...priorSource.matchAll(/\bt\(\s*"([^"]+)"/gu)].map(
          (match) => match[1],
        ),
      ),
    ]
      .filter((key) => !usedKeys.includes(key) && !editorKeys.includes(key))
      .sort();
    expect(retired).toEqual([
      "dashboard.evaluationWorkDescription",
      "dashboard.myCoursesDescription",
      "dashboard.newCourse",
      "dashboard.newCourseDescription",
      "dashboard.walletDescription",
      "shared.open",
    ]);
    const priorEditor = projectTeacherAuthoringSource(
      editorSource,
      "src/features/teacher/course-editor.tsx",
    );
    const retiredEditor = [
      ...new Set(
        [...priorEditor.matchAll(/\bt\(\s*"([^"]+)"/gu)].map(
          (match) => match[1],
        ),
      ),
    ]
      .filter((key) => !editorKeys.includes(key))
      .sort();
    expect(retiredEditor).toEqual(["courseEditor.unavailable"]);
    expect(
      [
        ...new Set([...usedKeys, ...editorKeys, ...retired, ...retiredEditor]),
      ].sort(),
    ).toEqual(shape(englishMessages.teacherWorkspace).sort());
  });

  it("keeps scoped course setup/access, curriculum, and coursework copy in messages while allowing only server bilingual branches", () => {
    const source = readFileSync(
      "src/features/teacher/course-editor.tsx",
      "utf8",
    );
    const file = ts.createSourceFile(
      "course-editor.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const scopedNames = [
      "CreateCourse",
      "TeacherSubjectCreator",
      "ExistingCourseEditor",
      "CourseAnnouncementsEditor",
      "CourseDetailsForm",
      "LearningAccessEditor",
      "contentTypeLabel",
      "statusLabel",
      "CoverManager",
      "OutcomesEditor",
      "CurriculumEditor",
      "ModuleEditor",
      "BtecStructureEditor",
      "LearningAimEditor",
      "TopicEditor",
      "CriterionEditor",
      "LessonEditor",
      "AssignmentFileTypeSelector",
      "CourseAssignmentsEditor",
      "TeacherCourseGradebook",
      "CourseworkDeadlineExtensionPanel",
      "CourseAssignmentCard",
      "AssignmentSubmissionCard",
      "ReviewSubmission",
    ];
    const nodes = file.statements.filter(
      (node) =>
        ts.isFunctionDeclaration(node) &&
        scopedNames.includes(node.name?.text ?? ""),
    );
    expect(nodes).toHaveLength(scopedNames.length);
    const serverBranches: string[] = [];
    for (const node of nodes) {
      expect(node.getText(file)).not.toMatch(/[\u0600-\u06ff]/u);
      const visit = (child: ts.Node) => {
        if (
          ts.isConditionalExpression(child) &&
          child.condition.getText(file) === 'locale === "ar"'
        ) {
          expect(ts.isPropertyAccessExpression(child.whenTrue)).toBe(true);
          expect(ts.isPropertyAccessExpression(child.whenFalse)).toBe(true);
          serverBranches.push(
            `${child.whenTrue.getText(file)} / ${child.whenFalse.getText(file)}`,
          );
        }
        ts.forEachChild(child, visit);
      };
      visit(node);
    }
    expect(serverBranches).toEqual([
      "plan.specializationArabicName / plan.specializationEnglishName",
      "plan.gradeArabicName / plan.gradeEnglishName",
      "course.data.arabicTitle / course.data.englishTitle",
      "announcement.arabicTitle / announcement.englishTitle",
      "item.arabicTitle / item.englishTitle",
      "course.arabicTitle / course.englishTitle",
      "item.arabicTitle / item.englishTitle",
      "aim.arabicTitle / aim.englishTitle",
      "topic.arabicTitle / topic.englishTitle",
      "criterion.arabicDescription / criterion.englishDescription",
      "lesson.arabicTitle / lesson.englishTitle",
      "aim.arabicTitle / aim.englishTitle",
      "topic.arabicTitle / topic.englishTitle",
      "lesson.arabicTitle / lesson.englishTitle",
      "lesson.arabicTitle / lesson.englishTitle",
      "aim.arabicTitle / aim.englishTitle",
      "assignment.arabicTitle / assignment.englishTitle",
      "assignment.arabicInstructions / assignment.englishInstructions",
      "criterion.arabicDescription / criterion.englishDescription",
      "criterion.arabicDescription / criterion.englishDescription",
      "assignment.arabicTitle / assignment.englishTitle",
      "criterion.arabicDescription / criterion.englishDescription",
    ]);
  });

  it.each(["ar", "en"])("has no duplicate JSON keys in %s", (locale) => {
    const source = readFileSync(`messages/${locale}.json`, "utf8");
    const file = ts.parseJsonText(`${locale}.json`, source);
    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const keys = node.properties.map((property) =>
          property.name?.getText(file),
        );
        expect(new Set(keys).size).toBe(keys.length);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  });
});
