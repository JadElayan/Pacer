import { Suspense } from "react";
import { TopicPage } from "@/components/TopicPage";
export default async function Page({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  return <Suspense><TopicPage code={code} id={id} /></Suspense>;
}
