/**
 * THE UNRESOLVED FIELD — what the instrument looks like before it knows.
 *
 * A real scan takes 20–60 seconds, and during that window the client knows
 * exactly two things: it started, and it has not finished. There are no
 * intermediate stage boundaries to report — `realFreeReport` is a single
 * await around one server call — so nothing here may claim that a step has
 * completed, and nothing may count down toward a time nobody can predict.
 *
 * What was here before was worse than a lie: a blank 260px box. The song
 * title sat above an empty rectangle with one static line under it for
 * forty seconds, which reads as a broken page rather than a working one.
 *
 * So the field is drawn immediately and truthfully. The rings and the
 * crosshair are the coordinate space, not a result — drawing them claims
 * nothing about this song. Inside them a dashed outline breathes and its
 * dashes travel, which says "working" without saying anything about the
 * answer.
 *
 * The outline is a REGULAR diamond, deliberately. Four independently
 * drifting vertices would have read as a measurement settling toward a
 * value, and no value is known yet. A symmetrical shape scaling in place
 * cannot be mistaken for this song's geometry.
 *
 * Motion is pure CSS — a transform and a dashoffset, both genuinely
 * animatable properties, so there is no animation library, no rAF loop and
 * no SMIL timeline to depend on. `prefers-reduced-motion` is handled in the
 * stylesheet, which means it works with JS disabled and never flashes on
 * hydration. See `.uf-*` in globals.css.
 */
export function UnresolvedField() {
  return (
    <svg
      viewBox="-132 -120 270 240"
      width={260}
      height={260}
      overflow="visible"
      role="img"
      aria-label="Analysis in progress. The emotional shape has not resolved yet."
    >
      {/* The coordinate space. True of every song, so safe to draw now. */}
      <circle cx="0" cy="0" r="25" fill="none" stroke="var(--polygon-ring)" strokeWidth="0.4" />
      <circle cx="0" cy="0" r="50" fill="none" stroke="var(--polygon-ring)" strokeWidth="0.4" />
      <circle cx="0" cy="0" r="75" fill="none" stroke="var(--polygon-ring)" strokeWidth="0.4" />
      <circle cx="0" cy="0" r="90" fill="none" stroke="var(--polygon-ring-outer)" strokeWidth="0.7" />
      <line x1="0" y1="-90" x2="0" y2="90" stroke="var(--polygon-axis)" strokeWidth="0.4" />
      <line x1="-90" y1="0" x2="90" y2="0" stroke="var(--polygon-axis)" strokeWidth="0.4" />

      {/* Unsettled: dashed, unfilled, breathing. A shape being looked for. */}
      <g className="uf-pulse">
        <polygon
          className="uf-outline"
          points="0,-58 58,0 0,58 -58,0"
          fill="none"
          stroke="var(--polygon-ring-outer)"
          strokeWidth="1.1"
          strokeDasharray="4 7"
          strokeLinejoin="round"
        />
      </g>

      {/* The axis names stay: they are what the field measures, and they are
          true before any value exists. */}
      <text x="0" y="-100" textAnchor="middle" fontFamily="var(--font-lato), sans-serif" fontWeight={700} fontSize="8" fill="var(--polygon-label)">Focus</text>
      <text x="104" y="3" textAnchor="start" fontFamily="var(--font-lato), sans-serif" fontWeight={700} fontSize="8" fill="var(--polygon-label)">Balance</text>
      <text x="0" y="110" textAnchor="middle" fontFamily="var(--font-lato), sans-serif" fontWeight={700} fontSize="8" fill="var(--polygon-label)">Motivation</text>
      <text x="-104" y="3" textAnchor="end" fontFamily="var(--font-lato), sans-serif" fontWeight={700} fontSize="8" fill="var(--polygon-label)">Calm</text>
    </svg>
  );
}
