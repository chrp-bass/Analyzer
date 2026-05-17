"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { tracks, matchInputToTrack, Track } from "@/lib/fixtures/tracks";
import { ScanStage } from "@/components/ScanStage";

type State = "input" | "scanning";

export function ScanFlow() {
  const router = useRouter();
  const [state, setState] = useState<State>("input");
  const [matched, setMatched] = useState<Track | null>(null);

  const startScan = (text: string) => {
    const t = matchInputToTrack(text);
    setMatched(t);
    setState("scanning");
  };

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-16 md:py-24">
      <AnimatePresence mode="wait">
        {state === "input" && (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-3xl mx-auto"
          >
            <InputStage onSubmit={startScan} />
          </motion.div>
        )}

        {state === "scanning" && matched && (
          <motion.div
            key="scanning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-4xl mx-auto"
          >
            <ScanStage
              track={matched}
              onComplete={() => router.push(`/scan/results/${matched.id}`)}
            />
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
      <h1 className="font-serif font-black display-tight text-[42px] sm:text-[60px] md:text-[80px] text-balance mb-12 md:mb-16">
        Where do we find your song?
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value || tracks[0].title);
        }}
        className="relative"
      >
        <div className="flex items-end gap-4">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder='Paste a Spotify or Apple Music link, or type "song name, artist"'
            className="flex-1 bg-transparent text-ink placeholder:text-ink-soft text-[18px] md:text-[22px] py-3 border-b border-rule"
            style={{
              borderBottomWidth: focused ? 2 : 1,
              transition: "border-bottom-width 200ms",
            }}
          />
          <button
            type="submit"
            className="smallcaps text-ink hover:text-accent transition-colors py-3 whitespace-nowrap"
          >
            → Scan
          </button>
        </div>
      </form>

      <div className="mt-10">
        <div className="smallcaps-mono text-ink-soft mb-4">
          ↳ try one of ours:
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-3">
          {tracks.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSubmit(t.title)}
                className="font-serif italic text-ink-soft hover:text-accent transition-colors text-[18px] md:text-[20px]"
              >
                {t.title}{" "}
                <span className="text-ink-soft/60 not-italic font-sans text-[14px]">
                  · {t.artist}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
