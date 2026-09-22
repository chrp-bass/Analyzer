import "server-only";
import { isIP } from "node:net";

/** Conservative URL gate for outbound source discovery and feed reads. */
export function publicHttpsUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        isIP(host) !== 0 || !host.includes(".") ||
        /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) ||
        host.endsWith(".amazonaws.com") && host.startsWith("metadata.")) return null;
    return url;
  } catch { return null; }
}

/**
 * Rejects submission URLs that point to generic sign-up or landing pages
 * rather than a specific opportunity. A specific opportunity URL typically
 * contains an ID, slug or deep path that distinguishes it from the platform's
 * generic intake form.
 */
export function isSpecificSubmissionUrl(raw: string): boolean {
  const url = publicHttpsUrl(raw);
  if (!url) return false;
  const path = url.pathname.replace(/\/+$/, "").toLowerCase();
  // Domain root is never a specific opportunity.
  if (!path || path === "") return false;
  const segments = path.split("/").filter(Boolean);
  // Single-segment generic intake/listing paths.
  const GENERIC = new Set([
    "submit", "apply", "signup", "sign-up", "register", "join", "login",
    "get-started", "create-account", "upload", "pitch",
    "song-submit", "music-submit", "submit-music", "submit-song",
    "briefs", "brief", "opportunities", "opportunity",
    "musiccreators", "sync", "music-briefs", "music-brief",
    "conference", "pitch-your-music", "en",
  ]);
  if (segments.length === 1 && GENERIC.has(segments[0])) return false;
  // Two-segment paths where the second segment is also generic.
  if (segments.length === 2 && GENERIC.has(segments[1]) &&
      /^(?:en|es|fr|de|app|music|conference|sync)$/.test(segments[0])) return false;
  // Any segment that looks like an ID (UUID fragment, long hex, numeric ≥4 digits,
  // or a slug with embedded digits like "brief-12345") is a specificity signal.
  const hasId = segments.some((s) =>
    /[0-9a-f]{8,}/i.test(s) || /\d{4,}/.test(s) || /^[a-z0-9]{20,}$/i.test(s));
  if (hasId) return true;
  // Deep paths (≥3 segments) are usually specific even without an obvious ID.
  if (segments.length >= 3) return true;
  // Two-segment paths with a non-generic second segment pass — they're usually
  // platform-specific slugs like /briefs/energetic-pop-summer.
  if (segments.length === 2) return true;
  // Single non-generic segment without an ID: ambiguous, reject.
  return false;
}
