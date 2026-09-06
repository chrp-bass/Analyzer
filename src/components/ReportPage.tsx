import { ReportPayload, ScoreRow } from "@/lib/fixtures/tracks";
import { EpiPlate } from "@/components/EpiPlate";
import { polygonFromChrpScores } from "@/lib/polygon";
import { ReportOwnership } from "@/components/report/ReportOwnership";
import { RhodesVoice } from "@/components/report/RhodesVoice";

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
      <MovementHeading
        n="01"
        title="Emotional signature"
        caption="what the song is doing"
        altitude="measure"
      />
      <p className="font-display italic text-[20px] md:text-[26px] leading-[1.35] mt-3 max-w-[480px]">
        {report.signature}
      </p>

      {/* The interpretation, after the position. CHRP is the voice. */}
      <CHRPReading text={report.rhodes} />

      {/* Dr. Rhodes speaks. A short personalised read, then — if the creator
          wants it — a conversation. The panel bridges the top summary to the
          deep-dive evidence below; nothing is auto-played and nothing is
          coerced. The signed-URL route enforces the same entitlement the
          JSON report route does, so this only appears for creators who
          actually own this scan's paid report. */}
      <RhodesVoice scanId={id} />

      {/* 02 — the coordinate in full. */}
      <MovementHeading
        n="02"
        title="EPI profile"
        caption="the four dimensions"
        altitude="measure"
      />
      <ScoresGrid report={report} />

      {/* 03 — the placement map. Where the measured function could work. */}
      <MovementHeading
        n="03"
        title="Where this could live"
        caption="placement territory"
        altitude="open"
        hinge="Everything above is measured. Everything below is what the measurement makes possible."
      />
      <BuiltForSection placements={report.placements} />

      {/* 04 — the buyer map. Who could value that function. */}
      {report.buyers && report.buyers.length > 0 ? (
        <>
          <MovementHeading
            n="04"
            title="Who to put it in front of"
            caption="and what to lead with"
          />
          <BuyerSection buyers={report.buyers} />
        </>
      ) : null}

      {/* 05 — language to carry into a pitch. */}
      <MovementHeading n="05" title="Pitch throughline" caption="paste this anywhere" />
      <p className="font-display italic text-[17px] md:text-[19px] leading-[1.5] mt-3 max-w-[480px] relative">
        <span
          aria-hidden
          className="font-display text-[36px] leading-none"
          style={{ color: "var(--chrp-yellow)", marginRight: "-0.05em" }}
        >
          &ldquo;
        </span>
        {report.throughline}
      </p>

      {/* The positioning language itself, under the throughline it summarises. */}
      {report.pitch ? <PitchSection pitch={report.pitch} /> : null}

      {/* 06 — the audience map. State, context, emotional job. This replaced
          "Comparable context", which was generic territory prose and the
          section most prone to naming a genre nobody measured.
          Reports persisted before `audience` existed used to fall back to
          rendering `comparable`; that fallback is gone. Comparable is
          prohibited customer-facing output, so a report without an audience
          map simply omits the movement rather than substituting a
          comparison for it. */}
      {report.audience ? (
        <>
          <MovementHeading
            n="06"
            title="Who responds, and when"
            altitude="close"
          />
          <p className="font-sans text-[14px] md:text-[15px] leading-[1.65] mt-3 max-w-[480px]">
            {report.audience}
          </p>
        </>
      ) : null}

      {/* 06 — the decision advantage, and where it hands back. Absent on
          reports persisted before the Rhodes v2 contract; those still read. */}
      {report.consider ? (
        <>
          <MovementHeading
            n="07"
            title="Worth considering"
            altitude="close"
          />
          <p className="font-sans text-[14px] md:text-[15px] leading-[1.65] mt-3 max-w-[480px]">
            {report.consider}
          </p>
        </>
      ) : null}

      {/* Ownership, after the intelligence. Value first, then the reason
          to keep it. Applies to the free first report and the paid one
          alike — entitlement differs, ownership UX does not. */}
      <ReportOwnership scanId={id} songTitle={report.track.title} />

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
      {/* The record, as provenance rather than as decoration.
          The engine already resolves cover art with the song and the free
          reveal shows it; the paid document — the thing the creator keeps —
          showed no image at all. It enters here the way a plate enters a
          printed page: squared, small, credited by the title beneath it,
          sitting on the same left edge as everything else. Deliberately not
          a hero image. The song's portrait in this document is its shape,
          and an 800px cover would outrank the measurement the report is
          built on. Absent artwork renders nothing — never a placeholder. */}
      {report.track.artworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="rp-hero-art"
          src={report.track.artworkUrl}
          alt={`Cover art for ${report.track.title} by ${report.track.artist}`}
        />
      ) : null}
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
    /* Bottom-aligned, not top-aligned. Two blocks hung from one baseline
       read as a composition; two blocks starting at the same ceiling read
       as a row of components, which is what this was. The title sits on
       the document's left edge and the plate closes the measure on the
       right, so the hero has two edges and one shared floor. */
    <section className="chrp-aura flex flex-col md:flex-row gap-10 md:gap-12 items-start md:items-end mt-6 md:mt-10">
      <div className="flex-1 min-w-0">
        <HeroTitleBlock report={report} />
      </div>
      <HeroPolygonAside report={report} />
    </section>
  );
}


export function HeroPolygonAside({ report }: { report: ReportPayload }) {
  return (
    /* The plate sizes itself in CSS; the SVG scales entirely through its
       viewBox, so no geometry in PolygonRadar changes. The mode pill that
       used to float under the chart is gone — the mode is set as type
       inside the plate, which removes the only 999px-radius object from a
       document that is otherwise squared off. */
    <aside className="w-full md:w-[300px] lg:w-[320px] shrink-0">
      <EpiPlate
        vertices={polygonFromChrpScores(report.chrp_scores)}
        mode={report.epi.mode}
        epiScore={report.epi.score}
      />
    </aside>
  );
}

/**
 * Section rule + number + name, shared by every movement.
 *
 * The report moves MEASUREMENT -> MEANING -> COMMERCIAL APPLICATION -> ACTION,
 * and until now announced all four in one voice. Altitude is carried by type
 * and space only — no new element, no container, no rule of its own:
 *
 *   measure  the coordinate and the reading drawn from it. Full ink, a wider
 *            label, and the most air above it.
 *   apply    where the measured function could work and who to tell. The
 *            document's working register; unchanged from before.
 *   close    what the creator does with it. The quietest altitude, reached
 *            by subtraction — the lowercase caption is dropped rather than
 *            restyled, because it is the least informative line in the block.
 */
type Altitude = "measure" | "open" | "apply" | "close";

const ALTITUDE = {
  measure: {
    section: "mt-14 md:mt-16",
    label: "text-[11px] text-chrp-black",
  },
  /**
   * The turn. Movement 03 is where the document stops describing the song
   * and starts describing what the song makes possible, and it was arriving
   * with LESS air than the measurement sections before it — the altitude
   * air decayed from mt-16 to mt-12 to mt-10, so the report's single most
   * important hinge was its quietest transition. It now carries the widest
   * gap in the document, and it is the only movement allowed to state its
   * own turn (see `hinge`). Everything after it settles back down.
   */
  open: {
    section: "mt-20 md:mt-28",
    label: "text-[11px] text-chrp-black",
  },
  apply: {
    section: "mt-12",
    label: "text-[10px] text-ink-soft",
  },
  close: {
    section: "mt-10",
    label: "text-[10px] text-ink-soft",
  },
} as const;

function MovementHeading({
  n,
  title,
  caption,
  altitude = "apply",
  hinge,
}: {
  n?: string;
  title: string;
  caption?: string;
  altitude?: Altitude;
  /** One line, at the turn only. The document naming its own change of
      subject — not a section subtitle, and never more than once. */
  hinge?: string;
}) {
  const a = ALTITUDE[altitude];
  const showCaption = altitude !== "close" && caption;
  return (
    <section className={a.section}>
      {hinge ? (
        <p className="font-display italic text-[15px] md:text-[17px] leading-[1.45] text-ink-soft max-w-[420px] mb-8 md:mb-10">
          {hinge}
        </p>
      ) : null}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div
          className={`font-sans font-bold tracking-wider uppercase ${a.label}`}
        >
          {n ? `${n} \u00b7 ` : ""}
          {title}
        </div>
        {showCaption ? (
          <div className="font-display italic text-[12px] text-ink-soft">
            {caption}
          </div>
        ) : null}
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
    <>
      <MovementHeading
        title="The CHRP reading"
        caption="interpretation"
        altitude="measure"
      />
      {/* The one tinted, rule-marked surface in the document. Its content sits
          at the report's 40px structural indent (3px rule + 37px), the same
          indent the placement list uses, with matching air on the right — so
          the block reads as a deliberate inset rather than stray padding. */}
      <div
        className="mt-2 bg-oat border-l-[3px] py-5 md:py-6 pl-[37px] pr-10 max-w-[520px]"
        style={{ borderLeftColor: "var(--chrp-black)" }}
      >
        <p className="font-display text-[15px] md:text-[17px] leading-[1.55] text-chrp-black">
          {text}
        </p>
      </div>
    </>
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
      /* With no human-performance column — the real case today — the
         measurement sits in the report's prose column like everything
         else, rather than running a lone 660px bar across the page. */
      className={`mt-3 grid grid-cols-1 gap-8 md:gap-10 ${
        hasHpv ? "md:grid-cols-2" : "max-w-[480px]"
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
    <div className="grid grid-cols-[76px_1fr_50px] items-center gap-3 mt-4">
      <div className="font-sans font-bold text-[12px]">{row.name}</div>
      <div className="h-[5px] bg-bar-bg w-full rounded-full overflow-hidden">
        <div
          className="h-full bg-chrp-black rounded-full"
          style={{ width: `${row.score}%` }}
        />
      </div>
      <div className="font-display text-[24px] md:text-[28px] leading-none text-right">
        {row.score}
      </div>
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
    <div className="mt-2 flex flex-col max-w-[480px]">
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
            {p.family ? (
              <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft mb-1">
                {p.family}
              </div>
            ) : null}
            <div className="font-display text-[18px] md:text-[20px] leading-tight">
              {p.title}
            </div>
            <p className="font-sans text-[13px] text-ink-soft leading-[1.5] mt-1.5">
              {p.body}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The buyer map. Measurement is sans and compact; the reason someone may
 * care is the human half, so it reads as body copy rather than a data row.
 */
export function BuyerSection({
  buyers,
}: {
  buyers: NonNullable<ReportPayload["buyers"]>;
}) {
  return (
    <div className="mt-2 flex flex-col max-w-[480px]">
      {buyers.map((b, i) => (
        <div key={i} className="mt-4">
          <div className="font-sans font-bold text-[12px]">{b.category}</div>
          <div className="font-sans text-[10.5px] tracking-wider uppercase text-ink-soft mt-1">
            Lead with &middot; {b.lead}
          </div>
          <p className="font-sans text-[13px] text-ink-soft leading-[1.5] mt-1.5">
            {b.why}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Positioning language the creator can actually adapt and send. */
export function PitchSection({
  pitch,
}: {
  pitch: NonNullable<ReportPayload["pitch"]>;
}) {
  return (
    <div className="mt-6 flex flex-col gap-6 max-w-[480px]">
      <div>
        <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
          For sync
        </div>
        <p className="font-sans text-[13.5px] leading-[1.6] mt-2">
          {pitch.sync}
        </p>
      </div>
      <div>
        <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
          For positioning
        </div>
        <p className="font-sans text-[13.5px] leading-[1.6] mt-2">
          {pitch.promotion}
        </p>
      </div>
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
        {/* 44px touch target. The type stays 11px; only the box grows. */}
        <a
          href={`/api/report/${reportId}/pdf`}
          className="inline-flex items-center min-h-[44px] font-sans font-bold text-chrp-black underline underline-offset-4 hover:text-magenta"
        >
          ↓ Download PDF
        </a>
        <span className="font-sans text-ink-soft">Report ID: {id}</span>
      </div>
    </footer>
  );
}
