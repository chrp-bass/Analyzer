"use client";

import { useEffect, useState } from "react";

type Brief = { id: string; title: string; deadline: string;
  submissionRequirement: string; submissionCost: string | null;
  songs: Array<{ title: string; fit: string; goHref: string }> };

export function CreatorBriefs() {
  const [available, setAvailable] = useState(false);
  const [emailReady, setEmailReady] = useState(false);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
  return (
    <section aria-labelledby="creator-brief-title" className="mt-10 border-t border-rule pt-8">
      <h2 id="creator-brief-title" className="font-display text-[28px]">Have a commercial music brief?</h2>
      <p className="font-sans text-[13px] text-ink-soft mt-2">
        {emailReady ? <>Forward it to <strong>briefs@chrp.ai</strong>, or paste it below. </> : "Paste it below. "}
        CHRP compares explicit criteria against your eligible analyzed songs;
        private briefs stay private to your catalog.
      </p>
      <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-3 max-w-2xl">
        <label className="block font-sans text-[12px]">Brief title
          <input className="block mt-1 w-full border border-rule p-3" value={subject}
            onChange={(event) => setSubject(event.target.value)} maxLength={250} required />
        </label>
        <label className="block font-sans text-[12px]">Analyze a brief
          <textarea className="block mt-1 w-full border border-rule p-3 min-h-32" value={text}
            onChange={(event) => setText(event.target.value)} maxLength={30000} required
            placeholder="Include the stated deadline, submission URL and explicit musical criteria." />
        </label>
        <button type="submit" disabled={busy} className="font-sans font-bold text-[12px] underline">
          {busy ? "Checking…" : "Compare with my catalog"}
        </button>
      </form>
      {message && <p role="status" className="font-sans text-[12px] mt-3">{message}</p>}
      {briefs.map((brief) => (
        <div key={brief.id} className="mt-7 border-t border-rule pt-4">
          <h3 className="font-display text-[21px]">Worth Your Move · {brief.title}</h3>
          <p className="font-sans text-[12px] text-ink-soft mt-1">
            Source: creator-forwarded brief · Due {new Date(brief.deadline).toLocaleDateString()} · Submission: {brief.submissionRequirement}
            {brief.submissionCost ? ` · ${brief.submissionCost}` : ""}
          </p>
          {!brief.songs.length && <p className="font-sans text-[12px] mt-3">No strong CHRP match in your analyzed catalog.</p>}
          {brief.songs.map((song) => (
            <div key={song.goHref} className="mt-3 font-sans text-[13px]">
              <strong>{song.title}</strong> · Worth exploring
              <p className="text-ink-soft">Approved emotional profile aligns with the brief’s stated direction. Check all other requirements yourself.</p>
              <a href={song.goHref} target="_blank" rel="noopener noreferrer" className="underline">View opportunity</a>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
