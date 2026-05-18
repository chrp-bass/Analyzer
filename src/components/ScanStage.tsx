"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

const TOTAL_DURATION = 9000;

const LINES: string[] = [
  "Initializing scan",
  "Reading metadata",
  "Resolving fingerprint",
  "Scoring Focus",
  "Scoring Balance",
  "Scoring Motivation",
  "Scoring Calm",
  "Mapping HPV states",
  "Classifying mode",
  "Matching live brief signal",
  "Composing analysis",
  "Setting verdict",
  "Report ready",
];

export function ScanStage({
  label,
  onComplete,
}: {
  label: string;
  onComplete: () => void;
}) {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const per = TOTAL_DURATION / (LINES.length + 1);
    const timers = LINES.map((_, i) =>
      setTimeout(() => setVisible(i + 1), per * (i + 1)),
    );
    const done = setTimeout(onComplete, TOTAL_DURATION + 600);
    timers.push(done);
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  const bars = useMemo(() => {
    const seed = Array.from(label).reduce((a, c) => a + c.charCodeAt(0), 0);
    return Array.from({ length: 84 }, (_, i) => {
      const v =
        Math.sin(i * 0.31 + seed * 0.13) * 0.4 +
        Math.sin(i * 0.07 + seed * 0.05) * 0.35 +
        Math.sin(i * 0.78 + seed * 0.21) * 0.2;
      return Math.max(0.07, Math.abs(v));
    });
  }, [label]);

  return (
    <div>
      <div className="font-sans text-[11px] text-ink-soft mb-5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className="font-bold uppercase tracking-wider"
          style={{ color: "var(--magenta)" }}
        >
          Scanning
        </span>
        <span className="text-ink-light">{"//"}</span>
        <span className="text-chrp-black">{label}</span>
      </div>

      <Waveform bars={bars} duration={TOTAL_DURATION} />

      <div className="mt-8 md:mt-10 font-sans text-[13px] md:text-[14px] leading-[1.85] text-chrp-black">
        {LINES.slice(0, visible).map((line, i) => (
          <LogLine key={i} line={line} done={i < visible - 1 || visible === LINES.length} />
        ))}
        {visible < LINES.length && (
          <span className="inline-block w-[8px] h-[14px] bg-chrp-black animate-pulse align-middle ml-1" />
        )}
      </div>
    </div>
  );
}

function LogLine({ line, done }: { line: string; done: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span style={{ color: "var(--magenta)" }}>›</span>
      <span>{line}</span>
      <span className="flex-1 border-b border-dotted border-rule mb-1" />
      <span
        className="font-bold text-[11px] tracking-wider uppercase"
        style={{ color: done ? "var(--kelly-green)" : "var(--ink-soft)" }}
      >
        {done ? "OK" : "…"}
      </span>
    </div>
  );
}

function Waveform({
  bars,
  duration,
}: {
  bars: number[];
  duration: number;
}) {
  const width = 1000;
  const height = 180;
  const barWidth = width / bars.length;
  return (
    <div className="relative w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[120px] md:h-[180px]"
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--rule)"
          strokeWidth="0.5"
        />
        {bars.map((v, i) => {
          const h = v * height * 0.92;
          const y = (height - h) / 2;
          return (
            <rect
              key={i}
              x={i * barWidth + 0.4}
              width={Math.max(1, barWidth - 0.8)}
              y={y}
              height={h}
              fill="var(--chrp-black)"
              opacity="0.85"
            />
          );
        })}
        <motion.line
          x1="0"
          x2="0"
          y1="0"
          y2={height}
          stroke="var(--magenta)"
          strokeWidth="1.4"
          initial={{ x: 0 }}
          animate={{ x: width }}
          transition={{ duration: duration / 1000, ease: "linear" }}
        />
      </svg>
      <Readout duration={duration} />
    </div>
  );
}

function Readout({ duration }: { duration: number }) {
  const [pct, setPct] = useState(0);
  const [ts, setTs] = useState("00:00");

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min(100, (elapsed / duration) * 100);
      setPct(p);
      const totalSec = Math.floor((elapsed / duration) * 222);
      const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
      const s = String(totalSec % 60).padStart(2, "0");
      setTs(`${m}:${s}`);
      if (p >= 100) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  }, [duration]);

  return (
    <div className="mt-2 flex justify-between font-sans text-[11px] text-ink-soft">
      <span>POS // {ts}</span>
      <span>{pct.toFixed(0).padStart(3, "0")}%</span>
      <span>03:42</span>
    </div>
  );
}
