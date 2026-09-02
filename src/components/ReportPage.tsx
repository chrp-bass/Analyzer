import { ReportPayload, ScoreRow, MODE_COLORS } from "@/lib/fixtures/tracks";
import { PolygonRadar } from "@/components/PolygonRadar";
import { polygonFromChrpScores } from "@/lib/polygon";

/**
 * The paid Song Intelligence report — locked design (Deliverable 09).
 *
 * A dossier in movements. Three rules govern this file:
 *
 *   1. The measurement precedes the interpretation. The polygon and mode sit
 *      above the prose, so the reading is read as something drawn from a
 *      coordinate rather than an opinion offered first. There is no verdict
 *      here and no readiness call — CHRP does not judge the song.
 *   2. One intelligence, not a persona bolted on. Every interpretive string
 *      below comes from a single governed Rhodes generation, so the report
 *      reads as one mind rather than charts alternating with commentary.
 *      Rhodes is never named on the page; he is the voice, not a byline.
 *   3. Nothing here may state a percentile, a brief, a demand signal or a
 *      commercial outcome. The payload still carries rank/brief fields from
 *      the scoring layer; they are deliberately not rendered.
 *
 * Movements shipped, mapped to real generated outputs:
 *   01 Emotional signature  <- report.signature
 *      The CHRP reading     <- report.rhodes
 *   02 EPI profile          <- report.chrp_scores (+ report.hpv when present)
 *   03 What it's built for  <- report.placements
 *   04 Pitch throughline    <- report.throughline
 *   05 Comparable context   <- report.comparable
 *   06 Worth considering    <- report.consider
 *
 * "Positioning language" from the approved hierarchy has no backing output in
 * the engine today. Per the implementation doctrine it is left unshipped
 * rather than filled with invented intelligence.
 */

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
  return <ReportBody report={report} id={id} />;
}

/**
 * The report itself, without any page chrome — used both by the standalone
 * /report route and by the unlocked state of the scan preview.
 */
export function ReportBody({
  report,
  id,
}: {
  report: ReportPayload;
  id: string;
}) {
  return (
    <article className="chrp-report px-6 md:px-10 lg:px-14 py-8 md:py-12 max-w-[920px] mx-auto w-full">
      <HeaderBand
        id={report.report_meta.id}
        version={report.report_meta.version}
      />

      {/* The position, first. */}
      <PositionBlock report={report} />

      {/* 01 — what the song is doing. */}
      <MovementHeading n="01" title="Emotional signature" caption="what the song is doing" />
      <p className="font-display italic text-[20px] md:text-[26px] leading-[1.35] mt-3 max-w-[46ch]">
        {report.signature}
      </p>

      {/* The interpretation, after the position. CHRP is the voice. */}
      <CHRPReading text={report.rhodes} />

      {/* 02 — the coordinate in full. */}
      <MovementHeading n="02" title="EPI profile" caption="the four dimensions" />
      <ScoresGrid report={report} />

      {/* 03 — the moments the song supports. */}
      <MovementHeading n="03" title="What it’s built for" caption="moments and contexts" />
      <BuiltForSection placements={report.placements} />

      {/* 04 — language to carry into a pitch. */}
      <MovementHeading n="04" title="Pitch throughline" caption="paste this anywhere" />
      <p className="font-display italic text-[17px] md:text-[19px] leading-[1.5] mt-3 max-w-[56ch] relative">
        <span
          aria-hidden
          className="font-display text-[36px] leading-none"
          style={{ color: "var(--chrp-yellow)", marginRight: "-0.05em" }}
        >
          &ldquo;
        </span>
        {report.throughline}
      </p>

      {/* 05 — emotional territory, where supportable. */}
      <MovementHeading n="05" title="Comparable context" caption="emotional territory" />
      <p className="font-sans text-[14px] md:text-[15px] leading-[1.6] mt-3 max-w-[62ch] text-ink-soft">
        {report.comparable}
      </p>

      {/* 06 — the decision advantage, and where it hands back. Absent on
          reports persisted before the Rhodes v2 contract; those still read. */}
      {report.consider ? (
        <>
          <MovementHeading
            n="06"
            title="Worth considering"
            caption="your call"
          />
          <p className="font-sans text-[14px] md:text-[15px] leading-[1.65] mt-3 max-w-[62ch]">
            {report.consider}
          </p>
        </>
      ) : null}

      <Footer id={report.report_meta.id} reportId={id} />
    </article>
  );
}

export function HeaderBand({ id, version }: { id: string; version: string }) {
  return (
    <>
      <div className="flex items-end justify-between pb-2 gap-4 flex-wrap">
        <div className="font-sans font-black text-[14px] tracking-wider">
          CHRP
        </div>
        <div className="font-sans text-[11px] text-ink-soft">
          Song Intelligence report &nbsp;//&nbsp; No. {id} &nbsp;//&nbsp;{" "}
          {version}
        </div>
      </div>
      <div className="hairline" />
    </>
  );
}

export function HeroTitleBlock({ report }: { report: ReportPayload }) {
  return (
    <>
      <h1 className="font-display text-[44px] md:text-[64px] display-tight">
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

/**
 * Track identity, mode and the polygon as one bonded artifact. This is the
 * coordinate the rest of the report interprets — not a judgement of it.
 */
function PositionBlock({ report }: { report: ReportPayload }) {
  return (
    <section className="chrp-aura flex flex-col md:flex-row gap-8 md:gap-10 items-start mt-6 md:mt-8">
      <div className="flex-1 min-w-0">
        <HeroTitleBlock report={report} />
      </div>
      <HeroPolygonAside report={report} />
    </section>
  );
}


export function HeroPolygonAside({ report }: { report: ReportPayload }) {
  const chip = MODE_COLORS[report.epi.mode];
  return (
    <aside className="flex flex-col items-center w-full md:w-[220px] shrink-0">
      <PolygonRadar
        vertices={polygonFromChrpScores(report.chrp_scores)}
        mode={report.epi.mode}
        epiScore={report.epi.score}
        size={200}
      />
      <div
        className="mode-pill mt-3"
        style={{ backgroundColor: chip.chipBg, color: chip.chipText }}
      >
        <span className="font-sans font-bold text-[12px]">
          {report.epi.mode} mode
        </span>
      </div>
    </aside>
  );
}

/** Section rule + number + name, shared by every movement. */
function MovementHeading({
  n,
  title,
  caption,
}: {
  n: string;
  title: string;
  caption: string;
}) {
  return (
    <section className="mt-10">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
          {n} &middot; {title}
        </div>
        <div className="font-display italic text-[12px] text-ink-soft">
          {caption}
        </div>
      </div>
      <div className="hairline mt-1" />
    </section>
  );
}

/**
 * The interpretation. One governed voice, never introduced by name: the
 * authority is the CHRP system and the evidence, not a byline or a
 * credential. Placed after the coordinate so it reads as a reading of it.
 */
export function CHRPReading({ text }: { text: string }) {
  return (
    <section className="mt-10">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
          The CHRP reading
        </div>
        <div className="font-display italic text-[12px] text-ink-soft">
          interpretation
        </div>
      </div>
      <div className="hairline mt-1" />
      <div
        className="mt-2 bg-oat border-l-[3px] py-5 md:py-6 px-5 md:px-6"
        style={{ borderLeftColor: "var(--chrp-black)" }}
      >
        <p className="font-display text-[15px] md:text-[17px] leading-[1.55] text-chrp-black max-w-[64ch]">
          {text}
        </p>
      </div>
    </section>
  );
}

/**
 * The four dimensions, and the human performance variables when the engine
 * has them. It does not compute them today, so `hpv` is empty for every real
 * song — and a captioned column over nothing is a promise the report cannot
 * keep. The column appears only when there is something in it.
 */
export function ScoresGrid({ report }: { report: ReportPayload }) {
  const hasHpv = report.hpv.length > 0;
  return (
    <div
      className={`mt-3 grid grid-cols-1 gap-8 md:gap-10 ${
        hasHpv ? "md:grid-cols-2" : ""
      }`}
    >
      <ScoreCol caption="the song’s signature" rows={report.chrp_scores} />
      {hasHpv ? (
        <ScoreCol
          caption="the states this music supports"
          rows={report.hpv}
        />
      ) : null}
    </div>
  );
}

function ScoreCol({ caption, rows }: { caption: string; rows: ScoreRow[] }) {
  return (
    <div>
      <div className="font-display italic text-[12px] text-ink-soft mb-1">
        {caption}
      </div>
      <div className="flex flex-col">
        {rows.map((r) => (
          <ScoreRowView key={r.name} row={r} />
        ))}
      </div>
    </div>
  );
}

/**
 * A score row states the dimension, the bar and the value. The payload also
 * carries rank ("Top 11%") and rank_class from the scoring layer — those are
 * unsupported percentile claims and are intentionally not rendered. The
 * anchor is descriptive rather than comparative, so it stays.
 */
function ScoreRowView({ row }: { row: ScoreRow }) {
  return (
    <div className="grid grid-cols-[76px_1fr_32px] items-center gap-3 mt-3">
      <div className="font-sans font-bold text-[12px]">{row.name}</div>
      <div className="h-[5px] bg-bar-bg w-full rounded-full overflow-hidden">
        <div
          className="h-full bg-chrp-black rounded-full"
          style={{ width: `${row.score}%` }}
        />
      </div>
      <div className="font-display text-[18px] text-right">{row.score}</div>
      <div className="col-start-2 col-span-2 -mt-1.5 font-sans text-[10.5px] leading-tight text-ink-soft">
        {row.anchor}
      </div>
    </div>
  );
}

export function SignatureSection({ text }: { text: string }) {
  return (
    <section className="mt-10">
      <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
        Emotional signature
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
            <div className="font-display text-[18px] md:text-[20px] leading-tight max-w-[62ch]">
              {p.title}
            </div>
            <p className="font-sans text-[13px] text-ink-soft leading-[1.5] mt-1.5 max-w-[62ch]">
              {p.body}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Footer({ id, reportId }: { id: string; reportId: string }) {
  return (
    <footer className="mt-10 pt-3 border-t border-rule flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6">
      <div className="font-sans text-[11px] text-ink-soft">
        Scored by CHRP &nbsp;//&nbsp; scan.chrp.ai
        <span className="text-ink-light">
          {" · "}Behavioural scoring only. Methodology at
          scan.chrp.ai/methodology.
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
