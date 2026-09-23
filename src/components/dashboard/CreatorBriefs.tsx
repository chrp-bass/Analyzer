"use client";

import { useEffect, useState } from "react";

type Brief = { id: string; title: string; deadline: string;
  submissionRequirement: string; submissionCost: string | null;
  sourceName?: string;
  songs: Array<{ title: string; fit: string; goHref: string; sourceName?: string }> };

/** Extract a readable platform name from the source identifier. */
function platformLabel(sourceName: string): string {
  const hostMatch = sourceName.match(/^(?:public|feed)-(?:www\.)?([^-]+(?:\.[^-]+)*)-[a-f0-9]+$/);
  if (hostMatch) {
    const name = hostMatch[1].split(".")[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return sourceName.replace(/^public-/, "").replace(/-[a-f0-9]{8}$/, "");
}

/** Convert ALL-CAPS pasted titles to title case for display. */
function displayTitle(raw: string): string {
  if (raw !== raw.toUpperCase() || raw.length < 4) return raw;
  return raw.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function CreatorBriefs() {
  const [available, setAvailable] = useState(false);
  const [emailReady, setEmailReady] = useState(false);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  async function refresh() {
    const response = await fetch("/api/song-where/briefs", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const body = await response.json() as { briefs: Brief[]; emailReady: boolean };
    setBriefs(body.briefs);
    setEmailReady(body.emailReady);
    setAvailable(true);
  }
  useEffect(() => { void refresh(); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/song-where/briefs", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, text }) });
      if (!response.ok) throw new Error("unavailable");
      const result = await response.json() as { status: string; matches?: number };
      setMessage(result.status === "stored"
        ? result.matches ? "Compared against your analyzed catalog." : "No strong CHRP match in your analyzed catalog."
        : "We could not verify a live deadline and a working application URL in that brief.");
      if (result.status === "stored") { setSubject(""); setText(""); await refresh(); }
    } catch { setMessage("Brief analysis is unavailable right now. Your reports are unaffected."); }
    finally { setBusy(false); }
  }
  if (!available) return null;
  const hasBriefs = briefs.length > 0;
  const showForm = formOpen || !hasBriefs;
  return (
    <section id="briefs" aria-labelledby="creator-brief-title" className="mt-10 border-t border-rule pt-8">
      {hasBriefs && (
        <div className="mb-8 space-y-3">
          <p className="font-sans uppercase tracking-wider text-[11px] text-ink-soft">Your Briefs</p>
          {briefs.map((brief) => {
            const costNote = brief.submissionRequirement === "free" ? "Free to submit"
              : brief.submissionRequirement === "paid" ? `Paid submission${brief.submissionCost ? ` (${brief.submissionCost})` : ""}`
              : brief.submissionRequirement === "membership" ? "Membership required"
              : brief.submissionRequirement === "credits" ? "Credits required"
              : "Submission terms not stated";
            return (
              <div key={brief.id} className="border border-rule p-4">
                <h3 className="font-display text-[20px]">{displayTitle(brief.title)}</h3>
                <p className="font-sans text-[12px] text-ink-soft mt-1">
                  Due {new Date(brief.deadline).toLocaleDateString()} · {costNote}
                </p>
                {!brief.songs.length ? (
                  <p className="font-sans text-[12px] text-ink-soft mt-3">
                    No match yet. <a href="/scan" className="underline">Scan and unlock more songs</a> to increase your match rate.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {brief.songs.map((song) => {
                      const platform = song.sourceName ? platformLabel(song.sourceName) : null;
                      return (
                        <div key={song.goHref} className="flex flex-wrap justify-between gap-3 items-center border-t border-rule pt-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-sans text-[13px] font-bold">{song.title}</p>
                            <p className="font-sans text-[11px] text-ink-soft">
                              {song.fit === "strong" ? "Strong" : song.fit === "moderate" ? "Moderate" : "Worth exploring"} emotional fit
                            </p>
                          </div>
                          <a href={song.goHref} target="_blank" rel="noopener noreferrer"
                            className="font-sans font-bold text-[12px] underline">
                            {platform ? `View on ${platform} →` : "View brief →"}
                          </a>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {showForm ? (
        <div className="border border-rule bg-oat p-5 md:p-6 max-w-2xl">
          <p className="font-sans uppercase tracking-wider text-[11px] text-ink-soft">Brief Analyzer</p>
          <h2 id="creator-brief-title" className="font-display text-[24px] md:text-[28px] mt-2">
            {hasBriefs ? "Paste another brief" : "Have a commercial music brief?"}
          </h2>
          <p className="font-sans text-[13px] text-ink-soft mt-2">
            {emailReady ? <>Forward it to <strong>briefs@chrp.ai</strong>, or paste it below. </> : "Paste it below. "}
            CHRP compares explicit criteria against your analyzed songs.
            Private briefs stay private to your catalog.
          </p>
          <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-3">
            <label className="block font-sans text-[12px]">Brief title
              <input className="block mt-1 w-full border border-rule bg-chrp-white p-3" value={subject}
                onChange={(event) => setSubject(event.target.value)} maxLength={250} required />
            </label>
            <label className="block font-sans text-[12px]">Analyze a brief
              <textarea className="block mt-1 w-full border border-rule bg-chrp-white p-3 min-h-32" value={text}
                onChange={(event) => setText(event.target.value)} maxLength={30000} required
                placeholder="Include the stated deadline, submission URL and explicit musical criteria." />
            </label>
            <button type="submit" disabled={busy}
              className="font-sans font-bold text-[11px] tracking-wider uppercase border border-chrp-black px-5 py-2.5"
              style={{ opacity: busy ? 0.7 : 1 }}>
              {busy ? "Checking…" : "Compare with my catalog"}
            </button>
          </form>
          {message && <p role="status" className="font-sans text-[12px] mt-3">{message}</p>}
        </div>
      ) : (
        <button onClick={() => setFormOpen(true)}
          className="font-sans font-bold text-[11px] tracking-wider uppercase border border-chrp-black px-5 py-2.5">
          + Paste another brief
        </button>
      )}
    </section>
  );
}
