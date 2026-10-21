import { projectPlayerWorkspaceSource } from "./player-workspace-projection";
import { projectTeacherWorkloadSource } from "./teacher-workload-projection";

// Only these two reviewed dashboard presentation/link seams may be reversed.
// Missing, duplicated or altered seams fail closed; all historical hashes stay.
const seams = [
  {
    approved:
      "              featured\n              continuation\n            />",
    previous: "              featured\n            />",
  },
  {
    approved:
      '                  href={`/${locale}/student/learn/${assignment.courseId}${assignment.lessonId ? `?lessonId=${encodeURIComponent(assignment.lessonId)}` : ""}`}',
    previous:
      "                  href={`/${locale}/student/learn/${assignment.courseId}`}",
  },
];

export function projectStudentContinuitySource(source: string, path: string) {
  source = projectTeacherWorkloadSource(source, path);
  if (path !== "src/features/student/student-area.tsx") return source;
  const original = projectPlayerWorkspaceSource(source, path).replace(
    /\r\n/g,
    "\n",
  );
  let result = original;
  for (const { approved, previous } of seams) {
    if (result.split(approved).length !== 2) return original;
    result = result.replace(approved, previous);
  }
  return result;
}
