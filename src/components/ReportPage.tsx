import {
  ReportPayload,
  ScoreRow,
  MODE_COLORS,
} from "@/lib/fixtures/tracks";
import { PolygonRadar } from "@/components/PolygonRadar";
import { polygonFromChrpScores } from "@/lib/polygon";

const RANK_CLASS_TEXT: Record<ScoreRow["rank_class"], string> = {
  high: "text-kelly-green",
  mid: "text-ink-soft",
  low: "text-plum",
};

export function confidenceColor(c: string | null) {
  if (c === "High") return "text-kelly-green";
  if (c === "Moderate") return "text-ink-soft";
  if (c === "Preliminary") return "text-plum";
  return "text-ink-soft";
}

export function ReportPage({
  report,
  id,
}: {
  report: ReportPayload;
  id: string;
}) {
  return (
    <article className="chrp-report px-6 md:px-10 lg:px-14 py-8 md:py-12 max-w-[920px] mx-auto w-full">
      <HeaderBand id={report.report_meta.id} version={report.report_meta.version} />
      <Hero report={report} />
      <ScoresGrid report={report} />
      <RhodesSection text={report.rhodes} />
      <SignatureSection text={report.signature} />
      <BuiltForSection placements={report.placements} />
      <ThroughComp report={report} />
      <WhereLives lives={report.where_this_music_lives} />
      <CreatorBand creator={report.creator} />
      <Footer id={report.report_meta.id} reportId={id} />
    </article>
  );
}

export function HeaderBand({ id, version }: { id: string; version: string }) {
  return (
    <>
      <div className="flex items-end justify-between pb-2">
        <div className="font-sans font-black text-[14px] tracking-wider">
          CHRP
        </div>
        <div className="font-sans text-[11px] text-ink-soft">
          Emotional intelligence report &nbsp;//&nbsp; No. {id} &nbsp;//&nbsp;{" "}
          {version}
        </div>
      </div>
      <div className="hairline" />
    </>
  );
}

function Hero({ report }: { report: ReportPayload }) {
  return (
    <section className="flex flex-col md:flex-row gap-8 md:gap-10 items-start mt-6 md:mt-8">
      <div className="flex-1 min-w-0">
        <HeroTitleBlock report={report} />
        <PitchVerdictBlock report={report} className="mt-5" />
      </div>
      <HeroPolygonAside report={report} />
    </section>
  );
}

export function HeroTitleBlock({ report }: { report: ReportPayload }) {
  return (
    <>
      <h1 className="font-display font-bold text-[44px] md:text-[64px] display-tight">
        {report.track.title}
      </h1>
      <p className="font-display italic text-[18px] md:text-[22px] text-ink-soft mt-1">
        by {report.track.artist}
      </p>
      <p className="font-sans text-[11px] text-ink-light mt-3">
        {report.report_meta.scanned_at_display} &nbsp;//&nbsp; ISRC{" "}
        {report.track.isrc}
      </p>
    </>
  );
}

export function PitchVerdictBlock({
  report,
  className = "",
}: {
  report: ReportPayload;
  className?: string;
}) {
  const conf = report.verdict.confidence;
  // Pitch now leads with CHRP Yellow + chrp-black call text. Develop and Hold
  // get a muted treatment so the credibility of a non-go verdict reads
  // visually distinct from an enthusiastic green-light.
  const call = report.verdict.call;
  const muted = call === "Develop" || call === "Hold";
  const borderColor = muted ? "var(--ink-light)" : "var(--chrp-yellow)";
  const callColor = muted ? "var(--ink-soft)" : "var(--chrp-black)";
  return (
    <div
      className={`pl-4 py-2 border-l-[3px] max-w-[480px] ${className}`}
      style={{ borderLeftColor: borderColor }}
    >
      <div className="font-sans font-bold text-[10px] tracking-wider text-ink-soft">
        PITCH READINESS
      </div>
      <div
        className="font-display font-bold text-[32px] md:text-[36px] leading-none mt-1"
        style={{ color: callColor }}
      >
        {report.verdict.call}
      </div>
      {conf && (
        <div
          className={`font-sans font-bold text-[11px] mt-1.5 ${confidenceColor(
            conf,
          )}`}
        >
          {conf} confidence
        </div>
      )}
      <p className="font-sans text-[12px] text-ink-soft mt-2 leading-snug max-w-[460px]">
        {report.verdict.rationale}
      </p>
    </div>
  );
}

export function HeroPolygonAside({ report }: { report: ReportPayload }) {
  const chip = MODE_COLORS[report.epi.mode];
  return (
    <aside className="flex flex-col items-center w-full md:w-[200px] shrink-0">
      <PolygonRadar
        vertices={polygonFromChrpScores(report.chrp_scores)}
        mode={report.epi.mode}
        epiScore={report.epi.score}
      />
      <div
        className="mt-3 px-3 py-1.5"
        style={{ backgroundColor: chip.chipBg, color: chip.chipText }}
      >
        <span className="font-sans font-bold text-[12px]">
          {report.epi.mode} mode
        </span>
      </div>
      <div className="mt-2 font-sans text-[11px] text-ink-soft text-center">
        <span className="font-bold text-kelly-green">
          {report.epi.rank_in_mode}
        </span>{" "}
        of catalog in {report.epi.mode} mode
      </div>
    </aside>
  );
}

export function ScoresGrid({ report }: { report: ReportPayload }) {
  return (
    <section className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
      <ScoreCol
        title="CHRP Scores"
        caption="the song's signature"
        rows={report.chrp_scores}
      />
      <ScoreCol
        title="Human Performance Variables"
        caption="the states this music supports"
        rows={report.hpv}
      />
    </section>
  );
}

function ScoreCol({
  title,
  caption,
  rows,
}: {
  title: string;
  caption: string;
  rows: ScoreRow[];
}) {
  return (
    <div>
      <div className="flex items-end justify-between mb-1">
        <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
          {title}
        </div>
        <div className="font-display italic text-[12px] text-ink-soft">
          {caption}
        </div>
      </div>
      <div className="hairline" />
      <div className="flex flex-col">
        {rows.map((r) => (
          <ScoreRowView key={r.name} row={r} />
        ))}
      </div>
    </div>
  );
}

function ScoreRowView({ row }: { row: ScoreRow }) {
  return (
    <div className="grid grid-cols-[80px_1fr_36px_minmax(140px,180px)] items-center gap-3 mt-3">
      <div className="font-sans font-bold text-[12px]">{row.name}</div>
      <div className="h-[5px] bg-bar-bg w-full">
        <div
          className="h-full bg-chrp-black"
          style={{ width: `${row.score}%` }}
        />
      </div>
      <div className="font-display font-bold text-[18px] text-right">
        {row.score}
      </div>
      <div className="text-[10.5px] leading-tight">
        <span className={`font-sans font-bold ${RANK_CLASS_TEXT[row.rank_class]}`}>
          {row.rank}
        </span>{" "}
        <span className="font-sans text-ink-soft">{row.anchor}</span>
      </div>
    </div>
  );
}

export function RhodesSection({ text }: { text: string }) {
  return (
    <section className="mt-10">
      <div className="flex items-end justify-between">
        <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
          Dr. Rhodes&rsquo; analysis
        </div>
        <div className="font-sans text-[11px] text-ink-soft">
          chief scientist, emotional frequency
        </div>
      </div>
      <div className="hairline mt-1" />
      <div
        className="mt-2 bg-oat border-l-[3px] py-5 md:py-6 px-5 md:px-6"
        style={{ borderLeftColor: "var(--chrp-black)" }}
      >
        <p className="font-display italic text-[15px] md:text-[16px] leading-[1.5] text-chrp-black max-w-[64ch]">
          {text}
        </p>
      </div>
    </section>
  );
}

export function SignatureSection({ text }: { text: string }) {
  return (
    <section className="mt-10">
      <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
        The signature
      </div>
      <div className="hairline mt-1" />
      <p className="font-display italic text-[18px] md:text-[22px] leading-[1.4] mt-3 max-w-[60ch]">
        {text}
      </p>
    </section>
  );
}

export function BuiltForSection({
  placements,
}: {
  placements: ReportPayload["placements"];
}) {
  return (
    <section className="mt-10">
      <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
        What it&rsquo;s built for
      </div>
      <div className="hairline mt-1" />
      <div className="mt-2 flex flex-col">
        {placements.map((p, i) => (
          <div key={i} className="grid grid-cols-[28px_1fr] gap-3 mt-4">
            <div
              className="font-sans font-black text-[12px] leading-none pt-1"
              style={{
                color: "var(--chrp-yellow)",
                WebkitTextStroke: "0.3px var(--chrp-black)",
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
            <div>
              <div className="font-display font-bold text-[18px] md:text-[20px] leading-tight max-w-[62ch]">
                {p.title}
              </div>
              <p className="font-sans text-[13px] text-ink-soft leading-[1.5] mt-1.5 max-w-[62ch]">
                {p.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ThroughComp({ report }: { report: ReportPayload }) {
  return (
    <section className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
      <div>
        <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
          The throughline
        </div>
        <div className="hairline mt-1" />
        <p className="font-display italic text-[16px] md:text-[17px] leading-[1.5] mt-2 max-w-[56ch] relative">
          <span
            aria-hidden
            className="font-display font-bold text-[36px] leading-none"
            style={{ color: "var(--chrp-yellow)", marginRight: "-0.05em" }}
          >
            &ldquo;
          </span>
          {report.throughline}
        </p>
      </div>
      <div>
        <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
          The comparable
        </div>
        <div className="hairline mt-1" />
        <p className="font-display text-[16px] md:text-[17px] leading-[1.5] mt-2 max-w-[56ch]">
          {report.comparable}
        </p>
      </div>
    </section>
  );
}

export function WhereLives({
  lives,
}: {
  lives: ReportPayload["where_this_music_lives"];
}) {
  return (
    <section className="mt-10">
      <div className="flex items-end justify-between flex-wrap gap-1">
        <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
          Where this music lives
        </div>
        {lives.confidence && lives.n_briefs ? (
          <div className="font-sans text-[11px] text-ink-soft">
            live brief signal &nbsp;·&nbsp; {lives.confidence} confidence (n=
            {lives.n_briefs})
          </div>
        ) : null}
      </div>
      <div className="hairline mt-1" />
      <div
        className="mt-2 bg-oat border-l-[3px] py-4 px-5"
        style={{ borderLeftColor: "var(--chrp-yellow)" }}
      >
        <div className="flex flex-col gap-2.5">
          {lives.verticals.map((v) => (
            <div
              key={v.name}
              className="grid grid-cols-[130px_1fr_44px] items-center gap-3"
            >
              <div className="font-sans font-bold text-[12px]">{v.name}</div>
              <div className="h-[5px] bg-bar-bg">
                <div
                  className="h-full bg-chrp-black"
                  style={{ width: `${v.pct}%` }}
                />
              </div>
              <div className="font-sans font-bold text-[12px] text-right">
                {v.pct}%
              </div>
            </div>
          ))}
        </div>
        {lives.sample_brief && (
          <div className="mt-4 pt-3 border-t border-rule">
            <p className="font-sans text-[12px] text-ink-soft">
              <span className="font-bold text-chrp-black">
                Sample active brief:
              </span>{" "}
              {lives.sample_brief}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export function CreatorBand({
  creator,
}: {
  creator: ReportPayload["creator"];
}) {
  return (
    <section
      className="mt-10 py-3 px-4 md:px-5 bg-chrp-black text-chrp-white"
      style={{ backgroundColor: "var(--chrp-black)" }}
    >
      <p className="font-sans text-[11.5px] md:text-[12px] leading-[1.45]">
        <span
          className="font-bold"
          style={{ color: "var(--chrp-yellow)" }}
        >
          {creator.name}
        </span>{" "}
        &nbsp;//&nbsp; {creator.tracks_scored} track
        {creator.tracks_scored === 1 ? "" : "s"} scored. Scan your full catalog
        to unlock {creator.tease}
      </p>
    </section>
  );
}

export function Footer({ id, reportId }: { id: string; reportId: string }) {
  return (
    <footer className="mt-6 pt-3 border-t border-rule flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6">
      <div className="font-sans text-[11px] text-ink-soft">
        Scored by CHRP &nbsp;//&nbsp; scan.chrp.ai
        <span className="text-ink-light">
          {" · "}Behavioral scoring only. Methodology at scan.chrp.ai/methodology.
        </span>
      </div>
      <div className="flex items-center gap-4 text-[11px]">
        <a
          href={`/api/report/${reportId}/pdf`}
          className="font-sans font-bold text-chrp-black underline underline-offset-4 hover:text-magenta"
        >
          ↓ Download PDF
        </a>
        <span className="font-sans text-ink-soft">Report ID: {id}</span>
      </div>
    </footer>
  );
}

