"use client";

import { useState } from "react";

export function ContactForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    const subject = encodeURIComponent("Bulk access inquiry");
    const body = encodeURIComponent(
      `Hi CHRP team,\n\nI'd like to learn more about bulk access.\n\nMy email: ${email}\n\nCatalog notes (size / artists / use case):\n\n— `,
    );
    window.location.href = `mailto:hello@chrp.ai?subject=${subject}&body=${body}`;
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div
        style={{
          borderLeft: "3px solid var(--gold-2)",
          paddingLeft: 16,
          paddingTop: 6,
          paddingBottom: 6,
        }}
      >
        <p
          style={{
            fontFamily: "var(--d)",
            fontStyle: "italic",
            fontSize: 18,
            color: "var(--on-dark)", /* flips to ink in product-shell scope */
          }}
        >
          Thanks. Your mail client should be open with a draft &mdash; finish
          the note and send it and we&rsquo;ll be in touch.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <label
        htmlFor="contact-email"
        className="eyebrow"
        style={{ display: "block", marginBottom: 4 }}
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
        style={{ width: "100%", fontSize: 16, padding: "14px 16px" }}
        autoFocus
      />
      <button
        type="submit"
        className="btn btn-y"
        style={{ marginTop: 8, alignSelf: "flex-start" }}
      >
        Start the conversation
      </button>
    </form>
  );
}
