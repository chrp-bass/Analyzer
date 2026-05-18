"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { trackOptions } from "@/lib/fixtures/tracks";
import { ScanStage } from "@/components/ScanStage";

type State = "input" | "scanning" | "error";

export function ScanFlow() {
  const router = useRouter();
  const [state, setState] = useState<State>("input");
  const [error, setError] = useState<string | null>(null);
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [scanLabel, setScanLabel] = useState<string>("");

  const startScan = async (text: string) => {
    setScanLabel(text);
    setState("scanning");
    setError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (err.error === "unresolved") {
          setError(
            "This track isn't catalogued on Spotify or Apple Music yet. Scan a released track.",
          );
        } else {
          setError("Something went wrong reaching the engine. Try again.");
        }
        setState("error");
        return;
      }
      const data = (await res.json()) as { id: string };
      setResolvedId(data.id);
    } catch {
      setError("Couldn't reach the engine. Check your connection and retry.");
      setState("error");
    }
  };

  const onScanComplete = () => {
    if (resolvedId) router.push(`/report/${resolvedId}`);
  };

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12 md:py-20">
      <AnimatePresence mode="wait">
        {state === "input" && (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-3xl mx-auto"
          >
            <InputStage onSubmit={startScan} />
          </motion.div>
        )}

        {state === "scanning" && (
          <motion.div
            key="scanning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-4xl mx-auto"
          >
            <ScanStage label={scanLabel} onComplete={onScanComplete} />
          </motion.div>
        )}

        {state === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl mx-auto text-center"
          >
            <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-plum mb-3">
              We couldn&rsquo;t scan that
            </div>
            <p className="font-display italic text-[24px] md:text-[28px] leading-snug text-chrp-black">
              {error}
            </p>
            <button
              onClick={() => {
                setError(null);
                setState("input");
              }}
              className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 border border-chrp-black text-chrp-black hover:bg-chrp-black hover:text-chrp-white transition-colors font-sans font-bold text-[12px] tracking-wider uppercase"
            >
              ← Try another track
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InputStage({ onSubmit }: { onSubmit: (s: string) => void }) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  return (
    <div>
      <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft mb-4">
        Emotional intelligence scan
      </div>
      <h1 className="font-display font-bold text-[40px] sm:text-[56px] md:text-[72px] display-tight text-balance mb-10 md:mb-14">
        Where do we find your song?
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value || "glasshouse");
        }}
        className="relative"
      >
        <div className="flex items-end gap-4">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Paste a Spotify or Apple Music link, or an ISRC"
            className="flex-1 bg-transparent text-chrp-black placeholder:text-ink-light text-[18px] md:text-[22px] py-3 border-b border-rule font-sans"
            style={{
              borderBottomWidth: focused ? 2 : 1,
              borderBottomColor: focused
                ? "var(--chrp-black)"
                : "var(--rule)",
              transition: "border-bottom-width 200ms, border-bottom-color 200ms",
            }}
          />
          <button
            type="submit"
            className="font-sans font-bold text-[12px] tracking-wider uppercase text-chrp-black hover:text-magenta transition-colors py-3 whitespace-nowrap"
          >
            → Scan
          </button>
        </div>
      </form>

      <div className="mt-10">
        <div className="font-sans text-[12px] text-ink-soft mb-4">
          ↳ Or try one of ours:
        </div>
        <ul className="flex flex-col gap-2">
          {trackOptions.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSubmit(t.label)}
                className="text-left group inline-flex items-baseline gap-3 font-display italic text-[20px] md:text-[22px] text-chrp-black hover:text-magenta transition-colors"
              >
                <span>{t.label}</span>
                <span className="not-italic font-sans text-[12px] text-ink-light group-hover:text-ink-soft">
                  · {t.hint}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
