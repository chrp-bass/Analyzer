"use client";

import { useRouter } from "next/navigation";
import { TIERS } from "@/lib/payments";
import { ProductId } from "@/lib/accounts";
import { ReportPayload } from "@/lib/fixtures/tracks";

const ORDER: ProductId[] = ["artist_catalog"];

const MOST_POPULAR: ProductId = "artist_catalog";

const PER_TRACK_MATH: Partial<
  Record<ProductId, { perTrack: string; savingsPct: number }>
> = {
  artist_catalog: { perTrack: "$14.90", savingsPct: 22 },
};

function PerTrackMath({ productId }: { productId: ProductId }) {
  const data = PER_TRACK_MATH[productId];
  if (!data) return null;
  return (
    <div
      className="mt-2 font-sans font-bold text-[10px] text-kelly-green"
      style={{ letterSpacing: "0.2px" }}
    >
      {data.perTrack} per track &nbsp;·&nbsp; save {data.savingsPct}% vs single
      scans
    </div>
  );
}

export function TierPicker({
  scanId,
  report,
}: {
  scanId: string;
  report: ReportPayload;
}) {
  const router = useRouter();
  return (
    <div className="min-h-screen px-6 md:px-10 py-10 md:py-16 max-w-[1100px] mx-auto w-full">
      <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft mb-3">
        Choose a catalog tier
      </div>
      <h1 className="font-display font-bold text-[32px] md:text-[48px] leading-[1.0] text-chrp-black display-tight">
        Unlock your catalog.
      </h1>
      <p className="font-display italic text-[16px] md:text-[18px] text-ink-soft mt-3 max-w-[52ch]">
        Your first scan unlocks with the tier. Scan eight tracks within any
        catalog tier and the creator profile unlocks automatically.
      </p>

      <div className="mt-8 font-sans text-[11px] text-ink-light">
        Starting from this scan: &nbsp;
        <span className="text-chrp-black">{report.track.title}</span>
        &nbsp;&mdash;&nbsp;{report.track.artist}
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {ORDER.map((id) => {
          const tier = TIERS[id];
          const popular = id === MOST_POPULAR;
          return (
            <button
              key={id}
              disabled={tier.comingSoon}
              onClick={() =>
                router.push(
                  `/scan/${scanId}/checkout-tier?product=${id}`,
                )
              }
              className={`relative flex flex-col items-stretch text-left p-5 rounded ${
                popular ? "border" : "border border-rule"
              } bg-chrp-white hover:bg-oat disabled:opacity-60 disabled:cursor-not-allowed`}
              style={
                popular
                  ? { borderColor: "rgba(230, 215, 79, 0.30)" }
                  : undefined
              }
            >
              {/* No "Most popular" / "Most chosen" badge. The catalog tier is a
                  different product, not a volume discount, and social-proof
                  badges are prohibited by the locked sales architecture. */}
              {tier.comingSoon && (
                <div className="absolute -top-3 right-5 px-2 py-0.5 font-sans font-black text-[10px] tracking-wider uppercase bg-ink-soft text-chrp-white">
                  Coming soon
                </div>
              )}
              <div className="font-sans font-black text-[11px] tracking-wider uppercase text-ink-soft">
                {tier.label}
              </div>
              <div className="font-display font-bold text-[38px] leading-none mt-2 text-chrp-black">
                ${tier.priceUsd.toLocaleString()}
              </div>
              <PerTrackMath productId={id} />
              <div className="hairline my-4" />
              <ul className="flex flex-col gap-1.5 font-sans text-[12.5px] text-ink-soft">
                <li>
                  <span className="font-bold text-chrp-black">
                    {tier.trackLimit === null
                      ? "Unlimited"
                      : `${tier.trackLimit} tracks`}
                  </span>
                </li>
                <li>
                  <span className="font-bold text-chrp-black">
                    {tier.artistLimit === null
                      ? "Unlimited artists"
                      : tier.artistLimit === 1
                      ? "1 artist"
                      : `${tier.artistLimit} artists`}
                  </span>
                </li>
                <li>{tier.durationDays === 365 ? "12 months" : `${tier.durationDays} days`}</li>
                <li>Creator profile at 8 scans</li>
              </ul>
              <div
                className={`mt-5 font-sans font-bold text-[12px] tracking-wider uppercase text-center px-4 py-2.5 ${
                  tier.comingSoon
                    ? "bg-ink-light text-chrp-white"
                    : "bg-chrp-black text-chrp-white"
                }`}
              >
                {tier.comingSoon ? "Coming soon" : "Choose"}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        <button
          onClick={() => router.back()}
          className="font-sans text-[11px] tracking-wider uppercase text-ink-light hover:text-chrp-black"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
