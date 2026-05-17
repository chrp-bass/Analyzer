"use client";

import dynamic from "next/dynamic";
import { Track } from "@/lib/fixtures/tracks";

const ReportViewClient = dynamic(
  () =>
    import("@/components/ReportViewClient").then((m) => m.ReportViewClient),
  {
    ssr: false,
    loading: () => (
      <section className="px-6 md:px-12 py-12 md:py-16 flex-1 flex items-center justify-center">
        <div className="smallcaps-mono text-ink-soft">Loading report…</div>
      </section>
    ),
  },
);

export function ReportView({ track }: { track: Track }) {
  return <ReportViewClient track={track} />;
}
