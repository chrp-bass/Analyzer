import Link from "next/link";
import { LandingHero } from "@/components/LandingHero";
import { Rule } from "@/components/primitives";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 md:px-12 pt-8 md:pt-10 flex items-center justify-between">
        <div className="smallcaps-mono text-ink">CHRP // Sync Intelligence</div>
        <nav className="hidden md:flex items-center gap-8 smallcaps-mono text-ink-soft">
          <Link href="/methodology" className="hover:text-accent transition-colors">
            Methodology
          </Link>
          <Link
            href="/scan"
            className="text-accent hover:text-ink transition-colors"
          >
            Scan a track →
          </Link>
        </nav>
      </header>

      <LandingHero />

      <section className="px-6 md:px-12 mt-24 md:mt-40 pb-24">
        <Rule className="mb-12" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16">
          <Column
            label="01 // Position"
            headline="Built for the artist, not the algorithm."
            body="The score reads like liner notes, not a dashboard. Every line is something you can say out loud to a supervisor without cringing."
          />
          <Column
            label="02 // Translation"
            headline="The language supervisors actually use."
            body="Mode, signature, comparable, pitch line. The framing music supervisors and brand directors recognize on sight."
          />
          <Column
            label="03 // Deliverable"
            headline="One page. Email it. AirDrop it. Print it."
            body="A single, beautifully set PDF that travels. Hand it to your manager. Attach it to the pitch. Keep one in the tour booklet."
          />
        </div>
      </section>

      <footer className="mt-auto px-6 md:px-12 pb-10">
        <Rule className="mb-5" />
        <div className="flex flex-col md:flex-row justify-between gap-4 smallcaps-mono text-ink-soft">
          <div>CHRP // 2026 // scan.chrp.ai</div>
          <div className="flex gap-6">
            <Link href="/methodology" className="hover:text-accent">
              Methodology
            </Link>
            <Link href="/scan" className="hover:text-accent">
              Scan
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Column({
  label,
  headline,
  body,
}: {
  label: string;
  headline: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="smallcaps-mono text-accent">{label}</div>
      <h3 className="font-serif text-[26px] md:text-[30px] leading-[1.15] tracking-tight">
        {headline}
      </h3>
      <p className="text-ink-soft leading-relaxed text-[15px] max-w-[34ch]">
        {body}
      </p>
    </div>
  );
}
