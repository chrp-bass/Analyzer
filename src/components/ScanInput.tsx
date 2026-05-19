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
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label
        htmlFor="scan-input"
        className="font-sans text-[11px] tracking-wider uppercase text-ink-soft"
      >
        Spotify URL or track name
      </label>
      <input
        id="scan-input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://open.spotify.com/track/..."
        className="w-full font-sans text-[15px] md:text-[16px] text-chrp-black bg-chrp-white border border-rule px-4 py-3 focus:outline-none focus:border-chrp-black"
        autoFocus
      />
      {error && (
        <div className="font-sans text-[12px] text-plum">{error}</div>
      )}
      <button
        type="submit"
        disabled={busy}
        className="mt-2 inline-flex items-center justify-center font-sans font-bold text-[13px] tracking-wider uppercase bg-chrp-black text-chrp-white px-6 py-4 disabled:opacity-60"
      >
        {busy ? "Resolving…" : "Analyze"}
      </button>
    </form>
  );
}
