"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Track } from "@/lib/fixtures/tracks";

const TOTAL_DURATION = 10000;

type LogLine = { label: string; value: string; isHeader?: boolean };

export function ScanStage({
  track,
  onComplete,
}: {
  track: Track;
  onComplete: () => void;
}) {
  const lines: LogLine[] = useMemo(() => {
    const fp = track.fingerprint;
    return [
      { label: "INITIALIZING SCAN", value: "...........", isHeader: true },
      { label: "READING METADATA", value: "OK", isHeader: true },
      { label: "VALENCE", value: String(fp.valence) },
      { label: "AROUSAL", value: String(fp.arousal) },
      { label: "TENSION & RELEASE", value: String(fp.tensionRelease) },
      { label: "MOTIVATIONAL ENERGY", value: String(fp.motivationalEnergy) },
      { label: "EMOTIONAL DRIFT", value: String(fp.emotionalDrift) },
      { label: "FOCUS", value: String(fp.focus) },
      { label: "CONFIDENCE", value: String(fp.confidence) },
      { label: "STRESS MODULATION", value: String(fp.stressModulation) },
      { label: "PACING", value: String(fp.pacing) },
      { label: "AGGRESSION", value: String(fp.aggression) },
      { label: "RECOVERY", value: String(fp.recovery) },
      { label: "BEHAVIORAL RESONANCE", value: String(fp.behavioralResonance) },
      {
        label: "MODE CLASSIFICATION",
        value: track.mode.toUpperCase(),
        isHeader: true,
      },
      { label: "SCAN COMPLETE", value: "", isHeader: true },
    ];
  }, [track]);

  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const perLine = TOTAL_DURATION / (lines.length + 1);
    const timers: NodeJS.Timeout[] = [];
    lines.forEach((_, i) => {
      timers.push(
        setTimeout(() => setVisibleCount(i + 1), perLine * (i + 1)),
      );
    });
    const done = setTimeout(onComplete, TOTAL_DURATION + 700);
    timers.push(done);
    return () => timers.forEach(clearTimeout);
  }, [lines, onComplete]);

  // Use a deterministic bar pattern from track title so it's stable per scan
  const bars = useMemo(() => {
    const seed = Array.from(track.title).reduce(
      (a, c) => a + c.charCodeAt(0),
      0,
    );
    return Array.from({ length: 96 }, (_, i) => {
      const v =
        Math.sin(i * 0.31 + seed * 0.13) * 0.4 +
        Math.sin(i * 0.07 + seed * 0.05) * 0.35 +
        Math.sin(i * 0.78 + seed * 0.21) * 0.2;
      return Math.max(0.07, Math.abs(v));
    });
  }, [track.title]);

  return (
    <div>
      <div className="smallcaps-mono text-ink-soft mb-6 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-accent">SCANNING</span>
        <span className="text-ink-soft/60">{"//"}</span>
        <span className="text-ink">{track.title.toUpperCase()}</span>
        <span className="text-ink-soft/60">{"//"}</span>
        <span>{track.artist}</span>
      </div>

      <Waveform bars={bars} duration={TOTAL_DURATION} />

      <div className="mt-10 md:mt-12 font-mono text-[13px] md:text-[14px] leading-[1.85] text-ink">
        {lines.slice(0, visibleCount).map((line, i) => (
          <LogLineRow key={i} line={line} />
        ))}
        {visibleCount < lines.length && (
          <span className="inline-block w-[8px] h-[16px] bg-ink animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}

function LogLineRow({ line }: { line: LogLine }) {
  if (line.isHeader) {
    return (
      <div className="text-ink">
        <span className="text-accent">&gt;</span> {line.label}
        {line.value && (
          <>
            <span className="text-ink-soft/50 mx-1">.....................</span>
            <span className="text-ink">{line.value}</span>
          </>
        )}
      </div>
    );
  }
  const padLabel = (line.label + " ").padEnd(32, ".");
  return (
    <div>
      <span className="text-accent">&gt;</span> <span>{padLabel}</span>
      <span className="text-ink font-semibold">{line.value}</span>
    </div>
  );
}

function Waveform({ bars, duration }: { bars: number[]; duration: number }) {
  const width = 1000;
  const height = 200;
  const barWidth = width / bars.length;

  return (
    <div className="relative w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[140px] md:h-[200px]"
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
        <g>
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
                fill="var(--ink)"
                opacity="0.85"
              />
            );
          })}
        </g>
        <motion.line
          x1="0"
          x2="0"
          y1="0"
          y2={height}
          stroke="var(--accent)"
          strokeWidth="1.2"
          initial={{ x: 0 }}
          animate={{ x: width }}
          transition={{ duration: duration / 1000, ease: "linear" }}
        />
        <motion.rect
          x="0"
          y="0"
          height={height}
          fill="var(--accent)"
          opacity="0.06"
          initial={{ width: 0 }}
          animate={{ width: width * 0.04 }}
          transition={{ duration: 0.3 }}
        />
      </svg>
      <ScanReadout duration={duration} />
    </div>
  );
}

function ScanReadout({ duration }: { duration: number }) {
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
    }, 60);
    return () => clearInterval(id);
  }, [duration]);

  return (
    <div className="mt-2 flex justify-between smallcaps-mono text-ink-soft">
      <span>POS // {ts}</span>
      <span>{pct.toFixed(0).padStart(3, "0")}%</span>
      <span>03:42</span>
    </div>
  );
}
