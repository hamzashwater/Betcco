import { CourseDetailView } from "@/features/courses/course-detail";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CourseDetailView slug={slug} />;
}
