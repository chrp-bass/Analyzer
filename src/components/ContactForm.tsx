"use client";

import { useState } from "react";

export function ContactForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    // Demo behavior: open the user's mail client with a prefilled message to
    // hello@chrp.ai. Replace with a real Airtable / server endpoint in
    // production by POSTing to /api/contact instead.
    const subject = encodeURIComponent("Bulk access inquiry");
    const body = encodeURIComponent(
      `Hi CHRP team,\n\nI'd like to learn more about bulk access.\n\nMy email: ${email}\n\nCatalog notes (size / artists / use case):\n\n— `,
    );
    window.location.href = `mailto:hello@chrp.ai?subject=${subject}&body=${body}`;
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="border-l-[3px] pl-4 py-2" style={{ borderLeftColor: "var(--chrp-yellow)" }}>
        <p className="font-display italic text-[18px] md:text-[20px] text-chrp-black">
          Thanks. Your mail client should be open with a draft &mdash; finish
          the note and send it and we&rsquo;ll be in touch.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label
        htmlFor="contact-email"
        className="font-sans text-[11px] tracking-wider uppercase text-ink-soft"
      >
        Your email
      </label>
      <input
        id="contact-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@label.com"
        className="w-full font-sans text-[15px] md:text-[16px] text-chrp-black bg-chrp-white border border-rule px-4 py-3 focus:outline-none focus:border-chrp-black"
        autoFocus
      />
      <button
        type="submit"
        className="mt-2 w-full md:w-auto md:min-w-[280px] md:self-start text-center font-sans font-bold text-[13px] tracking-wider uppercase bg-chrp-black text-chrp-white px-6 py-4 hover:bg-ink-soft"
      >
        Start the conversation
      </button>
    </form>
  );
}
