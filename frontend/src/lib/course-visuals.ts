import type { CourseSummary } from "@/types/api";

export type CourseVisual = {
  src: string;
  objectPosition: string;
};

const technology: CourseVisual = {
  src: "/images/betcco/course-it.png",
  objectPosition: "center",
};

const business: CourseVisual = {
  src: "/images/betcco/course-business.png",
  objectPosition: "center",
};

const engineering: CourseVisual = {
  src: "/images/betcco/course-engineering.png",
  objectPosition: "center",
};

export function getCourseVisual(
  course: Pick<
    CourseSummary,
    "id" | "slug" | "specialization" | "subject" | "track" | "coverImageKey"
  >,
): CourseVisual {
  if (course.coverImageKey && !course.coverImageKey.startsWith("seed/")) {
    return {
      src: `/api/v1/catalog/courses/${course.id}/cover`,
      objectPosition: "center",
    };
  }
  const identity = [
    course.slug,
    course.specialization,
    course.subject,
    course.track,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

  if (/(business|\u0623\u0639\u0645\u0627\u0644)/.test(identity))
    return business;
  if (/(engineering|\u0647\u0646\u062f\u0633)/.test(identity))
    return engineering;
  return technology;
}

export function getTrackVisual(
  trackSlug: string,
  isBtecFocused: boolean,
): CourseVisual {
  if (/(business|\u0623\u0639\u0645\u0627\u0644)/.test(trackSlug))
    return business;
  if (/(engineering|\u0647\u0646\u062f\u0633)/.test(trackSlug))
    return engineering;
  return isBtecFocused ? technology : business;
}
