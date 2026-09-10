import { AdminArea } from "@/features/admin/admin-area";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ segment?: string[] }>;
}) {
  const { segment = [] } = await params;
  return <AdminArea segment={segment} />;
}
