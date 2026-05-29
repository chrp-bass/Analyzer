"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import {
  getCurrentUser,
  getUserScans,
  ScanRecordOnAccount,
  User,
} from "@/lib/accounts";
import { getCreatorProfile } from "@/lib/fixtures/profile";
import { getReportById } from "@/lib/fixtures/tracks";
import { CreatorProfileStage } from "@/components/stages/CreatorProfileStage";

const THRESHOLD = 8;

export function DashboardProfile() {
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [scans, setScans] = useState<ScanRecordOnAccount[]>([]);

  useEffect(() => {
    (async () => {
      const u = await getCurrentUser();
      setUser(u);
      if (u) {
        const s = await getUserScans(u.id);
        s.sort((a, b) => (a.scannedAt < b.scannedAt ? 1 : -1));
        setScans(s);
      }
      setHydrated(true);
    })();
  }, []);

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

  if (!user || scans.length < THRESHOLD) {
    return (
      <div className="product-shell">
        <SiteHeader showCta={false} />
        <section className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <span className="eyebrow" style={{ marginBottom: 18 }}>
            Creator profile
          </span>
          <h1
            style={{
              fontFamily: "var(--d)",
              fontWeight: 300,
              fontSize: "clamp(30px, 4vw, 48px)",
              color: "var(--on-light)",
            }}
          >
            Locked until eight scans.
          </h1>
          <p
            style={{
              fontFamily: "var(--s)",
              fontSize: 15,
              color: "var(--on-light-2)",
              marginTop: 14,
              maxWidth: 460,
              lineHeight: 1.6,
            }}
          >
            Scan {THRESHOLD - scans.length} more track
            {THRESHOLD - scans.length === 1 ? "" : "s"} to unlock your
            aggregated profile.
          </p>
          <Link href="/dashboard" className="btn btn-y" style={{ marginTop: 26 }}>
            Back to dashboard
          </Link>
        </section>
        <SiteFooter />
      </div>
    );
  }

  const dominantTrack = scans[0].trackSlug;
  const profile = getCreatorProfile(dominantTrack);
  const report = getReportById(dominantTrack);
  if (!profile || !report) return null;

  return (
    <div className="product-shell">
      <SiteHeader showCta={false} />
      <CreatorProfileStage
        report={report}
        profile={{
          ...profile,
          creator: { ...profile.creator, tracks_scored: scans.length },
        }}
        scans={scans.length}
        artistOverride={null}
        userScans={scans}
      />
      <div className="px-6 md:px-10 pb-10 max-w-[920px] mx-auto w-full">
        <Link
          href="/dashboard"
          style={{
            fontFamily: "var(--s)",
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--gold-2)",
          }}
        >
          &larr; Back to dashboard
        </Link>
      </div>
      <SiteFooter />
    </div>
  );
}
