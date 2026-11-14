import { Suspense } from "react";
import { Classroom } from "@/components/Classroom";
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Suspense><Classroom code={code} /></Suspense>;
}
