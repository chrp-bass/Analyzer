import { ScanFlow } from "@/components/ScanFlow";
import Link from "next/link";

export default function ScanPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 md:px-12 pt-8 md:pt-10 flex items-center justify-between">
        <Link href="/" className="smallcaps-mono text-ink hover:text-accent">
          CHRP // Sync Intelligence
        </Link>
        <Link
          href="/methodology"
          className="smallcaps-mono text-ink-soft hover:text-accent"
        >
          Methodology
        </Link>
      </header>
      <ScanFlow />
    </main>
  );
}
