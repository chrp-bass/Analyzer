"use client";

import { useCallback, useEffect, useState } from "react";
import type { FreeReport } from "@/lib/fixtures/tracks";
import {
  fetchEntitledReport,
  claimFirstReport,
  getScanReport,
} from "@/lib/data-source";
import { ensureIdentity } from "@/lib/identity";
import {
  resolveScanReadPath,
  type ReadState,
} from "@/lib/scan/read-path";

/**
 * Runs the preview read path (see `@/lib/scan/read-path`) for a scan and
 * exposes its state to the page. `retry` re-runs the same read — it is a
 * read, so retrying an entitled caller can only ever re-read.
 */
export function useScanReadPath(
  scanId: string,
  {
    paidReturn,
    fixture = null,
    enabled = true,
  }: { paidReturn: boolean; fixture?: FreeReport | null; enabled?: boolean },
): { state: ReadState; retry: () => void } {
  const [state, setState] = useState<ReadState>({
    status: "working",
    phase: "opening",
    free: fixture,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState({ status: "working", phase: "opening", free: fixture });
    resolveScanReadPath(
      scanId,
      {
        fetchEntitledReport,
        loadFreeReport: getScanReport,
        ensureIdentity,
        claimFirstReport,
      },
      {
        paidReturn,
        fixture,
        onPhase: (phase, free) => {
          if (!cancelled) setState({ status: "working", phase, free });
        },
      },
    ).then((outcome) => {
      if (!cancelled) setState({ status: "settled", outcome });
    });
    return () => {
      cancelled = true;
    };
  }, [scanId, paidReturn, fixture, enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
