"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchIdentityState } from "@/lib/identity-state";

type Mode = "checking" | "signed-out" | "signed-in";

/**
 * Nav link that asks the SERVER who this is on mount and renders either
 * "Sign in" (-> /signin) or "Dashboard" (-> /dashboard). While the read is
 * in flight it renders an invisible placeholder of the same footprint so the
 * header doesn't jump.
 *
 * The answer comes from the Supabase session cookie via /api/identity/state.
 * Any real session — verified, or the anonymous identity that owns this
 * browser's reports — gets "Dashboard", because My Songs is where that
 * identity's songs live. A localStorage demo user no longer has a say.
 *
 * Both SiteHeader (product-shell pages) and the marketing Nav use this
 * so the whole site speaks the same signed-in state.
 */
export function AuthNavLink() {
  const [mode, setMode] = useState<Mode>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const identity = await fetchIdentityState();
      if (cancelled) return;
      setMode(identity.ownership === "none" ? "signed-out" : "signed-in");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const baseStyle = {
    fontFamily: "var(--s)",
    fontSize: 13,
    fontWeight: 700 as const,
    letterSpacing: "0.02em",
    opacity: 0.85,
  };

  if (mode === "checking") {
    return (
      <span
        aria-hidden
        style={{ ...baseStyle, visibility: "hidden" }}
      >
        Sign in
      </span>
    );
  }

  if (mode === "signed-in") {
    return (
      <Link href="/dashboard" style={baseStyle}>
        Dashboard
      </Link>
    );
  }

  return (
    <Link href="/signin" style={baseStyle}>
      Sign in
    </Link>
  );
}
