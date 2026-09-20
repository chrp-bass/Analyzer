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
  type ServerCatalogEntry,
} from "@/lib/memory/catalog.client";
import { fetchIdentityState } from "@/lib/identity-state";
import { songRowFor, type SongRow } from "@/lib/memory/song-row";
import { flushPendingSaves } from "@/lib/scan/save-scan";
import { beginPurchaseWith } from "@/lib/scan/begin-purchase";
import { ensureIdentity } from "@/lib/identity";
import { prepareReport } from "@/lib/data-source";
import { startCheckout } from "@/lib/payments";
import { TIERS } from "@/lib/payments";
import { getFreeReportById, MODE_COLORS } from "@/lib/fixtures/tracks";
import { getCreatorProfile } from "@/lib/fixtures/profile";
import { PolygonRadar } from "@/components/PolygonRadar";
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
  const [entries, setEntries] = useState<Record<string, ServerCatalogEntry>>(
    {},
  );
  const [unlockPrice, setUnlockPrice] = useState<string | null>(null);
  // Bumped when the page is restored from the back/forward cache, so a row
  // left saying "Opening checkout…" on the way out to Stripe starts clean.
  const [rowEpoch, setRowEpoch] = useState(0);
  const [showUnlockBanner, setShowUnlockBanner] = useState(false);
  const [showCatalogCompleteBand, setShowCatalogCompleteBand] = useState(false);
  const [playReveal, setPlayReveal] = useState(false);

  async function refresh() {
    // The SERVER is the only authority here — for who this is, and for what
    // they have. Identity comes from the Supabase session cookie (via
    // /api/identity/state) and the songs from the server catalog tied to
    // that same identity. Nothing is read from localStorage: a browser-only
    // demo identity used to be shown in place of the real creator, which put
    // a stranger's email above a list that could not contain their songs.
    //
    // A song saved just before signing in as an EXISTING identity was saved
    // under the anonymous identity left behind; finish that save under the
    // identity the creator arrived as, before the catalog is read.
    await flushPendingSaves();
    const [server, identity] = await Promise.all([
      fetchServerCatalog(),
      fetchIdentityState(),
    ]);

    if (!server.identified) {
      // No server-verified session (or the memory layer is unavailable).
      setUser(null);
      setScans([]);
      setCredits(null);
      setEntries({});
      setUnlockPrice(null);
      setHydrated(true);
      return;
    }

    // `id` only keys this browser's "already seen" flags for the unlock
    // moments below; it is never sent anywhere or used as authority.
    setUser({
      id: identity.email ?? "server",
      email: identity.email,
      createdAt: "",
    });
    setScans(
      [...server.scans].sort((a, b) => (a.scannedAt < b.scannedAt ? 1 : -1)),
    );
    setCredits(server.credits);
    setEntries(server.entries);
    setUnlockPrice(server.unlockPrice);
    setHydrated(true);
  }

  useEffect(() => {
    refresh();

    // A locked song is unlocked on Stripe's pages, not this one. Whenever the
    // creator comes back to My Songs — the back button, another tab, the
    // window regaining focus — ask the server again, so the row turns from
    // "Unlock" to "View report" on its own, without a manual reload.
    const onShow = (e: PageTransitionEvent) => {
      // `pageshow` also fires on the first load, which the call above covers.
      if (!e.persisted) return;
      setRowEpoch((n) => n + 1);
      refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!user || !hydrated) return;
    (async () => {
      const seenProfile = await hasSeenProfileUnlock(user.id);
      if (!seenProfile && scans.length >= UNLOCK_THRESHOLD) {
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
            entries={entries}
            threshold={UNLOCK_THRESHOLD}
          />
        )}

        <ScanList
          key={rowEpoch}
          scans={scans}
          entries={entries}
          unlockPrice={unlockPrice}
        />

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
          {demoFallbackAllowed() && (
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
          )}
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
  entries,
  threshold,
}: {
  scans: ScanRecordOnAccount[];
  entries: Record<string, ServerCatalogEntry>;
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
          // A cell is filled because the creator HAS that many songs in the
          // server catalog — not because the song happens to be one of the
          // six bundled demo tracks, which is what used to decide it and why
          // a real creator's cells never filled. The shape comes from the
          // server's record of the song.
          const scan = scans[i];
          const highlight = oneAway && i === threshold - 1;
          return (
            <ProgressCell
              key={i}
              filled={Boolean(scan)}
              row={scan ? songRowFor(scan, entries) : null}
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
  filled,
  row,
  index,
  highlight = false,
}: {
  /** The creator has a song in this slot. */
  filled: boolean;
  /** What is known about that song, for the shape. */
  row: SongRow | null;
  index: number;
  highlight?: boolean;
}) {
  if (!filled) {
    return (
      <div
        data-filled="false"
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
  return (
    <div
      data-filled="true"
      className="flex-1 aspect-square border border-rule flex items-center justify-center bg-chrp-white"
      style={{ minWidth: 0 }}
      title={row?.title}
    >
      {row?.vertices && row.mode ? (
        <PolygonRadar
          vertices={row.vertices}
          mode={row.mode}
          epiScore={row.epiScore ?? 0}
          size={56}
          showGrid={false}
          showLabels={false}
          showCenter={false}
        />
      ) : (
        // Counted, but its shape is not on file: still a filled slot.
        <span className="font-sans font-bold text-[11px] text-chrp-black">
          {String(index).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}

function ScanList({
  scans,
  entries,
  unlockPrice,
}: {
  scans: ScanRecordOnAccount[];
  entries: Record<string, ServerCatalogEntry>;
  unlockPrice: string | null;
}) {
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
        <div className="mt-3 flex flex-col scan-history-scroll">
          {scans.map((s) => (
            <SongRowItem
              key={s.id}
              scan={s}
              entries={entries}
              unlockPrice={unlockPrice}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One song in the library.
 *
 * Every scanned song is here. A locked song shows exactly what an unlocked
 * one does — the shape, EPI and mode are the free reveal, and they stay in
 * full colour. The lock is communicated by the action alone: an unlocked row
 * is simply a link to its full report; a locked row carries "Unlock".
 *
 * "Unlock" is the SAME purchase the reveal starts — `beginPurchaseWith`:
 * identity, the report prepared and persisted on the server first, then
 * Stripe Checkout bound to that exact report. Nothing here can grant access;
 * the signed webhook still does that, and the row only ever reflects what
 * the server says afterwards.
 */
function SongRowItem({
  scan,
  entries,
  unlockPrice,
}: {
  scan: ScanRecordOnAccount;
  entries: Record<string, ServerCatalogEntry>;
  unlockPrice: string | null;
}) {
  const [phase, setPhase] = useState<"preparing" | "checkout" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The server's record of the song, not a fixture lookup — a real song is
  // never in the bundled catalogue.
  const r = songRowFor(scan, entries);
  if (!r) return null;
  const chip = r.mode ? MODE_COLORS[r.mode] : null;
  // Locked or unlocked, the row opens the song: /report/[id] resolves to the
  // full report for an entitled creator and to the free reveal otherwise.
  const href = `/report/${scan.id}`;

  function unlock() {
    if (busy) return;
    setBusy(true);
    setError(null);
    beginPurchaseWith(
      {
        ensureIdentity,
        prepareReport,
        startCheckout,
        navigate: (url) => window.location.assign(url),
      },
      "song_intelligence",
      scan.id,
      (message) => {
        setError(message);
        setBusy(false);
        setPhase(null);
      },
      setPhase,
    );
  }

  const cells = (
    <>
      <div>
        {r.vertices && r.mode && (
          <PolygonRadar
            vertices={r.vertices}
            mode={r.mode}
            epiScore={r.epiScore ?? 0}
            size={44}
            showGrid={false}
            showLabels={false}
            showCenter={false}
          />
        )}
      </div>
      <div className="min-w-0">
        <div className="font-display text-[16px] md:text-[18px] leading-tight">
          {r.title}
        </div>
        <div className="font-sans text-[11.5px] text-ink-soft mt-0.5">
          {r.artist ? <>{r.artist} &nbsp;·&nbsp; </> : null}
          {new Date(scan.scannedAt).toLocaleString()}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        {r.epiScore !== null && (
          <div className="font-display text-[18px] md:text-[20px] leading-none">
            {r.epiScore}
          </div>
        )}
        {chip && (
          <span
            className="mode-pill"
            style={{
              backgroundColor: chip.chipBg,
              color: chip.chipText,
              padding: "4px 10px",
              fontSize: 10,
            }}
          >
            {r.mode}
          </span>
        )}
      </div>
    </>
  );

  // The same four columns for both states, so scores line up down the list
  // whether or not a row carries an action.
  const grid =
    "grid grid-cols-[44px_1fr_auto] md:grid-cols-[44px_1fr_auto_150px] items-center gap-x-4 gap-y-2 py-3";

  // UNLOCKED — no label, no button: the row is a link to the full report.
  if (r.entitled) {
    return (
      <Link
        href={href}
        data-scan-id={scan.id}
        data-locked="false"
        className={`${grid} border-b border-rule hover:bg-oat`}
      >
        {cells}
      </Link>
    );
  }

  // LOCKED — identical measurements, in full colour. The only difference is
  // the action: instead of opening a report there is one to unlock.
  return (
    <div
      className="border-b border-rule hover:bg-oat"
      data-scan-id={scan.id}
      data-locked="true"
    >
      <div className={grid}>
        <Link href={href} className="contents" aria-label={`Open ${r.title}`}>
          {cells}
        </Link>
        <div className="col-span-3 md:col-span-1 flex justify-end">
          <button
            type="button"
            onClick={unlock}
            disabled={busy}
            className="font-sans font-bold text-[11px] tracking-wider uppercase px-4 py-2.5 text-center whitespace-nowrap"
            style={{
              backgroundColor: "var(--chrp-yellow)",
              color: "var(--chrp-black)",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy
              ? phase === "preparing"
                ? "Preparing your report…"
                : "Opening checkout…"
              : unlockPrice
                ? `Unlock — ${unlockPrice}`
                : "Unlock"}
          </button>
        </div>
      </div>
      {error && (
        <p
          className="pb-3 font-sans text-[12.5px] text-right"
          style={{ color: "#C990B8" }}
          role="alert"
        >
          {error}
        </p>
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
