"use client";

import { useEffect, useRef, useState } from "react";
import { ensureIdentity } from "@/lib/identity";

/**
 * Client island for the post-payment /success page.
 *
 * The paying identity may not be the identity currently in the browser —
 * cookies get cleared, JWTs expire, people return on another device. This
 * component ensures a Supabase session exists, then asks the server to
 * rebind the paid Stripe session to the current caller's user_id. When the
 * server confirms, we navigate to /preview.
 *
 * The server enforces the rules — this component just drives them.
 */
export function RebindOnSuccess({
  scanId,
  sessionId,
}: {
  scanId: string;
  sessionId: string;
}) {
  const [state, setState] = useState<"working" | "retry" | "failed">("working");
  const attempts = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // Establish a cookie identity if this browser has none. Without an
        // identity the server has no one to bind the entitlement to.
        await ensureIdentity();

        const res = await fetch("/api/scan/rebind", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ scanId, sessionId }),
        });

        if (cancelled) return;

        if (res.ok) {
          // Success — the entitlement is now readable for this session. Do a
          // full navigation so the RSC access check re-runs from the fresh
          // cookie state.
          window.location.replace(`/scan/${scanId}/preview?paid=1`);
          return;
        }

        // A 409 typically means the Stripe session isn't paid yet — retry
        // once, then leave the meta-refresh fallback to take over.
        attempts.current += 1;
        if (attempts.current < 3) {
          setState("retry");
          setTimeout(run, 2000);
        } else {
          setState("failed");
        }
      } catch {
        attempts.current += 1;
        if (attempts.current < 3) {
          setState("retry");
          setTimeout(run, 2000);
        } else {
          setState("failed");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [scanId, sessionId]);

  // Visually silent — the surrounding page already renders the waiting
  // state. `state` drives the meta-refresh fallback for terminal cases.
  return (
    <>
      {state === "failed" ? (
        <meta httpEquiv="refresh" content="4" />
      ) : null}
    </>
  );
}
