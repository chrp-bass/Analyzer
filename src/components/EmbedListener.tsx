"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function EmbedListener() {
  const router = useRouter();
  const search = useSearchParams();

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== "chrp-set-stage") return;
      const params = new URLSearchParams(Array.from(search.entries()));
      if (typeof data.stage === "string") params.set("stage", data.stage);
      if (typeof data.track === "string") params.set("track", data.track);
      router.push(`/?${params.toString()}`);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router, search]);

  return null;
}
