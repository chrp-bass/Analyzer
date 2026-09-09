/**
 * A small fetch wrapper the checks share: one timeout per request, a typed
 * failure kind instead of a thrown error, the body read as text and parsed as
 * JSON when possible. Never logs. The caller decides what (sanitised) part of
 * a response is evidence.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpOutcome =
  | {
      ok: true;
      status: number;
      headers: Headers;
      text: string;
      json: unknown | undefined;
      ms: number;
    }
  | { ok: false; kind: "timeout" | "network"; ms: number };

export interface HttpRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  /** An outer signal (the check deadline) that also aborts this request. */
  signal?: AbortSignal;
}

export async function httpRequest(
  fetchImpl: FetchLike,
  req: HttpRequest,
  now: () => number = () => Date.now(),
): Promise<HttpOutcome> {
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  if (req.signal) {
    if (req.signal.aborted) return { ok: false, kind: "timeout", ms: 0 };
    req.signal.addEventListener("abort", onOuterAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), Math.max(1, req.timeoutMs));
  const started = now();
  try {
    const res = await fetchImpl(req.url, {
      method: req.method ?? "GET",
      headers: req.headers,
      body: req.body,
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
    let text = "";
    try {
      text = await res.text();
    } catch {
      /* body unreadable — status alone is still evidence */
    }
    let json: unknown | undefined;
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }
    return { ok: true, status: res.status, headers: res.headers, text, json, ms: now() - started };
  } catch (err) {
    const aborted =
      controller.signal.aborted || (err instanceof Error && err.name === "AbortError");
    return { ok: false, kind: aborted ? "timeout" : "network", ms: now() - started };
  } finally {
    clearTimeout(timer);
    if (req.signal) req.signal.removeEventListener("abort", onOuterAbort);
  }
}

/** Presence-only view of an environment variable. Never returns the value. */
export function envPresent(env: Record<string, string | undefined>, name: string): boolean {
  const v = env[name];
  return typeof v === "string" && v.trim().length > 0;
}
