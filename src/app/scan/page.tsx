import { ScanFlow } from "@/components/scan/ScanFlow";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const dynamic = "force-dynamic";

export default function ScanPage() {
  return (
    <div className="product-shell">
      <SiteHeader showCta={false} />
      <main>
        <ScanFlow />
      </main>
      <SiteFooter />
    </div>
  );
}
