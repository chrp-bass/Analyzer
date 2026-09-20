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
