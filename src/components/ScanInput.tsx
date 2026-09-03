"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  searchSongs,
  beginScanForSong,
  initiateScan,
  fixtureFallbackAllowed,
  ScanError,
  type SongSearchResult,
} from "@/lib/data-source";
import { TRACK_KEYWORD_MAP } from "@/lib/fixtures/tracks";

/**
 * Scan entry.
 *
 * A query goes to the live catalogue and the person picks their own song —
 * we never guess which track they meant. Only songs carrying an ISRC come
 * back, because that is what the engine can score and what becomes the
 * song's durable identity.
 *
 * When the catalogue has nothing, the search fails honestly. In development
 * a query naming one of the six bundled demo tracks still routes to that
 * fixture; in production nothing does.
 */

/** True when the query names one of the bundled demo tracks. */
function matchesSampleTrack(input: string): boolean {
  const lower = input.toLowerCase().trim();
  if (!lower) return false;
  return Object.keys(TRACK_KEYWORD_MAP).some((k) => lower.includes(k));
}

export function ScanInput() {
  const router = useRouter();
  const search = useSearchParams();
  const handedOff = search.get("q") ?? "";

  const [value, setValue] = useState(handedOff);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [results, setResults] = useState<SongSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(
    async (query: string) => {
      setError(null);
      setResults(null);
      setBusy(true);

      try {
        const songs = await searchSongs(query);
        if (songs.length > 0) {
          setResults(songs);
          setBusy(false);
          return;
        }

        // Nothing live.
        //
        // In DEVELOPMENT a query naming one of the bundled demo tracks still
        // routes to that fixture, so the flow stays exercisable without a
        // live catalogue.
        //
        // In PRODUCTION there is no fallback. A real search that finds
        // nothing fails honestly and says so. Substituting fixture
        // intelligence here would hand someone a complete, believable report
        // for a song that was never analysed — the exact failure this path
        // exists to prevent.
        if (fixtureFallbackAllowed() && matchesSampleTrack(query)) {
          const { scanId } = await initiateScan(query);
          router.push(`/scan/${scanId}/processing`);
          return;
        }

        setError(
          "This song isn't available for analysis yet. Try a different version or another track.",
        );
        setBusy(false);
      } catch (err) {
        setError(
          err instanceof ScanError
            ? err.userMessage
            : "Something went wrong. Please try again.",
        );
        setBusy(false);
      }
    },
    [router],
  );

  // A query handed over from the landing-page hero searches straight away, so
  // the person types once and lands on their results.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !handedOff.trim()) return;
    autoRan.current = true;
    runSearch(handedOff);
  }, [handedOff, runSearch]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    await runSearch(value);
  }

  async function choose(song: SongSearchResult) {
    if (starting) return;
    setStarting(song.isrc);
    setError(null);
    try {
      const { scanId } = await beginScanForSong(song);
      // The song's identity travels with it, purely so The Reading can show
      // the record while the analysis runs. Display only — never authority:
      // once the real report lands it replaces these entirely, and nothing
      // downstream reads them.
      const id = new URLSearchParams();
      if (song.songName) id.set("t", song.songName);
      if (song.artistName) id.set("a", song.artistName);
      const tail = id.toString();
      router.push(`/scan/${scanId}/processing${tail ? `?${tail}` : ""}`);
    } catch (err) {
      setError(
        err instanceof ScanError
          ? err.userMessage
          : "Something went wrong. Please try again.",
      );
      setStarting(null);
    }
  }

  return (
    <div>
      <form
        onSubmit={submit}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <label htmlFor="scan-input" className="sr-only">
          Song title or artist
        </label>
        <input
          id="scan-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search a song or artist…"
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
          {busy ? "Searching…" : "Find my song"}
        </button>
      </form>

      {results && results.length > 0 && (
        <div style={{ marginTop: 34 }}>
          <span
            className="eyebrow"
            style={{ display: "block", marginBottom: 14 }}
          >
            Which one is yours?
          </span>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {results.map((song) => {
              const isStarting = starting === song.isrc;
              return (
                <li key={song.isrc}>
                  <button
                    type="button"
                    onClick={() => choose(song)}
                    disabled={starting !== null}
                    style={{
                      width: "100%",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      alignItems: "baseline",
                      gap: 16,
                      padding: "14px 0",
                      borderBottom: "1px solid var(--line-light)",
                      background: "none",
                      border: "none",
                      borderBottomWidth: 1,
                      borderBottomStyle: "solid",
                      borderBottomColor: "var(--line-light)",
                      textAlign: "left",
                      cursor: starting ? "default" : "pointer",
                      opacity: starting && !isStarting ? 0.45 : 1,
                    }}
                  >
                    <span>
                      <span
                        style={{
                          display: "block",
                          fontFamily: "var(--d)",
                          fontWeight: 300,
                          fontSize: 22,
                          color: "var(--on-light)",
                        }}
                      >
                        {song.songName ?? "Untitled"}
                      </span>
                      <span
                        style={{
                          display: "block",
                          marginTop: 2,
                          fontFamily: "var(--s)",
                          fontSize: 12.5,
                          color: "var(--on-light-2)",
                        }}
                      >
                        {song.artistName ?? "Unknown artist"}
                        {song.albumName ? ` · ${song.albumName}` : ""}
                      </span>
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--s)",
                        fontSize: 12,
                        color: "var(--on-light-2)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isStarting ? "Starting…" : "Analyze →"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
