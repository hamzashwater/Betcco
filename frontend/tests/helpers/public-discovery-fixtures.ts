import type { CourseDetail } from "@/types/api";

export const course = {
  id: "raw-course-id",
  slug: "raw-course",
  title: "RAW Course دورة",
  description: "RAW Description وصف",
  track: "RAW Track مسار",
  grade: "RAW Grade صف",
  specialization: "RAW Specialization تخصص",
  subject: "RAW Subject مادة",
  price: 27,
  currency: "JOD",
  isFree: false,
  lessonCount: 4,
  durationMinutes: 60,
  teacherName: "RAW Teacher معلم",
};
export const taxonomy = {
  tracks: [
    {
      id: "track-1",
      slug: "raw-track",
      name: course.track,
      isBtecFocused: true,
    },
    {
      id: "track-2",
      slug: "other-track",
      name: "Other RAW track",
      isBtecFocused: false,
    },
  ],
  grades: [
    {
      id: "grade-1",
      slug: "raw-grade",
      learningTrackId: "track-1",
      name: course.grade,
    },
  ],
  specializations: [
    {
      id: "specialization-1",
      slug: "raw-specialization",
      learningTrackId: "track-1",
      name: course.specialization,
    },
  ],
  subjects: [
    {
      id: "subject-1",
      slug: "raw-subject",
      specializationId: "specialization-1",
      name: course.subject,
    },
  ],
};
export const detail: CourseDetail = {
  course,
  outcomes: [{ arabic: "نتيجة خادمية", english: "Server outcome" }],
  skills: [{ arabic: "مهارة خادمية", english: "Server skill" }],
  modules: [
    {
      id: "module-1",
      title: "RAW Module وحدة",
      lessons: [
        {
          id: "lesson-1",
          title: "RAW Lesson درس",
          durationSeconds: 180,
          isPreview: true,
          type: "Text",
        },
      ],
    },
  ],
};
export const preview = {
  id: "lesson-1",
  title: "RAW Preview معاينة",
  body: "RAW Body نص",
  type: "Text",
  durationSeconds: 180,
  resources: [
    {
      id: "resource-1",
      displayName: "RAW Resource مورد",
      contentType: "text/plain",
      externalUrl: "https://example.com/resource",
    },
  ],
};
