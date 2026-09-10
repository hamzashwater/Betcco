import { StudentArea } from "@/features/student/student-area";

export default async function StudentPage({
  params,
}: {
  params: Promise<{ segment?: string[] }>;
}) {
  const { segment = [] } = await params;
  return <StudentArea segment={segment} />;
}
