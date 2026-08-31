"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ScanInput } from "@/components/ScanInput";
import { trackOptions } from "@/lib/fixtures/tracks";
import { getCurrentUser, User } from "@/lib/accounts";

/**
 * Scan entry.
 *
 * Authentication is NOT the front door. Per the locked identity rule
 * (VALUE → IDENTITY → MEMORY → PROGRESSION), a first-time creator searches,
 * scans and reaches the free reveal with no account and no email. The
 * account infrastructure is untouched and still used — identity is offered
 * later, at the reveal, where saving the result is worth something. Returning
 * users come back through "My songs" / /signin.
 *
 * This component previously gated scanning behind an email capture step.
 * That gate is removed; the magic-link and account plumbing in @/lib/accounts
 * and @/lib/email is deliberately left in place for save/return.
 */
export function ScanFlow() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await getCurrentUser();
      if (cancelled) return;
      setUser(u);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The scan field renders immediately either way — the user read is only
  // used to decide whether to show the quiet "signed in as" line, so it must
  // never delay the front door.
  return <ScanStep user={ready ? user : null} />;
}

function ScanStep({ user }: { user: User | null }) {
  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">
            The first scan
            {user?.email ? (
              <>
                &nbsp;&middot;&nbsp;
                <span style={{ opacity: 0.75 }}>Signed in as {user.email}</span>
              </>
            ) : null}
          </span>
          <h1>Search a song, or paste a link.</h1>
          <p className="sub">
            We&rsquo;ll resolve the track, read its emotional signature, and
            place it on the CHRP grid in about ten seconds.
          </p>
          <p
            style={{
              marginTop: 14,
              fontFamily: "var(--s)",
              fontWeight: 700,
              fontSize: 13,
              color: "var(--on-light-2)",
            }}
          >
            No credit card. No account.
          </p>
        </div>
      </section>

      <section className="page-band">
        <div className="wrap" style={{ maxWidth: 680 }}>
          <ScanInput />

          <div style={{ marginTop: 64 }}>
            <span
              className="eyebrow"
              style={{ display: "block", marginBottom: 18 }}
            >
              Try one of ours
            </span>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {trackOptions.map((t) => (
                <li
                  key={t.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "baseline",
                    gap: 16,
                    padding: "14px 0",
                    borderBottom: "1px solid var(--line-light)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--d)",
                      fontWeight: 300,
                      fontSize: 22,
                      color: "var(--on-light)",
                    }}
                  >
                    {t.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--s)",
                      fontSize: 12,
                      color: "var(--on-light-2)",
                    }}
                  >
                    {t.hint}
                  </span>
                </li>
              ))}
            </ul>
            <p
              style={{
                marginTop: 18,
                fontSize: 12.5,
                color: "var(--on-light-2)",
                lineHeight: 1.55,
              }}
            >
              Type any of the names above in the field, paste a Spotify URL, or
              paste any text &mdash; the demo will route to one of the six
              sample tracks.
            </p>
          </div>

          {!user?.email && (
            <p
              style={{
                marginTop: 40,
                fontFamily: "var(--s)",
                fontSize: 12.5,
                lineHeight: 1.55,
                color: "var(--on-light-2)",
              }}
            >
              Scanned before?{" "}
              <Link
                href="/signin"
                style={{ textDecoration: "underline", color: "inherit" }}
              >
                Find your songs
              </Link>
              .
            </p>
          )}
        </div>
      </section>
    </>
  );
}
