/**
 * Report text as SPOKEN DATA.
 *
 * Everything that travels to the ElevenLabs agent as a dynamic variable is
 * report content — data, never instructions. This helper makes that true by
 * construction:
 *
 *   - control characters are removed and whitespace collapsed;
 *   - template braces are removed, so prose can never become a nested
 *     `{{variable}}` when the agent renders its prompt;
 *   - our own context delimiters (`<<<` / `>>>`) are removed, so injected text
 *     cannot close the REPORT block early;
 *   - role/heading markers at line starts (`system:`, `assistant:` …) are
 *     softened so they read as words, not turns;
 *   - the brand is spelled the way it is said: "CHRP" → "Chirp", so the TTS
 *     never spells the letters aloud;
 *   - the result is capped.
 *
 * Pure. Shared by the context builder and the first-read composer.
 */

export function asSpokenData(value: unknown, max = 4000): string {
  if (typeof value !== "string") return "";
  let s = value
    // Role markers first, while line starts still exist.
    .replace(/^\s*(system|assistant|user|developer|tool)\s*:/gim, "$1 -")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/<<<|>>>/g, " ")
    .replace(/\bCHRP\b/g, "Chirp")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + "…";
  return s;
}

/** Shorten to `n` characters with an ellipsis, on a trimmed boundary. */
export function capText(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}
