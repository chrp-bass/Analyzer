"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function ScanUnlocking({ scanId }: { scanId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [dots, setDots] = useState(".");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 350);
    const t = setTimeout(() => {
      const email = search.get("email");
      const url = email
        ? `/report/${scanId}?welcome=1&email=${encodeURIComponent(email)}`
        : `/report/${scanId}?welcome=1`;
      router.push(url);
    }, 1200);
    return () => {
      clearInterval(interval);
      clearTimeout(t);
    };
  }, [router, scanId, search]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft mb-3">
        CHRP &nbsp;//&nbsp; Unlocking your report
      </div>
      <div className="font-display italic text-[22px] md:text-[28px] text-chrp-black">
        Preparing your fingerprint{dots}
      </div>
      <div className="mt-6 w-10 h-10 border-2 border-chrp-black border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
