// Synthetic server contracts only — MOCKED UI-CONTRACT EVIDENCE.
export const workspaceCourseId = "00000000-0000-0000-0000-000000000801";
export const workspaceLessonIds = {
  Text: "text-lesson",
  Video: "video-lesson",
  Assignment: "assignment-lesson",
  Locked: "locked-lesson",
  Completed: "completed-lesson",
} as const;
export function workspacePlayer(
  locale: string,
  selected: string = workspaceLessonIds.Text,
) {
  const lessons = Object.entries(workspaceLessonIds).map(([kind, id]) => ({
    id,
    title:
      locale === "ar"
        ? `${kind} — درس تطبيقي طويل يحافظ على سياق التعلم والمهمة الحالية`
        : `${kind} — Application development lesson`,
    type: kind === "Locked" || kind === "Completed" ? "Text" : kind,
    body:
      locale === "ar"
        ? "محتوى تعليمي تجريبي لقراءة الفكرة وتطبيقها في المهمة الحالية، مع الحفاظ على سياق الوحدة وأهداف التعلم.\n".repeat(
            5,
          )
        : "Synthetic learning content. Read the concept and apply it to the current task.\n".repeat(
            4,
          ),
    durationSeconds: kind === "Video" ? 100 : 0,
    isLocked: kind === "Locked",
    lockReason: kind === "Locked" ? "CompletePrerequisite" : undefined,
    isCompleted: kind === "Completed",
    lastPositionSeconds: kind === "Video" ? 42 : 0,
    video:
      kind === "Video"
        ? {
            id: "video-file",
            displayName: "workspace-video.mp4",
            contentType: "video/mp4",
          }
        : undefined,
    resources:
      kind === "Locked"
        ? []
        : [
            {
              id: "lesson-resource",
              displayName: "Lesson reference.pdf",
              contentType: "application/pdf",
            },
          ],
  }));
  const index = lessons.findIndex((l) => l.id === selected);
  return {
    id: workspaceCourseId,
    title:
      locale === "ar"
        ? "تطوير التطبيقات وإدارة المشاريع العملية"
        : "Application development and project delivery",
    resumeLessonId: workspaceLessonIds.Text,
    currentLessonId: selected,
    previousLessonId: lessons[index - 1]?.id,
    nextLessonId: lessons[index + 1]?.id,
    requestedLessonRejected: false,
    modules: [
      {
        id: "unit-one",
        title: locale === "ar" ? "الوحدة الأولى" : "Unit one",
        isLocked: false,
        lessons,
      },
    ],
  };
}
export function workspaceUnits(final = false) {
  const aim = {
    id: "aim-first",
    code: "A",
    arabicTitle: "الهدف الأول",
    englishTitle: "First Aim",
    isUnlocked: true,
    contentTotal: 2,
    contentCompleted: 2,
    contentComplete: true,
    assignmentId: "practice-first",
    practiceAvailable: false,
    practiceStatus: "Finalized",
    isComplete: true,
    maxAttempts: 2,
    attemptsUsed: 1,
    attemptsRemaining: 1,
    canStartNewAttempt: false,
    trainingOutcome: "Merit",
    bestTrainingOutcome: "Merit",
    attemptHistory: [],
  };
  return [
    {
      id: "unit-one",
      arabicTitle: "الوحدة الأولى",
      englishTitle: "Unit one",
      aims: [
        aim,
        {
          ...aim,
          id: "aim-target",
          code: "B",
          arabicTitle: "هدف التطبيق العملي",
          englishTitle: "Application Aim",
          assignmentId: "practice-target",
          practiceAvailable: !final,
          practiceStatus: final ? "Finalized" : "Draft",
          isComplete: final,
          assignmentArabicTitle: "نشاط الهدف ب",
          assignmentEnglishTitle: "Aim B activity",
          arabicInstructions: "تعليمات تجريبية للنشاط",
          englishInstructions: "Synthetic practice instructions",
        },
      ],
      finalPractice: {
        assignmentId: "final-target",
        arabicTitle: "التدريب الختامي للوحدة",
        englishTitle: "Final Unit Practice",
        arabicInstructions: "تعليمات التدريب الختامي",
        englishInstructions: "Synthetic final practice",
        isAvailable: final,
        status: final ? "Available" : "Locked",
        isTrainingComplete: false,
        unavailableReason: final ? undefined : "LearningAimsIncomplete",
        criteria: [],
        resources: [],
      },
    },
  ];
}
export const workspaceMine = [
  {
    id: "submission-target",
    assignmentId: "practice-target",
    status: "Draft",
    currentVersionNumber: 1,
    versions: [{ versionNumber: 1, files: [] }],
  },
];
export function workspaceResponse(
  path: string,
  locale: string,
  lessonId?: string,
  final = false,
): unknown {
  if (path.startsWith(`/learning/courses/${workspaceCourseId}/player`))
    return workspacePlayer(locale, lessonId);
  if (
    path.startsWith(
      `/student/courses/${workspaceCourseId}/learning-aim-practice`,
    )
  )
    return workspaceUnits(final);
  if (path === "/student/assignments/mine") return workspaceMine;
  if (path.startsWith(`/student/courses/${workspaceCourseId}/assignments`))
    return [];
  if (path.startsWith("/student-tools/overview"))
    return {
      notes: Object.values(workspaceLessonIds).map((lessonId) => ({
        lessonId,
        body: "Saved note",
      })),
      bookmarks: [],
      calendar: [],
      certificates: [],
      upcomingAssignments: [],
      unreadNotifications: 0,
      achievements: [],
      pendingActions: [],
    };
  if (path.startsWith(`/learning/courses/${workspaceCourseId}/resources`))
    return [
      {
        id: "resource-one",
        lessonId: workspaceLessonIds.Text,
        lessonTitle: "Lesson reference",
        displayName: "Workspace guide.pdf",
        contentType: "application/pdf",
        category: "PDF",
      },
    ];
  if (
    path.startsWith(`/student-tools/courses/${workspaceCourseId}/announcements`)
  )
    return [
      {
        id: "announcement",
        title: locale === "ar" ? "إعلان الدورة" : "Course announcement",
        body: "Synthetic announcement",
        publishedAtUtc: "2026-10-01T10:00:00Z",
      },
    ];
  if (
    path.startsWith(`/course-community/courses/${workspaceCourseId}/questions`)
  )
    return [];
  if (path.startsWith(`/gradebook/student/courses/${workspaceCourseId}`))
    return {
      courseId: workspaceCourseId,
      courseTitle: "Course",
      lessonProgressPercent: 20,
      lessonsCompleted: 1,
      lessonsTotal: 5,
      assignmentsCompleted: 0,
      assignmentsTotal: 1,
      predictedGrade: {
        predictedGrade: "NotYetAchieved",
        passAchieved: 0,
        passRequired: 1,
        meritAchieved: 0,
        meritRequired: 1,
        distinctionAchieved: 0,
        distinctionRequired: 1,
      },
      units: [],
      criteria: [],
    };
  return undefined;
}
