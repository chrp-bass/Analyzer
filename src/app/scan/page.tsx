import { ScanFlow } from "@/components/ScanFlow";
import Link from "next/link";

export default function ScanPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 md:px-12 pt-6 md:pt-8 flex items-center justify-between">
        <Link
          href="/"
          className="font-sans font-black text-[16px] tracking-wider hover:text-magenta"
        >
          CHRP
        </Link>
        <Link
          href="/methodology"
          className="font-sans text-[12px] text-ink-soft hover:text-chrp-black"
        >
          Methodology
        </Link>
      </header>
      <ScanFlow />
    </main>
  );
}
