"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/accounts";

type Mode = "checking" | "signed-out" | "signed-in";

/**
 * Nav link that reads the current user on mount and renders either
 * "Sign in" (-> /signin) or "Dashboard" (-> /dashboard). While the
 * hydration read is in flight it renders an invisible placeholder of
 * the same footprint so the header doesn't jump.
 *
 * Both SiteHeader (product-shell pages) and the marketing Nav use this
 * so the whole site speaks the same signed-in state.
 */
export function AuthNavLink() {
  const [mode, setMode] = useState<Mode>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getCurrentUser();
      if (cancelled) return;
      setMode(user ? "signed-in" : "signed-out");
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
