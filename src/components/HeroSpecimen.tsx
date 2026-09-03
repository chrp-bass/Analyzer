"use client";

import { useEffect, useRef, useState } from "react";
import type { Mode } from "@/lib/fixtures/tracks";
import type { PolygonVertices } from "@/lib/polygon";

/**
 * THE SPECIMEN — the landing's promise of the product's thesis.
 *
 * The hero used to show a treated portrait of a person with an empty dial
 * floating over it, captioned "Your song's shape appears here." Two things
 * were wrong with that. There was no song anywhere in a hero whose whole
 * claim is that a song has a shape; and a gradient-lit portrait beside a
 * dark circular gauge is the most generic composition available to a
 * landing page — the thing the product had to stop looking like.
 *
 * So the hero shows songs instead, and it shows more than one. A single
 * song beside a single shape proves nothing: the shape could be decoration.
 * Six songs cycling through the same instrument, each resolving to a
 * visibly different geometry, proves the shape is DERIVED. That plurality
 * is the whole argument, and it is the difference between this and the
 * downstream Reading — there, one song (yours) is drawn once; here, many
 * songs are drawn in turn so the relationship becomes legible before you
 * have given anything.
 *
 * Reading order is the thesis: title and artist first, then the shape they
 * produce. SONG -> SHAPE, top to bottom.
 *
 * The instrument keeps its grid, its atmosphere and its per-axis colours —
 * this is the surface where a first-time visitor learns the shape is
 * plotted rather than drawn, so it is an instrument and not a mark. The
 * score lockup beneath it is set in the plate's typographic form, so the
 * number met here is the number recognised in the report.
 *
 * Cost: no animation library. A CSS opacity crossfade and one interval.
 * The specimen data is computed on the server and passed in, so the
 * fixtures never enter the client bundle. Static and correct with no JS.
 */
export interface Specimen {
  title: string;
  artist: string;
  vertices: PolygonVertices;
  score: number;
  mode: Mode;
}

const AXES = [
  { key: "focus", label: "FOCUS", color: "#7A9FE8" },
  { key: "balance", label: "BALANCE", color: "#C990B8" },
  { key: "motivation", label: "MOTIVATION", color: "#E6D74F" },
  { key: "calm", label: "CALM", color: "#A8D990" },
] as const;

/** Outer ring sits at 102 units, so a score of 100 reaches it exactly. */
const K = 1.02;
const HOLD_MS = 4600;
const FADE_MS = 420;

export function HeroSpecimen({ specimens }: { specimens: Specimen[] }) {
  const [i, setI] = useState(0);
  const [on, setOn] = useState(true);
  const swap = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (specimens.length < 2) return;
    // Cycling is decoration on top of a composition that already reads.
    // Under reduced motion the first specimen simply stands.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const cycle = setInterval(() => {
      setOn(false);
      swap.current = setTimeout(() => {
        setI((v) => (v + 1) % specimens.length);
        setOn(true);
      }, FADE_MS);
    }, HOLD_MS);
    return () => {
      clearInterval(cycle);
      if (swap.current) clearTimeout(swap.current);
    };
  }, [specimens.length]);

  const s = specimens[i];
  if (!s) return null;

  const v = s.vertices;
  const pts = `0,${-v.focus * K} ${v.balance * K},0 0,${v.motivation * K} ${
    -v.calm * K
  },0`;
  const at: Record<string, { x: number; y: number }> = {
    focus: { x: 0, y: -v.focus * K },
    balance: { x: v.balance * K, y: 0 },
    motivation: { x: 0, y: v.motivation * K },
    calm: { x: -v.calm * K, y: 0 },
  };
  const m = s.mode.toLowerCase();

  return (
    <div className="si-spec" data-on={on ? "true" : "false"}>
      {/* The song, before the measurement. */}
      <p className="si-spec-title">{s.title}</p>
      <p className="si-spec-by">by {s.artist}</p>

      <div className="si-spec-instrument">
        <svg
          viewBox="-196 -156 392 312"
          overflow="visible"
          role="img"
          aria-label={`${s.title} by ${s.artist} — EPI ${s.score}, ${s.mode} mode. Focus ${v.focus}, Balance ${v.balance}, Motivation ${v.motivation}, Calm ${v.calm}.`}
        >
          <defs>
            <radialGradient id="si-spec-atmos" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0F0E0E" stopOpacity="0.86" />
              <stop offset="52%" stopColor="#0F0E0E" stopOpacity="0.62" />
              <stop offset="100%" stopColor="#0F0E0E" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="si-spec-tint" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#E6D74F" stopOpacity="0.16" />
              <stop offset="48%" stopColor="#C12C79" stopOpacity="0.12" />
              <stop offset="80%" stopColor="#406BD6" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#0F0E0E" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="0" cy="0" r="168" fill="url(#si-spec-atmos)" />
          <circle cx="0" cy="0" r="156" fill="url(#si-spec-tint)" />

          {/* The grid stays: this is where the shape is shown to be plotted. */}
          {[28, 56, 84].map((r) => (
            <circle
              key={r}
              cx="0"
              cy="0"
              r={r}
              fill="none"
              stroke="rgba(251,251,244,0.16)"
              strokeWidth="0.5"
            />
          ))}
          <circle
            cx="0"
            cy="0"
            r="102"
            fill="none"
            stroke="rgba(251,251,244,0.38)"
            strokeWidth="0.9"
          />
          <line x1="0" y1="-102" x2="0" y2="102" stroke="rgba(251,251,244,0.2)" strokeWidth="0.5" />
          <line x1="-102" y1="0" x2="102" y2="0" stroke="rgba(251,251,244,0.2)" strokeWidth="0.5" />

          {/* The song's actual geometry, carrying its mode colour. */}
          <polygon
            points={pts}
            fill={`var(--mode-${m}-fill)`}
            stroke={`var(--mode-${m}-stroke)`}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          {AXES.map((a) => (
            <circle
              key={a.key}
              cx={at[a.key].x}
              cy={at[a.key].y}
              r="3.4"
              fill={a.color}
            />
          ))}

          <text x="0" y="-118" textAnchor="middle" fontFamily="var(--s)" fontWeight="900" fontSize="9" letterSpacing="1" fill="#7A9FE8">FOCUS</text>
          <text x="120" y="3" textAnchor="start" fontFamily="var(--s)" fontWeight="900" fontSize="9" letterSpacing="1" fill="#C990B8">BALANCE</text>
          <text x="0" y="128" textAnchor="middle" fontFamily="var(--s)" fontWeight="900" fontSize="9" letterSpacing="1" fill="#E6D74F">MOTIVATION</text>
          <text x="-120" y="3" textAnchor="end" fontFamily="var(--s)" fontWeight="900" fontSize="9" letterSpacing="1" fill="#A8D990">CALM</text>
        </svg>
      </div>

      {/* The plate lockup, so the number met here is the number recognised
          in the report. */}
      <div className="si-spec-read">
        <span className="si-spec-score">{s.score}</span>
        <span className="si-spec-meta">
          <span className="si-spec-epi">EPI</span>
          <span className="si-spec-mode">{s.mode} mode</span>
        </span>
      </div>
    </div>
  );
}
