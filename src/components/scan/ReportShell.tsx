"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ReportPayload } from "@/lib/fixtures/tracks";
import { ReportPage } from "@/components/ReportPage";
import { getScanById } from "@/lib/scan-id";
import { getCurrentUser } from "@/lib/accounts";

export function ReportShell({
  report,
  scanId,
  welcome,
  email,
}: {
  report: ReportPayload;
  scanId: string;
  trackSlug: string;
  welcome: boolean;
  email: string | null;
}) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<"checking" | "ok" | "blocked">(
    "checking",
  );
  const [showBanner, setShowBanner] = useState(welcome);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const scan = getScanById(scanId);
      if (scan?.paid) {
        if (!cancelled) setAuthorized("ok");
        return;
      }
      const user = await getCurrentUser();
      if (user) {
        if (!cancelled) setAuthorized("ok");
        return;
      }
      if (!cancelled) setAuthorized("blocked");
    })();
    return () => {
      cancelled = true;
    };
  }, [scanId]);

  if (authorized === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-chrp-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (authorized === "blocked") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="font-display text-[28px] text-chrp-black">
          This report is locked.
        </div>
        <p className="font-sans text-[13px] text-ink-soft mt-3 max-w-md">
          You haven&rsquo;t paid for this scan or signed in. Re-scan the track
          to unlock it.
        </p>
        <button
          onClick={() => router.push(`/scan/${scanId}/preview`)}
          className="mt-6 font-sans font-bold text-[12px] tracking-wider uppercase bg-chrp-black text-chrp-white px-5 py-3"
        >
          Go to paywall
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {showBanner && (
        <div
          className="sticky top-0 z-30 px-5 py-3 flex items-center justify-between gap-4"
          style={{
            backgroundColor: "var(--chrp-yellow)",
            color: "var(--chrp-black)",
          }}
        >
          <div className="font-sans text-[12px] md:text-[13px] leading-snug">
            <span className="font-bold">Magic link sent</span>
            {email ? ` to ${email}.` : "."} &nbsp;
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
        </div>
      )}
      <ReportPage report={report} id={scanId} />
    </div>
  );
}
