export function studioFixture() {
  return {
    teachers: [
      {
        id: "teacher-a",
        displayName: "Synthetic Teacher — معلم للاختبار",
        email: "teacher@example.test",
        isFrozen: false,
        profile: {
          arabicBio: "سيرة عربية",
          englishBio: "English bio",
          arabicSpecializations: "العلوم",
          englishSpecializations: "Science",
          isPublic: true,
        },
      },
      {
        id: "teacher-b",
        displayName: "Second teacher",
        email: "second@example.test",
        isFrozen: false,
      },
      {
        id: "frozen",
        displayName: "Frozen teacher",
        email: "frozen@example.test",
        isFrozen: true,
      },
    ],
    courses: [
      {
        id: "course-a",
        arabicTitle: "دورة عربية طويلة للاختبار",
        englishTitle: "Synthetic course with a long English title",
        price: 12.345,
        currency: "JOD",
      },
      {
        id: "course-b",
        arabicTitle: "دورة ثانية",
        englishTitle: "Second course",
        price: 2,
        currency: "JOD",
      },
    ],
    blog: [
      {
        id: "article-a",
        slug: "existing-article",
        arabicTitle: "مقال عربي محفوظ",
        englishTitle: "Existing synthetic article",
        isPublished: true,
        publishedAtUtc: "2026-10-29T10:00:00Z",
      },
    ],
    packages: [
      {
        id: "package-a",
        slug: "existing-package",
        arabicTitle: "باقة محفوظة",
        englishTitle: "Existing package",
        arabicDescription: "وصف الباقة",
        englishDescription: "Package description",
        price: 12.345,
        currency: "JOD",
        availableFromUtc: "2026-10-29T10:00:00Z",
        availableUntilUtc: "2026-11-29T10:00:00Z",
        isPublished: true,
        courseIds: ["course-a"],
      },
    ],
    sessions: [
      {
        id: "session-a",
        courseId: "course-a",
        arabicTitle: "جلسة عربية طويلة للاختبار",
        englishTitle: "Existing synthetic live session",
        provider: "Manual",
        startsAtUtc: "2026-10-29T10:00:00Z",
        isPublished: false,
      },
      {
        id: "session-b",
        arabicTitle: "جلسة عامة",
        englishTitle: "General session",
        provider: "Zoom",
        startsAtUtc: "2026-10-30T10:00:00Z",
        isPublished: true,
      },
    ],
    providers: [
      {
        id: "Manual",
        arabicName: "يدوي",
        englishName: "Manual",
        supportsManagedMeetings: false,
        arabicDescription: "أدخل رابط الاجتماع المعتمد.",
        englishDescription: "Supply the approved meeting link.",
      },
      {
        id: "Zoom",
        arabicName: "زوم",
        englishName: "Zoom",
        supportsManagedMeetings: false,
        arabicDescription: "رابط زوم المعتمد.",
        englishDescription: "Approved Zoom meeting link.",
      },
    ],
    students: {
      items: [
        {
          id: "student-a",
          displayName: "Synthetic student — طالب للاختبار",
          email: "student@example.test",
        },
        {
          id: "student-b",
          displayName: "Second student",
          email: "second-student@example.test",
        },
      ],
    },
    attendance: (["Present", "Late", "Absent", "Excused"] as const).map(
      (status, i) => ({
        id: "attendance-" + i,
        studentUserId: "student-" + i,
        studentName: "Synthetic learner " + i,
        status,
        joinedAtUtc: "2026-10-29T10:00:00Z",
      }),
    ),
  };
}
