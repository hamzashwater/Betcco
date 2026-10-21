import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-04-student-baseline.json";
import {
  projectStudentStateSource,
  withoutStudentStateAdditions,
} from "./helpers/student-state-projection";
import { functionSource } from "./helpers/runtime-student-i18n-audit";
import { projectAdminStateSource } from "./helpers/admin-state-projection";
import { projectEvaluationPresentationSource } from "./helpers/evaluation-presentation-projection";

const source = readFileSync("src/features/student/student-area.tsx", "utf8");
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

describe("Student adoption retains the complete source and transport boundary", () => {
  it("projects only exact approved presentation hunks to independently captured merged main", () => {
    expect(baseline.base).toBe("04fdcb3b0cca3eb659dd78dd567c3660268e4abf");
    expect(hash(projectStudentStateSource(source))).toBe(baseline.sourceHash);
  });

  it.each([
    ["mine.data &&", "true &&"],
    ["mine.data &&", "mine.isSuccess &&"],
    ['["student-course-assignments", courseId]', '["wrong-query", courseId]'],
    ['body.set("file", file)', 'body.set("upload", file)'],
    ["for (const file of files)", "for (const file of files.reverse())"],
    [
      "disabled={submit.isPending || deadlinePassed}",
      "disabled={submit.isPending}",
    ],
    [
      "href={`/api/v1/assignments/${assignment.id}/resources/${resource.id}`}",
      'href="/changed"',
    ],
    [
      "(upload.error ?? submit.error)?.message",
      't("coursework.errors.action")',
    ],
    ['submission?.status !== "Graded"', 'submission?.status !== "Submitted"'],
    ["assignment.effectiveDueAtUtc &&", "assignment.dueAtUtc &&"],
    ["setActive(undefined)", "setActive(active)"],
    ['<MutationOutcome kind="error">', '<MutationOutcome kind="success">'],
    [
      '<QueryState kind="error" title={t("coursework.errors.load")} />',
      '<QueryState kind="empty" title={t("coursework.errors.load")} />',
    ],
    ["<AiTutorPanel courseId={courseId} lessonId={lesson.id} />", "<div />"],
    [
      '["student-course-gradebook", courseId, locale]',
      '["student-course-gradebook", courseId]',
    ],
  ])("rejects unapproved drift at %s", (from, to) => {
    expect(source).toContain(from);
    expect(hash(projectStudentStateSource(source.replace(from, to)))).not.toBe(
      baseline.sourceHash,
    );
  });

  it("rejects duplicated and missing presentation hunks", () => {
    const seam = baseline.seams[0].approved;
    for (const replacement of ["", seam + seam])
      expect(
        hash(projectStudentStateSource(source.replace(seam, replacement))),
      ).not.toBe(baseline.sourceHash);
  });

  it("leaves native queries, mutations, invalidations and domain guards intact", () => {
    const before = projectStudentStateSource(source);
    const currentFunction = functionSource(source, "CourseAssignmentPanel");
    const priorFunction = functionSource(before, "CourseAssignmentPanel");
    const marker = "  const visible =";
    expect(currentFunction.slice(0, currentFunction.indexOf(marker))).toBe(
      priorFunction.slice(0, priorFunction.indexOf(marker)),
    );
    expect(currentFunction).toContain(
      'if (!active) throw new Error(t("coursework.errors.startBeforeUpload"))',
    );
    expect(currentFunction).toContain(
      'if (!active) throw new Error(t("coursework.errors.startBeforeSubmit"))',
    );
  });

  it("keeps protected files byte-identical after exact authorized Admin state projection", () => {
    for (const [path, expected] of Object.entries(baseline.protectedFiles)) {
      const file = readFileSync(path);
      expect(
        hash(
          path === "src/features/admin/admin-area.tsx"
            ? projectAdminStateSource(file.toString())
            : path === "src/features/student/student-resit-workflow.tsx"
              ? projectEvaluationPresentationSource(file.toString(), path)
              : file,
        ),
        path,
      ).toBe(expected);
    }
  });

  it.each(["en", "ar"] as const)(
    "adds exactly three %s Student state leaves and rejects changed copy",
    (locale) => {
      const value = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
      const additions = baseline.additions[locale];
      expect(value.studentWorkspace.gradebook.loadError).toBe(
        additions.gradebook.loadError,
      );
      expect(value.studentWorkspace.gradebook.emptyCriteria).toBe(
        additions.gradebook.emptyCriteria,
      );
      expect(value.studentWorkspace.coursework.empty).toBe(
        additions.coursework.empty,
      );
      const changed = structuredClone(value);
      changed.studentWorkspace.coursework.empty += " Changed";
      expect(() => withoutStudentStateAdditions(changed)).toThrow(
        "Unverified Student query-state additions",
      );
      expect(
        withoutStudentStateAdditions(value).studentWorkspace,
      ).not.toHaveProperty("coursework.empty");
    },
  );
});
