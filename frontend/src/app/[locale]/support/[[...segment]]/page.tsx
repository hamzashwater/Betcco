import { SupportAccountArea } from "@/features/support/support-account-area";

export default async function SupportPage({
  params,
}: {
  params: Promise<{ segment?: string[] }>;
}) {
  const { segment = [] } = await params;
  return <SupportAccountArea segment={segment} />;
}
