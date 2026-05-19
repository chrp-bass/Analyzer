"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { consumeMagicToken } from "@/lib/email";
import { setUserEmail } from "@/lib/accounts";

export function MagicLinkClaim({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"signing-in" | "ok" | "invalid">(
    "signing-in",
  );

  useEffect(() => {
    (async () => {
      const result = await consumeMagicToken(token);
      if (!result) {
        // Tokens are one-use. If the user is already signed in (token was
        // consumed earlier in this browser), still send them to the dashboard.
        const existing = window.localStorage.getItem("chrp_user");
        if (existing) {
          setStatus("ok");
          setTimeout(() => router.push("/dashboard"), 600);
        } else {
          setStatus("invalid");
        }
        return;
      }
      await setUserEmail(result.email);
      setStatus("ok");
      setTimeout(() => router.push("/dashboard"), 600);
    })();
  }, [router, token]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft mb-3">
        CHRP &nbsp;//&nbsp; Magic link
      </div>
      {status === "signing-in" && (
        <>
          <div className="font-display italic text-[20px] text-chrp-black">
            Signing you in…
          </div>
          <div className="mt-6 w-8 h-8 border-2 border-chrp-black border-t-transparent rounded-full animate-spin" />
        </>
      )}
      {status === "ok" && (
        <div className="font-display italic text-[20px] text-chrp-black">
          Signed in. Redirecting to your dashboard…
        </div>
      )}
      {status === "invalid" && (
        <div className="font-display italic text-[18px] text-plum max-w-md">
          That magic link has expired or is invalid. Scan a track to start a
          new session.
        </div>
      )}
    </div>
  );
}
