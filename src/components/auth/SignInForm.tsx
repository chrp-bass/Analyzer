"use client";

import { useState } from "react";
import Link from "next/link";
import { sendMagicLink } from "@/lib/email";

// Beta demo affordance: since sendMagicLink logs to console instead of
// sending real email, the success screen surfaces a direct "sign in now"
// link. Flip NEXT_PUBLIC_BETA_MODE to "false" once real email is wired.
const BETA_MODE = process.env.NEXT_PUBLIC_BETA_MODE !== "false";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [demoToken, setDemoToken] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = email.trim();
    if (!trimmed.includes("@") || trimmed.length < 5) {
      setError("Enter the email you used at checkout.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { token } = await sendMagicLink(trimmed);
      setSentTo(trimmed);
      setDemoToken(token);
    } catch (err) {
      console.error(err);
      setError("Something went wrong sending your link. Try again.");
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="wrap" style={{ maxWidth: 520, margin: "0 auto" }}>
        <span className="eyebrow" style={{ display: "block", marginBottom: 12 }}>
          Sign in
        </span>
        <h1
          style={{
            fontFamily: "var(--d)",
            fontWeight: 300,
            fontSize: "clamp(28px, 3.4vw, 40px)",
            lineHeight: 1.1,
            color: "var(--on-light)",
            marginBottom: 14,
          }}
        >
          Check your inbox.
        </h1>
        <p
          style={{
            fontFamily: "var(--s)",
            fontSize: 15,
            lineHeight: 1.6,
            color: "var(--on-light-2)",
            marginBottom: 24,
          }}
        >
          Magic link sent to <b style={{ color: "var(--on-light)" }}>{sentTo}</b>.
          Click the link in the email to sign in and land back on your dashboard.
        </p>

        {BETA_MODE && demoToken && (
          <div
            style={{
              padding: "16px 18px",
              background: "var(--oat-2)",
              border: "1px solid var(--line-light)",
              borderRadius: 6,
              marginBottom: 20,
            }}
          >
            <div
              className="eyebrow"
              style={{ display: "block", marginBottom: 6 }}
            >
              Beta shortcut
            </div>
            <p
              style={{
                fontFamily: "var(--s)",
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--on-light-2)",
                marginBottom: 12,
              }}
            >
              During beta the email is logged to your console. Click below to
              sign in without opening it.
            </p>
            <Link
              href={`/auth/claim/${demoToken}`}
              className="btn btn-y"
              style={{ fontSize: 13 }}
            >
              Sign in now &rarr;
            </Link>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setDemoToken(null);
              setBusy(false);
            }}
            style={{
              fontFamily: "var(--s)",
              fontSize: 12,
              color: "var(--on-light-2)",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ maxWidth: 520, margin: "0 auto" }}>
      {/* Top affordance for people who landed here but don't yet have an
       * account — sits above the heading so they can bail out fast. */}
      <div
        style={{
          padding: "10px 14px",
          background: "var(--oat-2)",
          border: "1px solid var(--line-light)",
          borderRadius: 6,
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--s)",
            fontSize: 12.5,
            color: "var(--on-light-2)",
          }}
        >
          New to CHRP?
        </span>
        <Link
          href="/scan"
          style={{
            fontFamily: "var(--s)",
            fontSize: 12.5,
            fontWeight: 700,
            color: "var(--on-light)",
            textDecoration: "underline",
          }}
        >
          Start with a free scan &rarr;
        </Link>
      </div>

      <span className="eyebrow" style={{ display: "block", marginBottom: 12 }}>
        Sign in
      </span>
      <h1
        style={{
          fontFamily: "var(--d)",
          fontWeight: 300,
          fontSize: "clamp(28px, 3.4vw, 40px)",
          lineHeight: 1.1,
          color: "var(--on-light)",
          marginBottom: 14,
        }}
      >
        Sign back in.
      </h1>
      <p
        style={{
          fontFamily: "var(--s)",
          fontSize: 15,
          lineHeight: 1.6,
          color: "var(--on-light-2)",
          marginBottom: 28,
        }}
      >
        Enter the email you used at checkout. We&rsquo;ll send a magic link that
        takes you straight to your dashboard, where your catalog credits and
        scans live.
      </p>

      <form
        onSubmit={submit}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <label
          htmlFor="signin-email"
          className="eyebrow"
          style={{ display: "block", marginBottom: 4 }}
        >
          Email
        </label>
        <input
          id="signin-email"
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
          style={{ marginTop: 8, alignSelf: "flex-start", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Sending…" : "Send magic link"}
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
        During beta, sessions live in the browser you purchased with. If you
        bought on another device, sign in there or reset to start fresh.
      </p>

      {/* One free-scan door, not two. "New to CHRP? Start with a free scan"
          sits above the form, where someone who does not have an account
          reaches it before spending anything on the sign-in path. */}
    </div>
  );
}
