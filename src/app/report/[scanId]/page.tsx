import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyReportRedirect({
  params,
  searchParams,
}: {
  params: { scanId: string };
  searchParams: { welcome?: string; email?: string };
}) {
  const qs = new URLSearchParams();
  if (searchParams.welcome) qs.set("welcome", searchParams.welcome);
  if (searchParams.email) qs.set("email", searchParams.email);
  const tail = qs.toString();
  redirect(`/scan/${params.scanId}/preview${tail ? `?${tail}` : ""}`);
}
