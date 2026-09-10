import { TeacherArea } from "@/features/teacher/teacher-area";

export default async function TeacherPage({
  params,
}: {
  params: Promise<{ segment?: string[] }>;
}) {
  const { segment = [] } = await params;
  return <TeacherArea segment={segment} />;
}
