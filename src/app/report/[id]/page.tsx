import { notFound } from "next/navigation";
import Link from "next/link";
import { getReportById, reports } from "@/lib/fixtures/tracks";
import { ReportPage } from "@/components/ReportPage";

export async function generateStaticParams() {
  return Object.keys(reports).map((id) => ({ id }));
}

export default function Page({ params }: { params: { id: string } }) {
  const report = getReportById(params.id);
  if (!report) return notFound();
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 md:px-12 pt-6 md:pt-8 flex items-center justify-between text-sm">
        <Link
          href="/"
          className="font-sans font-black tracking-wider text-chrp-black hover:text-magenta"
        >
          CHRP
        </Link>
        <Link
          href="/scan"
          className="font-sans text-ink-soft hover:text-chrp-black"
        >
          ← Scan another
        </Link>
      </header>
      <ReportPage report={report} id={params.id} />
    </main>
  );
}
