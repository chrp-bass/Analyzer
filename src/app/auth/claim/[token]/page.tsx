import { MagicLinkClaim } from "@/components/auth/MagicLinkClaim";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

export default function ClaimPage({
  params,
}: {
  params: { token: string };
}) {
  return (
    <div className="product-shell">
      <SiteHeader showCta={false} />
      <main>
        <MagicLinkClaim token={params.token} />
      </main>
    </div>
  );
}
