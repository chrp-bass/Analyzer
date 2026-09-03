"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import {
  User,
  CatalogPurchase,
  ScanRecordOnAccount,
  getCurrentUser,
  getUserScans,
  getUserCredits,
  hasSeenProfileUnlock,
  markProfileUnlockSeen,
  hasSeenCatalogComplete,
  markCatalogCompleteSeen,
  clearAllUserData,
  signOut,
} from "@/lib/accounts";
import {
  fetchServerCatalog,
  demoFallbackAllowed,
} from "@/lib/memory/catalog.client";
import { TIERS } from "@/lib/payments";
import { sendProfileUnlock } from "@/lib/email";
import {
  getFreeReportById,
  FreeReport,
  MODE_COLORS,
} from "@/lib/fixtures/tracks";
import { getCreatorProfile } from "@/lib/fixtures/profile";
import { PolygonRadar } from "@/components/PolygonRadar";
import { polygonFromChrpScores } from "@/lib/polygon";
import { CreatorProfileStage } from "@/components/stages/CreatorProfileStage";
import { ProgressCallout } from "@/components/dashboard/ProgressCallout";
import { useRouter } from "next/navigation";

const UNLOCK_THRESHOLD = 8;
const CATALOG_COMPLETE_THRESHOLD = 10;

export function Dashboard() {
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [scans, setScans] = useState<ScanRecordOnAccount[]>([]);
  const [credits, setCredits] = useState<CatalogPurchase | null>(null);
  const [showUnlockBanner, setShowUnlockBanner] = useState(false);
  const [showCatalogCompleteBand, setShowCatalogCompleteBand] = useState(false);
  const [playReveal, setPlayReveal] = useState(false);

  async function refresh() {
    // The SERVER is the authority for catalog and credit balance. It is asked
    // first, and when it answers for a verified identity its answer is the
    // only one used — a cleared or edited localStorage cannot add a scan,
    // restore a spent credit, or extend an entitlement.
    const server = await fetchServerCatalog();
    if (server.identified) {
      const u = await getCurrentUser();
      setUser(u ?? { id: "server", email: null, createdAt: "" });
      const s = [...server.scans].sort((a, b) =>
        a.scannedAt < b.scannedAt ? 1 : -1,
      );
      setScans(s);
      setCredits(server.credits);
      setHydrated(true);
      return;
    }

    // No server memory available. In local development the browser-backed
    // demo catalog still renders so the flow stays exercisable; in production
    // this branch is unreachable and the dashboard simply shows nothing.
    if (!demoFallbackAllowed()) {
      setUser(null);
      setScans([]);
      setCredits(null);
      setHydrated(true);
      return;
    }

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
      const seenProfile = await hasSeenProfileUnlock(user.id);
      if (!seenProfile && scans.length >= UNLOCK_THRESHOLD) {
        await sendProfileUnlock(user.id);
        setShowUnlockBanner(true);
        setPlayReveal(true);
        await markProfileUnlockSeen(user.id);
        setTimeout(() => setShowUnlockBanner(false), 14000);
      }
      const seenComplete = await hasSeenCatalogComplete(user.id);
      if (!seenComplete && scans.length >= CATALOG_COMPLETE_THRESHOLD) {
        setShowCatalogCompleteBand(true);
        await markCatalogCompleteSeen(user.id);
      }
    })();
  }, [user, hydrated, scans.length]);

  if (!hydrated) {
    return (
      <div className="product-shell">
        <SiteHeader showCta={false} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-chrp-black border-t-transparent rounded-full animate-spin" />
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (!user) return <EmptyState />;

  const unlocked = scans.length >= UNLOCK_THRESHOLD;
  const catalogComplete = scans.length >= CATALOG_COMPLETE_THRESHOLD;
  const dominantTrack = scans[0]?.trackSlug ?? "copper-static";
  const profile = getCreatorProfile(dominantTrack);
  const dominantReport = getFreeReportById(dominantTrack);

  return (
    <div className="product-shell">
      <SiteHeader showCta={false} />
      <AnimatePresence>
        {showCatalogCompleteBand && (
          <CatalogCompleteBand
            key="catalog-complete"
            onDismiss={() => setShowCatalogCompleteBand(false)}
          />
        )}
        {showUnlockBanner && (
          <motion.div
            key="profile-banner"
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
                  userScans={scans}
                  playReveal={playReveal}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-[32px] md:text-[44px] leading-[1.0] text-chrp-black display-tight">
              Your scans
            </h1>
            <p className="font-sans text-[12px] text-ink-soft mt-1 flex items-center gap-2 flex-wrap">
              Signed in as{" "}
              <span className="text-chrp-black">{user.email ?? "guest"}</span>
              {catalogComplete && (
                <span
                  className="font-sans font-bold text-[8px] tracking-wider uppercase px-2 py-0.5"
                  style={{
                    backgroundColor: "var(--chrp-yellow)",
                    color: "var(--chrp-black)",
                  }}
                >
                  Catalog Complete
                </span>
              )}
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

        {!unlocked && <ProgressCallout scans={scans} />}

        {!unlocked && (
          <ProgressMeter
            scans={scans}
            threshold={UNLOCK_THRESHOLD}
          />
        )}

        <ScanList scans={scans} />

        <div className="mt-12 flex flex-wrap justify-end items-center gap-x-6 gap-y-2">
          <button
            onClick={async () => {
              await signOut();
              // Send them back to the marketing landing; their scans + catalog
              // stay in localStorage indexed by email so signing back in on
              // this browser restores everything.
              window.location.href = "/";
            }}
            className="font-sans text-[11px] tracking-wider uppercase text-ink-soft hover:text-chrp-black"
          >
            Sign out
          </button>
          <button
            onClick={async () => {
              if (confirm("Reset all demo state? This wipes your scans, catalog, and account on this browser.")) {
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
      <SiteFooter />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="product-shell">
      <SiteHeader showCta={false} />
      <section className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <span className="eyebrow" style={{ marginBottom: 18 }}>Dashboard</span>
        <h1
          style={{
            fontFamily: "var(--d)",
            fontWeight: 300,
            fontSize: "clamp(34px, 4.4vw, 56px)",
            lineHeight: 1.05,
            color: "var(--on-light)",
          }}
        >
          No scans yet.
        </h1>
        <p
          style={{
            fontFamily: "var(--s)",
            fontSize: 16,
            color: "var(--on-light-2)",
            marginTop: 14,
            maxWidth: 440,
            lineHeight: 1.6,
          }}
        >
          Scan your first track to start building your catalog. After eight
          scans, your Creator Profile unlocks here.
        </p>
        <Link href="/scan" className="btn btn-y" style={{ marginTop: 28 }}>
          Scan your first track
        </Link>
        <Link
          href="/signin"
          style={{
            marginTop: 18,
            fontFamily: "var(--s)",
            fontSize: 12.5,
            color: "var(--on-light-2)",
            textDecoration: "underline",
          }}
        >
          Already have an account? Sign in &rarr;
        </Link>
      </section>
      <SiteFooter />
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
  // Guard the lookup: a returning user may hold a CatalogPurchase whose
  // tier id was removed in the two-tier migration. Fall back to the current
  // catalog tier so the card renders instead of crashing on undefined.
  const tier = TIERS[credits.tier] ?? TIERS.artist_catalog;
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
        <div className="font-display text-[20px] text-chrp-black">
          ${tier.priceUsd.toLocaleString()} {tier.label}
        </div>
        <div className="font-sans text-[12px] text-ink-soft">
          {remaining === null
            ? `Unlimited tracks · ${scanCount} scanned`
            : `${used} of ${limit} scans used · ${remaining} remaining`}
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
  const oneAway = scans.length === threshold - 1;
  return (
    <div className="mt-10">
      <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft">
        Progress to Creator Profile
      </div>
      <div className="mt-2 font-display text-[24px] md:text-[28px] text-chrp-black">
        {filled} of {threshold} tracks until your creator profile unlocks
      </div>
      <div className="mt-4 flex gap-2 md:gap-3">
        {Array.from({ length: threshold }).map((_, i) => {
          const scan = scans[i];
          const report = scan ? getFreeReportById(scan.trackSlug) : null;
          const highlight = oneAway && i === threshold - 1;
          return (
            <ProgressCell
              key={i}
              report={report}
              index={i + 1}
              highlight={highlight}
            />
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
  highlight = false,
}: {
  report: FreeReport | null;
  index: number;
  highlight?: boolean;
}) {
  if (!report) {
    return (
      <div
        className={`flex-1 aspect-square border ${
          highlight
            ? "border-solid animate-pulse"
            : "border-dashed border-rule"
        } flex items-center justify-center`}
        style={{
          minWidth: 0,
          ...(highlight
            ? {
                borderColor: "var(--chrp-yellow)",
                boxShadow: "0 0 0 1px var(--chrp-yellow) inset",
                backgroundColor: "rgba(255, 209, 0, 0.08)",
              }
            : {}),
        }}
      >
        <span
          className="font-sans text-[11px]"
          style={{ color: highlight ? "var(--chrp-black)" : "var(--ink-light)" }}
        >
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
        showGrid={false}
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
            const r = getFreeReportById(s.trackSlug);
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
                    showGrid={false}
                    showLabels={false}
                    showCenter={false}
                  />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-[16px] md:text-[18px] leading-tight">
                    {r.track.title}
                  </div>
                  <div className="font-sans text-[11.5px] text-ink-soft mt-0.5">
                    {r.track.artist} &nbsp;·&nbsp;{" "}
                    {new Date(s.scannedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="font-display text-[18px] md:text-[20px] leading-none">
                    {r.epi.score}
                  </div>
                  <span
                    className="mode-pill"
                    style={{
                      backgroundColor: chip.chipBg,
                      color: chip.chipText,
                      padding: "4px 10px",
                      fontSize: 10,
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

function CatalogCompleteBand({ onDismiss }: { onDismiss: () => void }) {
  const router = useRouter();
  const [tooltipOpen, setTooltipOpen] = useState(false);
  return (
    <motion.div
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="px-5 md:px-8 py-5 md:py-6"
      style={{ backgroundColor: "var(--chrp-yellow)", color: "var(--chrp-black)" }}
    >
      <div className="max-w-[1100px] mx-auto flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
        <div className="flex-1">
          <div className="font-sans font-black text-[10px] tracking-wider uppercase">
            Catalog complete
          </div>
          <p className="mt-1.5 font-display text-[20px] md:text-[24px] leading-[1.15]">
            Your full Artist Catalog has been read.
          </p>
          <p className="mt-2 font-sans text-[12.5px] md:text-[13px] leading-[1.55] max-w-[60ch]">
            Your signature is documented and the patterns across your songs
            are mapped. Add new releases as they come out to keep the picture
            current &mdash; each song you add changes what the others mean.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push("/scan?tier=artist_catalog")}
              className="font-sans font-bold text-[11.5px] tracking-wider uppercase bg-chrp-black text-chrp-white px-4 py-2.5"
            >
              Scan another track
            </button>
            <div className="relative">
              <button
                onClick={() => setTooltipOpen((v) => !v)}
                className="font-sans font-bold text-[11.5px] tracking-wider uppercase border border-chrp-black px-4 py-2.5"
              >
                Stay current with new releases
              </button>
              {tooltipOpen && (
                <div className="absolute z-10 left-0 mt-2 w-[280px] bg-chrp-white border border-chrp-black p-3 text-chrp-black font-sans text-[11.5px] leading-snug">
                  When you release new music, add it to your existing catalog
                  to keep your fingerprint, signature, and reliability index
                  reflecting your current body of work.
                </div>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="font-sans text-[10px] tracking-wider uppercase opacity-70 hover:opacity-100 self-start"
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </div>
    </motion.div>
  );
}
