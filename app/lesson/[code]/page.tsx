import { Suspense } from "react";
import { SavedLesson } from "@/components/SavedLesson";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Suspense><SavedLesson code={code} /></Suspense>;
}
