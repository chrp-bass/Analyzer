"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { ReportPayload, MODE_COLORS } from "@/lib/fixtures/tracks";
import { PolygonRadar } from "@/components/PolygonRadar";
import { polygonFromChrpScores } from "@/lib/polygon";
import {
  HeaderBand,
  HeroTitleBlock,
  PitchVerdictBlock,
  ScoresGrid,
  RhodesSection,
  SignatureSection,
  BuiltForSection,
  ThroughComp,
  WhereLives,
  CreatorBand,
  Footer,
} from "@/components/ReportPage";
import { getScanById } from "@/lib/scan-id";
import {
  getCurrentUser,
  getUserCredits,
  getUserScans,
  consumeCatalogCredit,
  markScanPaid,
  recordScan,
} from "@/lib/accounts";

type Status = "checking" | "paywall" | "unlocking" | "unlocked";

export function ScanPreview({
  report,
  scanId,
  trackSlug,
}: {
  report: ReportPayload;
  scanId: string;
  trackSlug: string;
}) {
  const search = useSearchParams();
  const justPaid = search.get("welcome") === "1";
  const welcomeEmail = search.get("email");

  const [status, setStatus] = useState<Status>("checking");
  const [showBanner, setShowBanner] = useState(false);
  // firstScanCta: user reached this preview via the free-first-scan path
  // (paid=true AND their user has exactly one scan on record). Anyone who
  // paid, consumed a catalog credit, or has scanned more than once has
  // already converted — no CTA for them.
  const [firstScanCta, setFirstScanCta] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const scan = getScanById(scanId);
      if (scan?.paid) {
        const user = await getCurrentUser();
        if (user) {
          const scans = await getUserScans(user.id);
          if (!cancelled && scans.length === 1 && !justPaid) {
            setFirstScanCta(true);
          }
        }
        if (!cancelled) {
          if (justPaid) {
            setStatus("unlocking");
            setShowBanner(true);
            setTimeout(() => {
              if (!cancelled) setStatus("unlocked");
            }, 80);
          } else {
            setStatus("unlocked");
          }
        }
        return;
      }
      const user = await getCurrentUser();
      if (user) {
        const credits = await getUserCredits(user.id);
        if (
          credits &&
          (credits.trackLimit === null ||
            credits.tracksUsed < credits.trackLimit)
        ) {
          await consumeCatalogCredit(user.id);
          await markScanPaid(user.id, scanId);
          await recordScan(user.id, trackSlug, true, scanId);
          if (!cancelled) {
            setStatus("unlocking");
            setTimeout(() => {
              if (!cancelled) setStatus("unlocked");
            }, 80);
          }
          return;
        }
      }
      if (!cancelled) setStatus("paywall");
    })();
    return () => {
      cancelled = true;
    };
  }, [scanId, trackSlug, justPaid]);

  const unpaid = status === "paywall";
  // While "unlocking" we keep the blur applied for one frame, then drop it -
  // the CSS transition on filter animates the unblur.
  const blurApplied = status === "checking" || status === "paywall" || status === "unlocking";

  const gatedStyle: React.CSSProperties = {
    filter: blurApplied ? "blur(8px) opacity(0.3)" : "blur(0px) opacity(1)",
    transition: "filter 800ms ease",
    pointerEvents: blurApplied ? "none" : "auto",
  };

  return (
    <div className="relative">
      <AnimatePresence>
        {showBanner && status === "unlocked" && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="sticky top-0 z-30 px-5 py-3 flex items-center justify-between gap-4"
            style={{
              backgroundColor: "var(--chrp-yellow)",
              color: "var(--chrp-black)",
            }}
          >
            <div className="font-sans text-[12px] md:text-[13px] leading-snug">
              <span className="font-bold">Magic link sent</span>
              {welcomeEmail ? ` to ${welcomeEmail}.` : "."} &nbsp;
              <Link
                href="/dashboard"
                className="underline hover:no-underline font-bold"
              >
                Click here to access your dashboard.
              </Link>
            </div>
            <button
              onClick={() => setShowBanner(false)}
              className="font-sans text-[11px] tracking-wider uppercase opacity-70 hover:opacity-100"
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <article className="chrp-report px-6 md:px-10 lg:px-14 py-8 md:py-12 max-w-[920px] mx-auto w-full">
        <HeaderBand
          id={report.report_meta.id}
          version={report.report_meta.version}
        />

        <VisibleTop report={report} />

        <ScoresGrid report={report} />

        <div className="relative mt-12">
          <div style={gatedStyle}>
            <PitchVerdictBlock report={report} />
            <RhodesSection text={report.rhodes} />
            <SignatureSection text={report.signature} />
            <BuiltForSection placements={report.placements} />
            <ThroughComp report={report} />
            <WhereLives lives={report.where_this_music_lives} />
            <CreatorBand creator={report.creator} />
            <Footer id={report.report_meta.id} reportId={scanId} />
          </div>

          <AnimatePresence>
            {unpaid && (
              <motion.div
                key="paywall"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-x-0 top-0 flex items-start justify-center pt-6 md:pt-12 px-3 md:px-6"
              >
                <PaywallCard scanId={scanId} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </article>

      {firstScanCta && status === "unlocked" && (
        <FirstScanCta scanId={scanId} />
      )}
    </div>
  );
}

function FirstScanCta({ scanId }: { scanId: string }) {
  return (
    <section className="bg-oat px-6 md:px-10 py-12 md:py-16 border-t border-rule">
      <div className="max-w-[720px] mx-auto text-center">
        <div className="font-sans font-black text-[10px] tracking-wider uppercase text-ink-soft">
          What&rsquo;s next
        </div>
        <h2 className="mt-3 font-display font-bold text-[30px] md:text-[42px] leading-[1.05] text-chrp-black display-tight">
          You&rsquo;ve seen what CHRP sees. Run your next track.
        </h2>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
          <Link
            href="/scan"
            className="font-sans font-bold text-[12.5px] tracking-wider uppercase bg-chrp-black text-chrp-white px-6 py-3.5 text-center"
          >
            Scan another track &mdash; $19
          </Link>
          <Link
            href={`/scan/${scanId}/checkout-tier?product=artist_catalog`}
            className="font-sans font-bold text-[12.5px] tracking-wider uppercase px-6 py-3.5 text-center"
            style={{
              backgroundColor: "var(--chrp-yellow)",
              color: "var(--chrp-black)",
            }}
          >
            Unlock your catalog &mdash; $149 for 10 songs
          </Link>
        </div>
      </div>
    </section>
  );
}

function VisibleTop({ report }: { report: ReportPayload }) {
  const chip = MODE_COLORS[report.epi.mode];
  const vertices = polygonFromChrpScores(report.chrp_scores);
  return (
    <section className="mt-6 md:mt-8 flex flex-col items-center text-center">
      <div className="self-start text-left md:self-auto md:text-center">
        <HeroTitleBlock report={report} />
      </div>
      <div className="mt-6 md:mt-8">
        <PolygonRadar
          vertices={vertices}
          mode={report.epi.mode}
          epiScore={report.epi.score}
          size={280}
        />
      </div>
      <div
        className="mt-4 px-3 py-1.5"
        style={{ backgroundColor: chip.chipBg, color: chip.chipText }}
      >
        <span className="font-sans font-bold text-[13px]">
          {report.epi.mode} mode
        </span>
      </div>
      <div className="mt-2 font-sans text-[11px] text-ink-soft">
        <span className="font-bold text-kelly-green">
          {report.epi.rank_in_mode}
        </span>{" "}
        of catalog in {report.epi.mode} mode
      </div>
    </section>
  );
}

function PaywallCard({ scanId }: { scanId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");

  function goSingle() {
    const q = email ? `?email=${encodeURIComponent(email)}` : "";
    router.push(`/scan/${scanId}/checkout${q}`);
  }
  function goCatalog() {
    const q = email ? `?email=${encodeURIComponent(email)}` : "";
    router.push(`/scan/${scanId}/tiers${q}`);
  }

  return (
    <div className="w-full max-w-[540px] bg-chrp-white border border-rule shadow-[0_18px_60px_-12px_rgba(15,14,14,0.18)]">
      <div className="px-5 md:px-7 py-6 md:py-7">
        <h2 className="font-display font-bold text-[26px] md:text-[34px] leading-[1.05] text-chrp-black">
          Unlock the interpretation.
        </h2>
        <p className="mt-2 font-sans text-[12.5px] md:text-[13.5px] leading-snug text-ink-soft">
          Your fingerprint and scores are visible above. The pitch verdict,
          Dr.&nbsp;Rhodes&rsquo; analysis, placement intelligence, throughline,
          and where this music lives &mdash; that&rsquo;s what you&rsquo;re
          unlocking.
        </p>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={goSingle}
            className="font-sans font-bold text-[12.5px] tracking-wider uppercase px-4 py-3"
            style={{
              backgroundColor: "var(--chrp-yellow)",
              color: "var(--chrp-black)",
            }}
          >
            Unlock this song &mdash; $19
          </button>
          <button
            onClick={goCatalog}
            className="font-sans font-bold text-[12.5px] tracking-wider uppercase bg-chrp-black text-chrp-white px-4 py-3"
          >
            Unlock your catalog &mdash; $149 for 10 songs
          </button>
        </div>

        <p className="mt-4 font-sans text-[11.5px] leading-[1.5] text-ink-soft">
          Single scan gives you this song&rsquo;s interpretation. Catalog scan
          unlocks your creator profile &mdash; signature pattern, emotional
          consistency, and reliability score across your body of work.
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <ExpressMethod label="Pay" />
          <ExpressMethod label="G Pay" />
          <ExpressMethod label="Link" />
        </div>

        <label className="mt-4 flex flex-col gap-1">
          <span className="font-sans text-[10.5px] tracking-wider uppercase text-ink-soft">
            Email for your receipt
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@studio.com"
            className="font-sans text-[14px] text-chrp-black bg-chrp-white border border-rule px-3 py-2.5 focus:outline-none focus:border-chrp-black"
          />
        </label>

        <div className="mt-5 hairline" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10.5px] font-sans text-ink-soft">
          <div className="flex items-center gap-3">
            <Link href="/methodology" className="hover:text-chrp-black">
              Methodology
            </Link>
            <span className="text-ink-light">·</span>
            <Link
              href="/?stage=unlocked"
              className="hover:text-chrp-black"
            >
              Sample report
            </Link>
          </div>
          <div className="text-ink-light">
            Behavioral scoring only.
          </div>
        </div>
        <p className="mt-3 font-sans text-[10px] text-ink-light leading-snug">
          Demo checkout &mdash; no card data is captured. CHRP is a decision
          tool, not a forecast. Reports compare against the CHRP corpus; market
          conditions can shift.
        </p>
      </div>
    </div>
  );
}

function ExpressMethod({ label }: { label: string }) {
  return (
    <div
      aria-disabled
      className="flex items-center justify-center px-3 py-2 border border-rule bg-chrp-white opacity-70 cursor-not-allowed"
    >
      <span className="font-sans font-bold text-[11px] tracking-wider uppercase text-ink-soft">
        {label}
      </span>
    </div>
  );
}
