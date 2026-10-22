import type { ComponentProps } from "react";
import type { CurriculumEditor } from "@/features/teacher/course-editor";
// MOCKED UI-CONTRACT EVIDENCE: synthetic IDs/content, never production seeds.
export const authoringCourse = {
  id: "course-authoring",
  isBtecFocused: true,
  deliveryPlanId: "plan-raw",
  qualificationVersionId: "qualification-version-raw",
  arabicTitle: "دورة تطبيقية طويلة لبناء المحتوى ومراجعة أعمال الطلاب",
  englishTitle: "Authoring course",
  arabicDescription: "وصف الدورة من الخادم",
  englishDescription: "RAW server course description",
  status: "Draft",
  price: 12.5,
  isFree: false,
  hasCover: false,
  outcomes: [
    {
      id: "outcome-raw",
      arabicText: "ناتج تعلّم من الخادم",
      englishText: "RAW learning outcome",
      sortOrder: 1,
    },
  ],
  modules: [
    {
      id: "unit-raw",
      unitDefinitionId: "unit-definition-raw",
      arabicTitle: "الوحدة الأولى للحوسبة التطبيقية",
      englishTitle: "Applied unit",
      unitCode: "U1",
      arabicDescription: "سياق الوحدة",
      englishDescription: "RAW unit context",
      guidedLearningHours: 60,
      credits: 10,
      qualificationLevel: "L3",
      publicationStatus: "Published",
      sortOrder: 1,
      learningAims: [
        {
          id: "aim-raw",
          code: "A",
          arabicTitle: "هدف التعلم التطبيقي",
          englishTitle: "Applied aim",
          arabicDescription: "وصف الهدف",
          englishDescription: "RAW aim description",
          publicationStatus: "Published",
          sortOrder: 1,
          topics: [
            {
              id: "topic-raw",
              arabicTitle: "موضوع التطبيق",
              englishTitle: "Applied topic",
              arabicDescription: "وصف الموضوع",
              englishDescription: "RAW topic description",
              publicationStatus: "Published",
              sortOrder: 1,
            },
          ],
        },
      ],
      criteria: [
        {
          id: "criterion-raw",
          btecLearningAimId: "aim-raw",
          code: "A.P1",
          band: "Pass",
          arabicDescription: "معيار تكويني من الخادم",
          englishDescription: "RAW formative criterion",
          publicationStatus: "Published",
          sortOrder: 1,
        },
      ],
      lessons: [
        {
          id: "lesson-raw",
          btecLearningAimId: "aim-raw",
          btecTopicId: "topic-raw",
          arabicTitle: "درس تطبيق المحتوى",
          englishTitle: "Applied lesson",
          arabicBody: "محتوى الدرس",
          englishBody: "RAW lesson body",
          type: "Article",
          durationSeconds: 120,
          isPreview: false,
          publicationStatus: "Published",
          sortOrder: 1,
          resources: [
            {
              id: "resource-raw",
              displayName: "RAW resource.pdf",
              contentType: "application/pdf",
              scanStatus: "Clean",
              isDownloadable: true,
            },
          ],
        },
      ],
    },
  ],
} satisfies ComponentProps<typeof CurriculumEditor>["course"];
export const authoringAssignment = {
  id: "assignment-raw",
  courseId: authoringCourse.id,
  courseModuleId: "unit-raw",
  lessonId: "lesson-raw",
  btecLearningAimId: "aim-raw",
  arabicTitle: "مهمة تطبيقية من الخادم",
  englishTitle: "RAW coursework assignment",
  arabicInstructions: "تعليمات المهمة",
  englishInstructions: "RAW assignment instructions",
  dueAtUtc: "2030-01-01T12:00:00Z",
  maxSubmissionAttempts: 2,
  allowResubmission: true,
  maxFileSizeBytes: 104857600,
  allowedFileExtensions: [".pdf"],
  maxScore: 100,
  isPublished: true,
  publicationStatus: "Published",
  resources: [
    {
      id: "assignment-resource",
      displayName: "RAW assignment.pdf",
      contentType: "application/pdf",
      scanStatus: "Clean",
    },
  ],
  criteria: [
    {
      id: "assignment-criterion",
      btecCriterionId: "criterion-raw",
      code: "A.P1",
      band: "Pass",
      arabicDescription: "معيار المهمة",
      englishDescription: "RAW assignment criterion",
      sortOrder: 1,
    },
  ],
};
export const authoringSubmission = {
  id: "submission-raw",
  assignmentId: "assignment-raw",
  courseId: authoringCourse.id,
  arabicTitle: authoringAssignment.arabicTitle,
  englishTitle: authoringAssignment.englishTitle,
  studentUserId: "student-raw",
  status: "Submitted",
  currentVersionNumber: 1,
  submittedAtUtc: "2026-10-01T10:00:00Z",
  files: [
    {
      id: "submission-file",
      originalFileName: "RAW submission.pdf",
      contentType: "application/pdf",
      lengthBytes: 42,
      scanStatus: "Clean",
    },
  ],
  feedback: [
    {
      body: "RAW supplied feedback",
      requestsResubmission: false,
      isPrivate: false,
      createdAtUtc: "2026-10-01T11:00:00Z",
    },
  ],
};
export const authoringPractice = {
  id: "aim-practice-raw",
  btecLearningAimId: "aim-raw",
  arabicTitle: "تدريب الهدف من الخادم",
  englishTitle: "RAW Aim formative practice",
  maxSubmissionAttempts: 2,
};
export const authoringFinalPractice = {
  ...authoringAssignment,
  id: "unit-practice-raw",
  courseModuleId: "unit-raw",
  arabicTitle: "تدريب الوحدة من الخادم",
  englishTitle: "RAW Unit formative practice",
  isPublished: false,
  publicationStatus: "Draft",
  criteria: [],
};
export const authoringPracticeSubmission = {
  id: "practice-submission",
  courseAssignmentId: "aim-practice-raw",
  studentUserId: "student-raw",
  status: "Submitted",
  currentVersionNumber: 1,
  maxSubmissionAttempts: 2,
  files: [{ id: "practice-file", originalFileName: "RAW practice.pdf" }],
  attemptHistory: [],
};
export function authoringResponse(
  path: string,
  course: typeof authoringCourse = authoringCourse,
): unknown {
  const p = path.split("?")[0];
  if (p === `/teacher/courses/${course.id}`) return course;
  if (p.endsWith("/academic-units"))
    return [
      {
        id: "unit-definition-raw",
        deliveryPlanEntryId: "entry-raw",
        code: "U1",
        arabicTitle: "الوحدة الأكاديمية",
        englishTitle: "RAW academic unit",
        qualificationVersionId: "qualification-version-raw",
        qualificationCode: "Q",
        versionCode: "V1",
        termCode: "T1",
      },
    ];
  if (p.endsWith("/learning-access"))
    return { items: [], prerequisiteCourses: [], rules: [], prerequisites: [] };
  if (p.endsWith("/comprehensive-practice/submissions"))
    return [
      {
        ...authoringPracticeSubmission,
        id: "final-submission",
        courseAssignmentId: "unit-practice-raw",
      },
    ];
  if (p.endsWith("/comprehensive-practice")) return [authoringFinalPractice];
  if (p.endsWith("/practice/submissions")) return [authoringPracticeSubmission];
  if (p.endsWith("/practice")) return [authoringPractice];
  if (p.endsWith("/assignments")) return [authoringAssignment];
  if (p === "/teacher/assignments/submissions") return [authoringSubmission];
  if (p.startsWith("/gradebook/"))
    return {
      students: [
        {
          studentUserId: "student-raw",
          studentName: "RAW student",
          lessonProgressPercent: 50,
          assignmentsCompleted: 1,
          assignmentsTotal: 2,
          predictedGrade: { predictedGrade: "Merit" },
        },
      ],
      totalStudents: 1,
      page: 1,
      pageSize: 25,
    };
  if (p.endsWith("/deadline-extensions/eligible-students"))
    return [{ studentUserId: "student-raw", displayName: "RAW student" }];
  if (p.endsWith("/deadline-extensions")) return [];
  return [];
}
