import { notFound } from "next/navigation";
import Link from "next/link";
import { getTrackById, tracks } from "@/lib/fixtures/tracks";
import { ReportView } from "@/components/ReportView";

export async function generateStaticParams() {
  return tracks.map((t) => ({ id: t.id }));
}

export default function ReportPage({ params }: { params: { id: string } }) {
  const track = getTrackById(params.id);
  if (!track) return notFound();
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 md:px-12 pt-8 md:pt-10 flex items-center justify-between">
        <Link href="/" className="smallcaps-mono text-ink hover:text-accent">
          CHRP // Sync Intelligence
        </Link>
        <Link
          href={`/scan/results/${track.id}`}
          className="smallcaps-mono text-ink-soft hover:text-accent"
        >
          ← Back to report
        </Link>
      </header>
      <ReportView track={track} />
    </main>
  );
}
