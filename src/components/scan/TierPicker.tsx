"use client";

import { useRouter } from "next/navigation";
import { TIERS } from "@/lib/payments";
import { FreeReport } from "@/lib/fixtures/tracks";
import { PolygonRadar } from "@/components/PolygonRadar";
import { polygonFromChrpScores } from "@/lib/polygon";

/**
 * THE CATALOG — the $149 surface.
 *
 * This was a pricing card: a bordered box holding "$149", a green
 * "save 22% vs single scans" line, and a four-item spec list (10 tracks /
 * 1 artist / 12 months / creator profile at 8 scans) above a black CHOOSE
 * button, stranded at the left of a 1100px container. A SaaS tier chooser
 * with one tier — for a product whose own argument is that a catalog is
 * not a volume discount but a different kind of knowledge.
 *
 * The offer is drawn instead of listed. The creator has just had one song
 * measured, so that song's real shape is placed first and the nine slots it
 * could become are drawn beside it, empty. "10 tracks" stops being a line
 * item and becomes the picture: one shape you have, nine you don't. That is
 * the whole argument — one song tells you something, a catalog tells you
 * who you are — made with the product's own intelligence rather than with
 * an illustration or a bullet.
 *
 * Nothing here is invented. The filled mark is the scan's real EPI
 * geometry; the empty marks are empty because those songs have not been
 * scanned. There is no scarcity, no countdown, no social proof, no
 * discount framing, and no claim about what the catalog will conclude.
 */
export function TierPicker({
  scanId,
  report,
}: {
  scanId: string;
  report: FreeReport;
}) {
  const router = useRouter();
  const tier = TIERS.artist_catalog;
  const limit = tier.trackLimit ?? 10;
  const empties = Math.max(0, limit - 1);
  const vertices = polygonFromChrpScores(report.chrp_scores);
  const perTrack = (tier.priceUsd / limit).toFixed(2);

  return (
    <div className="tp">
      <div className="tp-head">
        <p className="tp-eyebrow">Creator Intelligence</p>
        <h1 className="tp-title">
          One song tells you something.
          <br />A catalog tells you who you are.
        </h1>
        <p className="tp-sub">
          You have one shape. The pattern across a body of work is a
          different kind of knowledge — and it is the one people buy an
          artist for.
        </p>
      </div>

      {/* The offer, drawn. One real shape, nine waiting. */}
      <div className="tp-catalog" aria-hidden>
        <div className="tp-slot tp-slot-filled">
          <PolygonRadar
            vertices={vertices}
            mode={report.epi.mode}
            epiScore={report.epi.score}
            size={80}
            showGrid={false}
            showLabels={false}
            showCenter={false}
          />
        </div>
        {Array.from({ length: empties }).map((_, i) => (
          <div className="tp-slot" key={i}>
            {/* Same viewBox and same plotted radius as PolygonRadar, so an
                empty slot is exactly the measurement field a scanned song
                would fill — not a decorative dot at an unrelated scale. */}
            <svg viewBox="-132 -120 270 240" width={80} height={80}>
              <circle
                cx="0"
                cy="0"
                r="90"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="4 7"
              />
            </svg>
          </div>
        ))}
      </div>
      <p className="tp-catalog-caption">
        <span className="tp-caption-strong">{report.track.title}</span>, scanned.
        &nbsp;{empties} more tracks by {report.track.artist} in the same
        catalog.
      </p>

      <div className="tp-offer">
        <div className="tp-price">
          <span className="tp-price-num">${tier.priceUsd.toLocaleString()}</span>
          <span className="tp-price-meta">
            <span>${perTrack} a track</span>
            <span>12 months of access</span>
          </span>
        </div>
        {/* The comingSoon guard is kept deliberately. checkout-tier redirects
            a comingSoon product to ?product=artist_catalog — the same URL —
            so reaching it with the flag set is an infinite redirect. This
            button is the only thing standing in front of that. */}
        <button
          type="button"
          className="tp-cta"
          disabled={tier.comingSoon}
          onClick={() =>
            router.push(`/scan/${scanId}/checkout-tier?product=artist_catalog`)
          }
        >
          {tier.comingSoon ? "Coming soon" : "Unlock the catalog"}
        </button>
      </div>

      <p className="tp-fine">
        This scan unlocks with it. Up to {limit} tracks by one artist. Scan
        eight and the creator profile — what the catalog says about you as a
        writer — unlocks automatically.
      </p>

      <button onClick={() => router.back()} className="tp-back">
        ← Back
      </button>
    </div>
  );
}
