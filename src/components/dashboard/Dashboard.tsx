"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { SiteHeader } from "@/components/SiteHeader";
import {
  User,
  CatalogPurchase,
  ScanRecordOnAccount,
  getCurrentUser,
  getUserScans,
  getUserCredits,
  hasSeenProfileUnlock,
  markProfileUnlockSeen,
  clearAllUserData,
} from "@/lib/accounts";
import { TIERS } from "@/lib/payments";
import { sendProfileUnlock } from "@/lib/email";
import {
  getReportById,
  ReportPayload,
  MODE_COLORS,
} from "@/lib/fixtures/tracks";
import { getCreatorProfile } from "@/lib/fixtures/profile";
import { PolygonRadar } from "@/components/PolygonRadar";
import { polygonFromChrpScores } from "@/lib/polygon";
import { CreatorProfileStage } from "@/components/stages/CreatorProfileStage";

const UNLOCK_THRESHOLD = 8;

export function Dashboard() {
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [scans, setScans] = useState<ScanRecordOnAccount[]>([]);
  const [credits, setCredits] = useState<CatalogPurchase | null>(null);
  const [showUnlockBanner, setShowUnlockBanner] = useState(false);

  async function refresh() {
    const u = await getCurrentUser();
    setUser(u);
    if (u) {
      const s = await getUserScans(u.id);
      // Sort newest first
      s.sort((a, b) => (a.scannedAt < b.scannedAt ? 1 : -1));
      setScans(s);
      setCredits(await getUserCredits(u.id));
    } else {
      setScans([]);
      setCredits(null);
    }
    setHydrated(true);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!user || !hydrated) return;
    (async () => {
      const seen = await hasSeenProfileUnlock(user.id);
      if (!seen && scans.length >= UNLOCK_THRESHOLD) {
        await sendProfileUnlock(user.id);
        setShowUnlockBanner(true);
        await markProfileUnlockSeen(user.id);
        setTimeout(() => setShowUnlockBanner(false), 6000);
      }
    })();
  }, [user, hydrated, scans.length]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader showCta={false} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-chrp-black border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) return <EmptyState />;

  const unlocked = scans.length >= UNLOCK_THRESHOLD;
  const dominantTrack = scans[0]?.trackSlug ?? "glasshouse";
  const profile = getCreatorProfile(dominantTrack);
  const dominantReport = getReportById(dominantTrack);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader showCta={false} />
      <AnimatePresence>
        {showUnlockBanner && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="px-5 py-3 text-center font-sans text-[13px] font-bold text-chrp-black"
            style={{ backgroundColor: "var(--chrp-yellow)" }}
          >
            Your Creator Profile is now live.
          </motion.div>
        )}
      </AnimatePresence>

      <section className="flex-1 px-6 md:px-10 py-8 md:py-12 max-w-[1100px] mx-auto w-full">
        <AnimatePresence>
          {unlocked && profile && dominantReport && (
            <motion.div
              key="profile"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
              className="mb-12"
            >
              <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft mb-3 flex items-center justify-between">
                <span>Creator profile</span>
                <Link
                  href="/dashboard/profile"
                  className="text-ink-light hover:text-chrp-black"
                >
                  View full profile →
                </Link>
              </div>
              <div className="border border-rule p-2 md:p-4">
                <CreatorProfileStage
                  report={dominantReport}
                  profile={{
                    ...profile,
                    creator: {
                      ...profile.creator,
                      tracks_scored: scans.length,
                    },
                  }}
                  scans={scans.length}
                  artistOverride={null}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display font-bold text-[32px] md:text-[44px] leading-[1.0] text-chrp-black display-tight">
              Your scans
            </h1>
            <p className="font-sans text-[12px] text-ink-soft mt-1">
              Signed in as{" "}
              <span className="text-chrp-black">{user.email ?? "guest"}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/scan"
              className="inline-flex items-center justify-center font-sans font-bold text-[12px] tracking-wider uppercase bg-chrp-black text-chrp-white px-5 py-3"
            >
              Scan another track
            </Link>
          </div>
        </div>

        {credits && (
          <CreditsCard credits={credits} scanCount={scans.length} />
        )}

        {!unlocked && (
          <ProgressMeter
            scans={scans}
            threshold={UNLOCK_THRESHOLD}
          />
        )}

        <ScanList scans={scans} />

        <div className="mt-12 flex justify-end">
          <button
            onClick={async () => {
              if (confirm("Reset all demo state? You'll be signed out and your scans cleared.")) {
                await clearAllUserData();
                refresh();
              }
            }}
            className="font-sans text-[11px] tracking-wider uppercase text-ink-light hover:text-plum"
          >
            Reset demo state
          </button>
        </div>
      </section>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader showCta={false} />
      <section className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft mb-3">
          Dashboard
        </div>
        <h1 className="font-display font-bold text-[32px] md:text-[44px] text-chrp-black">
          No scans yet.
        </h1>
        <p className="font-sans text-[13px] text-ink-soft mt-3 max-w-md">
          Scan your first track to start building your catalog. After eight
          scans, your Creator Profile unlocks here.
        </p>
        <Link
          href="/scan"
          className="mt-6 inline-flex items-center justify-center font-sans font-bold text-[12px] tracking-wider uppercase bg-chrp-black text-chrp-white px-5 py-3"
        >
          Scan your first track
        </Link>
      </section>
    </div>
  );
}

function CreditsCard({
  credits,
  scanCount,
}: {
  credits: CatalogPurchase;
  scanCount: number;
}) {
  const tier = TIERS[credits.tier];
  const limit = credits.trackLimit;
  const used = credits.tracksUsed;
  const remaining = limit === null ? null : Math.max(0, limit - used);
  const expires = new Date(credits.expiresAt);
  return (
    <div className="mt-6 border border-rule p-4 md:p-5 bg-oat">
      <div className="font-sans text-[10px] tracking-wider uppercase text-ink-soft">
        Active catalog
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div className="font-display font-bold text-[20px] text-chrp-black">
          {tier.label}
        </div>
        <div className="font-sans text-[12px] text-ink-soft">
          {remaining === null
            ? `Unlimited tracks · ${scanCount} scanned`
            : `${remaining} of ${limit} tracks remaining`}
        </div>
        <div className="font-sans text-[11px] text-ink-light">
          Expires {expires.toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}

function ProgressMeter({
  scans,
  threshold,
}: {
  scans: ScanRecordOnAccount[];
  threshold: number;
}) {
  const filled = Math.min(scans.length, threshold);
  return (
    <div className="mt-10">
      <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft">
        Progress to Creator Profile
      </div>
      <div className="mt-2 font-display font-bold text-[24px] md:text-[28px] text-chrp-black">
        {filled} of {threshold} tracks until your creator profile unlocks
      </div>
      <div className="mt-4 flex gap-2 md:gap-3">
        {Array.from({ length: threshold }).map((_, i) => {
          const scan = scans[i];
          const report = scan ? getReportById(scan.trackSlug) : null;
          return (
            <ProgressCell key={i} report={report} index={i + 1} />
          );
        })}
      </div>
      <p className="mt-4 font-sans text-[12px] text-ink-soft max-w-[60ch]">
        Your Creator Profile aggregates the polygon, mode distribution, and
        pitch priorities across every track you scan inside this catalog tier.
        Unlocks automatically at scan 8.
      </p>
    </div>
  );
}

function ProgressCell({
  report,
  index,
}: {
  report: ReportPayload | null;
  index: number;
}) {
  if (!report) {
    return (
      <div
        className="flex-1 aspect-square border border-dashed border-rule flex items-center justify-center"
        style={{ minWidth: 0 }}
      >
        <span className="font-sans text-[11px] text-ink-light">
          {String(index).padStart(2, "0")}
        </span>
      </div>
    );
  }
  const vertices = polygonFromChrpScores(report.chrp_scores);
  return (
    <div
      className="flex-1 aspect-square border border-rule flex items-center justify-center bg-chrp-white"
      style={{ minWidth: 0 }}
    >
      <PolygonRadar
        vertices={vertices}
        mode={report.epi.mode}
        epiScore={report.epi.score}
        size={56}
        showLabels={false}
        showCenter={false}
      />
    </div>
  );
}

function ScanList({ scans }: { scans: ScanRecordOnAccount[] }) {
  return (
    <div className="mt-10">
      <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft">
        Scan history
      </div>
      <div className="hairline mt-1" />
      {scans.length === 0 ? (
        <p className="mt-4 font-sans text-[13px] text-ink-soft">
          No scans yet.
        </p>
      ) : (
        <div className="mt-3 flex flex-col">
          {scans.map((s) => {
            const r = getReportById(s.trackSlug);
            if (!r) return null;
            const chip = MODE_COLORS[r.epi.mode];
            return (
              <Link
                key={s.id}
                href={`/report/${s.id}`}
                className="grid grid-cols-[44px_1fr_auto] items-center gap-4 py-3 border-b border-rule hover:bg-oat"
              >
                <div>
                  <PolygonRadar
                    vertices={polygonFromChrpScores(r.chrp_scores)}
                    mode={r.epi.mode}
                    epiScore={r.epi.score}
                    size={44}
                    showLabels={false}
                    showCenter={false}
                  />
                </div>
                <div className="min-w-0">
                  <div className="font-display font-bold text-[16px] md:text-[18px] leading-tight">
                    {r.track.title}
                  </div>
                  <div className="font-sans text-[11.5px] text-ink-soft mt-0.5">
                    {r.track.artist} &nbsp;·&nbsp;{" "}
                    {new Date(s.scannedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="font-display font-bold text-[18px] md:text-[20px] leading-none">
                    {r.epi.score}
                  </div>
                  <span
                    className="px-2 py-0.5 text-[10px] font-sans font-bold"
                    style={{
                      backgroundColor: chip.chipBg,
                      color: chip.chipText,
                    }}
                  >
                    {r.epi.mode}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
