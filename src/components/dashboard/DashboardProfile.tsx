"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
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
      <div className="min-h-screen flex flex-col">
        <SiteHeader showCta={false} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-chrp-black border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user || scans.length < THRESHOLD) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader showCta={false} />
        <section className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="font-display font-bold text-[28px] md:text-[36px] text-chrp-black">
            Creator profile is locked.
          </div>
          <p className="font-sans text-[13px] text-ink-soft mt-3 max-w-md">
            Scan {THRESHOLD - scans.length} more track
            {THRESHOLD - scans.length === 1 ? "" : "s"} to unlock your aggregated
            profile.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 font-sans font-bold text-[12px] tracking-wider uppercase bg-chrp-black text-chrp-white px-5 py-3"
          >
            Back to dashboard
          </Link>
        </section>
      </div>
    );
  }

  const dominantTrack = scans[0].trackSlug;
  const profile = getCreatorProfile(dominantTrack);
  const report = getReportById(dominantTrack);
  if (!profile || !report) return null;

  return (
    <div className="min-h-screen flex flex-col">
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
          className="font-sans text-[11px] tracking-wider uppercase text-ink-light hover:text-chrp-black"
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
