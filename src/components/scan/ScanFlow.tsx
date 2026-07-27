"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ScanInput } from "@/components/ScanInput";
import { trackOptions } from "@/lib/fixtures/tracks";
import {
  getCurrentUser,
  setUserEmail,
  signInByEmail,
  User,
} from "@/lib/accounts";
import { sendMagicLink } from "@/lib/email";

// Beta demo affordance: since sendMagicLink logs to console instead of
// sending real email, the confirmation surfaces a direct "sign in now"
// link for the current session.
const BETA_MODE = process.env.NEXT_PUBLIC_BETA_MODE !== "false";

type Stage = "checking" | "capture" | "scan";

/**
 * Two-step scan gate.
 *   1. Capture — user with no email (fresh visitor or pre-migration guest)
 *      is asked to enter one before scanning. Email is saved on the User
 *      row and a magic link is sent so they can sign back in later.
 *   2. Scan — the existing ScanInput + sample-tracks list.
 * A signed-in visitor lands on the scan step directly.
 */
export function ScanFlow() {
  const [stage, setStage] = useState<Stage>("checking");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    (async () => {
      const u = await getCurrentUser();
      setUser(u);
      setStage(u?.email ? "scan" : "capture");
    })();
  }, []);

  if (stage === "checking") {
    // Same shell as the scan step so the layout doesn't jump on hydration.
    return (
      <div style={{ minHeight: 400 }} aria-hidden />
    );
  }

  if (stage === "capture") {
    return (
      <EmailCaptureStep
        onDone={(nextUser) => {
          setUser(nextUser);
          setStage("scan");
        }}
      />
    );
  }

  return <ScanStep user={user} />;
}

function EmailCaptureStep({
  onDone,
}: {
  onDone: (user: User) => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = email.trim();
    if (!trimmed.includes("@") || trimmed.length < 5) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // If there's already a guest session, attach the email to it.
      // Otherwise restore an existing account if this email matches one
      // on this browser (signOut path), or create a fresh account.
      const existing = await getCurrentUser();
      const updated = existing
        ? await setUserEmail(trimmed)
        : await signInByEmail(trimmed);
      if (!updated) throw new Error("Failed to create account");
      // Fire the magic link so the user has a return-path on file. In beta
      // this is a console log; in prod it's a real email.
      await sendMagicLink(trimmed);
      onDone(updated);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">Step 1 of 3 &middot; Create your account</span>
          <h1>Start with your email.</h1>
          <p className="sub">
            Your scans live on your account. Sign back in anytime to see this
            song and every track you scan after it.
          </p>
        </div>
      </section>

      <section className="page-band">
        <div className="wrap" style={{ maxWidth: 520 }}>
          <form
            onSubmit={submit}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <label
              htmlFor="account-email"
              className="eyebrow"
              style={{ display: "block", marginBottom: 4 }}
            >
              Email
            </label>
            <input
              id="account-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@studio.com"
              style={{ width: "100%", fontSize: 16, padding: "14px 16px" }}
              autoComplete="email"
              autoFocus
            />
            {error && (
              <div
                style={{ fontFamily: "var(--s)", fontSize: 13, color: "#C12C79" }}
              >
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="btn btn-y"
              style={{
                marginTop: 8,
                alignSelf: "flex-start",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? "Setting up…" : "Continue to scan"}
            </button>
          </form>

          <p
            style={{
              fontFamily: "var(--s)",
              fontSize: 12.5,
              lineHeight: 1.55,
              color: "var(--on-light-2)",
              marginTop: 28,
            }}
          >
            {BETA_MODE
              ? "During beta, sessions live in the browser you sign up on. A magic-link email is queued so you can sign back in on this device."
              : "We'll email you a magic link so you can sign back in from any device."}
          </p>

          <div style={{ marginTop: 20 }}>
            <Link
              href="/signin"
              style={{
                fontFamily: "var(--s)",
                fontSize: 12,
                color: "var(--on-light-2)",
                textDecoration: "underline",
              }}
            >
              Already have an account? Sign in &rarr;
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function ScanStep({ user }: { user: User | null }) {
  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">
            Step 2 of 3
            {user?.email ? (
              <>
                &nbsp;&middot;&nbsp;
                <span style={{ opacity: 0.75 }}>Signed in as {user.email}</span>
              </>
            ) : null}
          </span>
          <h1>Paste a Spotify link.</h1>
          <p className="sub">
            We&rsquo;ll resolve the track, read its emotional fingerprint, and
            place it on the CHRP grid in about ten seconds.
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
        </div>
      </section>
    </>
  );
}
