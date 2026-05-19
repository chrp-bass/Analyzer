import { MagicLinkClaim } from "@/components/auth/MagicLinkClaim";

export const dynamic = "force-dynamic";

export default function ClaimPage({
  params,
}: {
  params: { token: string };
}) {
  return <MagicLinkClaim token={params.token} />;
}
