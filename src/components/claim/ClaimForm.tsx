"use client";

import { useState } from "react";

/**
 * The claim page's one question. Posts the address to /api/claim/[token],
 * which sends a magic link that signs the creator in and opens the report.
 */
export function ClaimForm({ token }: { token: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

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
      const res = await fetch(`/api/claim/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { email?: string; error?: string };
      if (res.status === 410) {
        window.location.reload();
        return;
      }
      if (!res.ok || !data.email) throw new Error(data.error ?? "send_failed");
      setSentTo(data.email);
    } catch {
      setError("Something went wrong sending your link. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <p style={{ fontFamily: "var(--s)", fontSize: 15, lineHeight: 1.6, color: "var(--on-light-2)" }}>
        Check your inbox. We sent a link to <b style={{ color: "var(--on-light)" }}>{sentTo}</b>. Click it to
        open your report.{" "}
        <button
          type="button"
          onClick={() => setSentTo(null)}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline", color: "inherit", font: "inherit" }}
        >
          Use a different email
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label htmlFor="claim-email" className="eyebrow" style={{ display: "block", marginBottom: 4 }}>
        Email
      </label>
      <input
        id="claim-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@studio.com"
        style={{ width: "100%", fontSize: 16, padding: "14px 16px" }}
        autoComplete="email"
        autoFocus
      />
      {error && <div style={{ fontFamily: "var(--s)", fontSize: 13, color: "#C12C79" }}>{error}</div>}
      <button
        type="submit"
        disabled={busy}
        className="btn btn-y"
        style={{ marginTop: 8, alignSelf: "flex-start", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "Sending…" : "Send my link"}
      </button>
    </form>
  );
}
