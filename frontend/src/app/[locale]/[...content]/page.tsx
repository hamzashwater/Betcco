import { ContentRoute } from "@/features/public/content-route";

export default async function ContentPage({
  params,
}: {
  params: Promise<{ content: string[] }>;
}) {
  const { content } = await params;
  return <ContentRoute segments={content} />;
}
