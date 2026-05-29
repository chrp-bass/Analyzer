"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { initiateScan } from "@/lib/data-source";

export function ScanInput() {
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
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label
        htmlFor="scan-input"
        className="eyebrow"
        style={{ display: "block", marginBottom: 4 }}
      >
        Spotify URL or track name
      </label>
      <input
        id="scan-input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://open.spotify.com/track/..."
        style={{ width: "100%", fontSize: 16, padding: "14px 16px" }}
        autoFocus
      />
      {error && (
        <div style={{ fontFamily: "var(--s)", fontSize: 13, color: "#C12C79" }}>
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={busy}
        className="btn btn-y"
        style={{ marginTop: 8, alignSelf: "flex-start", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "Resolving…" : "Analyze"}
      </button>
    </form>
  );
}
