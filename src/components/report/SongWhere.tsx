"use client";

import { useEffect, useState } from "react";
import type { SongWhereResponse } from "@/lib/song-where/dto";

/** Extract a readable platform name from the source identifier. */
function platformLabel(sourceName: string): string {
  // Source names follow patterns like "public-www.example.com-abc123" or "feed-abc123" or "Approved source"
  const hostMatch = sourceName.match(/^(?:public|feed)-(?:www\.)?([^-]+(?:\.[^-]+)*)-[a-f0-9]+$/);
  if (hostMatch) {
    const domain = hostMatch[1];
    // Title-case the first segment of the domain
    const name = domain.split(".")[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return sourceName.replace(/^public-/, "").replace(/-[a-f0-9]{8}$/, "");
}

export function SongWhere({ scanId }: { scanId: string }) {
  const [matches, setMatches] = useState<SongWhereResponse["matches"] | null>(null);
  const [alertsEnabled, setAlertsEnabled] = useState<boolean | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    fetch(`/api/song-where/${encodeURIComponent(scanId)}`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<SongWhereResponse> : null)
      .then((body) => { if (active) setMatches(body?.matches ?? null); })
      .catch(() => { if (active) setMatches(null); });
    return () => { active = false; };
  }, [scanId]);
  useEffect(() => {
    let active = true;
    fetch(`/api/song-where/prefs?scanId=${encodeURIComponent(scanId)}`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ alertsEnabled: boolean }> : null)
      .then((body) => { if (active && body) setAlertsEnabled(body.alertsEnabled); })
      .catch(() => {});
    return () => { active = false; };
  }, [scanId]);
  async function changeAlerts(enabled: boolean) {
    const response = await fetch(`/api/song-where/prefs?scanId=${encodeURIComponent(scanId)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertsEnabled: enabled }),
    }).catch(() => null);
    if (response?.ok) setAlertsEnabled(enabled);
  }
  async function recordOutcome(matchId: string, status: "submitted" | "passed") {
    const response = await fetch(`/api/song-where/status/${encodeURIComponent(matchId)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    if (response?.ok) setOutcomes((current) => ({ ...current, [matchId]: status }));
  }
  if (!matches?.length) return null;
  return (
    <section aria-labelledby="song-where-title" className="mt-12 border-t border-rule pt-8">
      <p className="font-sans uppercase tracking-wider text-[11px] text-ink-soft">Song Where</p>
      <h2 id="song-where-title" className="font-display text-[28px] md:text-[34px] mt-2">
        Worth Your Move
      </h2>
      <p className="font-sans text-[13px] text-ink-soft mt-2 max-w-[56ch]">
        These briefs may align with this song’s approved emotional profile. Check all stated musical, rights and submission requirements yourself. CHRP does not represent you or guarantee placement.
      </p>
      <div className="mt-5 space-y-3">
        {matches.slice(0, 5).map((match) => {
          const platform = platformLabel(match.sourceName);
          const costNote = match.submissionRequirement === "free" ? "Free to submit"
            : match.submissionRequirement === "paid" ? `Paid submission${match.submissionCost ? ` (${match.submissionCost})` : ""}`
            : match.submissionRequirement === "membership" ? "Membership required"
            : match.submissionRequirement === "credits" ? "Credits required"
            : "Check submission terms";
          return (
            <div key={match.matchId} className="border border-rule p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-[20px]">{match.title}</h3>
                  <p className="font-sans text-[12px] text-ink-soft mt-1">
                    {match.fit === "strong" ? "Strong" : match.fit === "moderate" ? "Moderate" : "Worth exploring"} emotional fit · {match.trust === "verified" ? "Verified" : match.trust === "curated" ? "Curated" : "Scraped"} source
                    {match.deadline ? ` · Closes ${new Date(match.deadline).toLocaleDateString()}` : ""}
                  </p>
                  <p className="font-sans text-[11px] text-ink-soft mt-1">{costNote}</p>
                </div>
                <div className="flex flex-col items-end gap-2 self-center">
                  <a href={match.goHref} target="_blank" rel="noopener noreferrer" className="font-sans font-bold text-[12px] underline">
                    View on {platform} →
                  </a>
                  {outcomes[match.matchId] ? (
                    <span className="font-sans text-[11px] text-ink-soft">Marked {outcomes[match.matchId]}</span>
                  ) : (
                    <span className="flex gap-3 font-sans text-[11px] text-ink-soft">
                      <button type="button" onClick={() => void recordOutcome(match.matchId, "submitted")}>I submitted</button>
                      <button type="button" onClick={() => void recordOutcome(match.matchId, "passed")}>Pass</button>
                    </span>
                  )}
                </div>
              </div>
              <p className="font-sans text-[11px] text-ink-soft mt-2">
                This takes you to a specific brief on {platform}. Verify all musical, rights and eligibility requirements before submitting.
              </p>
            </div>
          );
        })}
      </div>
      {alertsEnabled !== null && (
        <label className="flex items-center gap-2 font-sans text-[12px] mt-5">
          <input type="checkbox" checked={alertsEnabled}
            onChange={(event) => void changeAlerts(event.target.checked)} />
          Notify me when CHRP finds new strong opportunities for my songs
        </label>
      )}
    </section>
  );
}
