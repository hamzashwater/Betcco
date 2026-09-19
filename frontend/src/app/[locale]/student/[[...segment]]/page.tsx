import { StudentArea } from "@/features/student/student-area";

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ segment?: string[] }>;
  searchParams: Promise<{ lessonId?: string | string[] }>;
}) {
  const { segment = [] } = await params;
  const { lessonId } = await searchParams;
  return (
    <StudentArea
      segment={segment}
      requestedLessonId={Array.isArray(lessonId) ? lessonId[0] : lessonId}
    />
  );
}
