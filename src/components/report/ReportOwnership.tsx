"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { linkEmail } from "@/lib/identity";

/**
 * Keep this report.
 *
 * The hole this fills: a creator could receive a complete Song Intelligence
 * report — free or paid — and have no way to take possession of it. The real
 * $19 purchase ended with the report correctly owned in the database by an
 * anonymous creator reachable only from one browser session.
 *
 * The order is value first, ownership second, identity only when needed. This
 * sits AFTER the intelligence, never before it, and asks for an email and
 * nothing else — no name, no password, no profile, no account page.
 *
 * Identity reconciliation is `linkEmail`, which upgrades the SAME anonymous
 * user rather than creating a second one, so the report, the entitlement and
 * the first-free-used state are preserved exactly. If verification is never
 * completed the report is untouched and the creator can try again.
 *
 * Stripe's address only ever prefills the field. Confirming it still goes
 * through the ordinary verification before any creator history opens.
 */

type Ownership = "verified" | "anonymous" | "none" | "loading";

export function ReportOwnership({
  scanId,
  songTitle,
}: {
  scanId: string;
  songTitle?: string;
}) {
  const [ownership, setOwnership] = useState<Ownership>("loading");
  const [email, setEmail] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailedReport, setEmailedReport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/identity/state?scanId=${encodeURIComponent(scanId)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (cancelled) return;
        setOwnership(data.ownership ?? "none");
        if (data.prefillEmail) setEmail(data.prefillEmail);
      } catch {
        if (!cancelled) setOwnership("none");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scanId]);

  async function submitEmail(e: React.FormEvent) {
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
      const result = await linkEmail(trimmed);
      if (result.ok) {
        setSent(true);
      } else {
        setError(
          result.reason === "not_configured"
            ? "Saving isn’t available right now. Your report is safe — this page stays yours."
            : "We couldn’t send your link just now. Your report is safe — try again in a moment.",
        );
      }
    } catch {
      setError(
        "We couldn’t send your link just now. Your report is safe — try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function emailToVerified() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/report/${encodeURIComponent(scanId)}/email`, {
        method: "POST",
      });
      if (res.ok) setEmailedReport(true);
      else setError("We couldn’t send it just now. Your report is safe — try again shortly.");
    } catch {
      setError("We couldn’t send it just now. Your report is safe — try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  // Nothing is rendered until ownership is known, and nothing needs to be:
  // the completed report is already on screen above this block, so there is
  // no waiting viewport here to leave empty.
  if (ownership === "loading") return null;

  const owned = ownership === "verified";

  return (
    <section className="rp-own" aria-labelledby="rp-own-head">
      <div className="rp-own-inner">
        <p className="rp-own-eyebrow">
          {owned ? "Saved to My Songs" : "Keep this report"}
        </p>
        <h2 id="rp-own-head" className="rp-own-title">
          {owned
            ? "This one’s yours."
            : "Your Song Intelligence is ready."}
        </h2>

        {owned ? (
          <>
            <p className="rp-own-note">
              {songTitle ? `${songTitle} is ` : "It’s "}in your songs, and it
              stays there. You can come back to it from any browser.
            </p>
            <div className="rp-own-actions">
              <button
                type="button"
                className="btn btn-y"
                onClick={emailToVerified}
                disabled={busy || emailedReport}
              >
                {emailedReport
                  ? "Sent — check your inbox"
                  : busy
                    ? "Sending…"
                    : "Email me this report"}
              </button>
              <Link href="/dashboard" className="btn btn-ghost">
                View my songs
              </Link>
            </div>
          </>
        ) : sent ? (
          <p className="rp-own-note">
            Check your inbox — we sent a link that brings you straight back to
            this report and to your songs. Nothing here is lost in the
            meantime.
          </p>
        ) : (
          <>
            {!capturing ? (
              <>
                <p className="rp-own-note">
                  Right now this report lives in this browser. Add an email and
                  it becomes yours everywhere.
                </p>
                <div className="rp-own-actions">
                  <button
                    type="button"
                    className="btn btn-y"
                    onClick={() => setCapturing(true)}
                  >
                    Email this report
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setCapturing(true)}
                  >
                    Save to My Songs
                  </button>
                </div>
              </>
            ) : (
              <form className="rp-own-form" onSubmit={submitEmail}>
                <p className="rp-own-note" style={{ gridColumn: "1 / -1" }}>
                  Your email, and nothing else. We’ll send a link that saves
                  this report to your songs and brings you back to it later.
                </p>
                <label htmlFor="rp-own-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="rp-own-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@studio.com"
                  autoComplete="email"
                  autoFocus
                  required
                />
                <button type="submit" className="btn btn-y" disabled={busy}>
                  {busy ? "Sending…" : "Send my link"}
                </button>
              </form>
            )}
          </>
        )}

        {error && (
          <p className="rp-own-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
