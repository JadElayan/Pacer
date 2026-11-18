import { JoinClass } from "@/components/JoinClass";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinClass code={code} />;
}
