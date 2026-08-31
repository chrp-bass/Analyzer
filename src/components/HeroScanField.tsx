"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Hero scan field — the front door.
 *
 * Per the locked identity rule (VALUE → IDENTITY → MEMORY → PROGRESSION),
 * this path must never ask for an account or an email. A first-time visitor
 * types a song here and goes straight to the read. Identity is offered later,
 * at the point where saving the reveal is worth something to them.
 *
 * This field carries the query to /scan and the real search runs there.
 * It previously called initiateScan() directly, which resolves a query to one
 * of the six bundled demo tracks — falling back to a RANDOM slug when nothing
 * matched. So a real song typed here ("Thunderstruck") silently became a
 * fixture scan. The hero must never mint a scan id itself; only a song the
 * person actually picked from live search results may do that.
 */
export function HeroScanField() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const query = value.trim();
    if (!query) {
      setError("Type a song or artist to scan.");
      return;
    }
    setError(null);
    setBusy(true);
    router.push(`/scan?q=${encodeURIComponent(query)}`);
  }

  return (
    <form className="si-search" onSubmit={submit}>
      <div className="si-search-row">
        <label htmlFor="hero-scan" className="sr-only">
          Search a song or artist
        </label>
        <input
          id="hero-scan"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search a song or artist"
          autoComplete="off"
        />
        <button type="submit" className="si-search-go" disabled={busy}>
          {busy ? "Reading…" : "Scan — free"}
        </button>
      </div>
      {error && (
        <p
          className="si-hero-note"
          style={{ color: "var(--magenta)" }}
          role="alert"
        >
          {error}
        </p>
      )}
      <p className="si-hero-note">
        No credit card, no account. Start with one song.
      </p>
    </form>
  );
}
