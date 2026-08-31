"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { initiateScan } from "@/lib/data-source";

/**
 * Hero scan field — the front door.
 *
 * Per the locked identity rule (VALUE → IDENTITY → MEMORY → PROGRESSION),
 * this path must never ask for an account or an email. A first-time visitor
 * types a song here and goes straight to the read. Identity is offered later,
 * at the point where saving the reveal is worth something to them.
 */
export function HeroScanField() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const { scanId } = await initiateScan(value);
      router.push(`/scan/${scanId}/processing`);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <form className="si-search" onSubmit={submit}>
      <div className="si-search-row">
        <label htmlFor="hero-scan" className="sr-only">
          Search a song, or paste a link
        </label>
        <input
          id="hero-scan"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search a song, or paste a link"
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
