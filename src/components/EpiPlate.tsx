import { Mode } from "@/lib/fixtures/tracks";
import { PolygonVertices } from "@/lib/polygon";

/**
 * THE EPI PLATE — the report hero's four-dimension instrument.
 *
 * The instrument is the same one the landing page's HeroSpecimen uses so a
 * first-time visitor's "song has a shape" reading and the entitled report's
 * hero speak the same visual language: dark atmospheric field, concentric
 * measurement rings, the Focus↔Motivation and Calm↔Balance crosshair, a
 * colored label and a colored node at each vertex, and the polygon over
 * the top of it all. The song's shape is plotted here, not painted, and
 * the scaffolding is what says so.
 *
 * The score / mode lockup below the shape — score above the rule, EPI
 * label and mode name flush left below — is fixed. It is meant to be
 * repeated at any size on any surface without being re-composed, so that
 * the relationship itself becomes the memory.
 *
 * No new library, no charting dependency, and nothing about the score
 * data changes. This renders the existing `vertices`, `mode`, and
 * `epiScore` exactly as the engine supplied them.
 */

const AXIS_COLOR = {
  focus: "#7A9FE8",
  balance: "#C990B8",
  motivation: "#E6D74F",
  calm: "#A8D990",
} as const;

/**
 * Vertex-scaling constant. The outer measurement ring sits at r=102, so a
 * dimension of 100 reaches it exactly. Nothing in the score pipeline
 * changes — this is presentation geometry only.
 */
const K = 1.02;

export function EpiPlate({
  vertices,
  mode,
  epiScore,
  size = 300,
}: {
  vertices: PolygonVertices;
  mode: Mode;
  epiScore: number;
  size?: number;
}) {
  const v = vertices;
  const pts = `0,${-v.focus * K} ${v.balance * K},0 0,${v.motivation * K} ${
    -v.calm * K
  },0`;
  const at = {
    focus: { x: 0, y: -v.focus * K },
    balance: { x: v.balance * K, y: 0 },
    motivation: { x: 0, y: v.motivation * K },
    calm: { x: -v.calm * K, y: 0 },
  };
  const m = mode.toLowerCase();
  // A stable id suffix keeps the two radial-gradient defs unique per plate,
  // so multiple plates on one page (a catalog view, for instance) do not
  // fight over the same defs id and end up sharing the wrong tint.
  const id = `epi-plate-${m}-${epiScore}`;

  return (
    <div className="epi-plate" style={{ width: size }}>
      <div className="epi-plate-instrument">
        <svg
          viewBox="-196 -156 392 312"
          role="img"
          aria-label={`Emotional fingerprint — EPI ${epiScore}, ${mode} mode. Focus ${Math.round(v.focus)}, Balance ${Math.round(v.balance)}, Motivation ${Math.round(v.motivation)}, Calm ${Math.round(v.calm)}.`}
        >
          <defs>
            <radialGradient id={`atmos-${id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0F0E0E" stopOpacity="0.86" />
              <stop offset="52%" stopColor="#0F0E0E" stopOpacity="0.62" />
              <stop offset="100%" stopColor="#0F0E0E" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`tint-${id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#E6D74F" stopOpacity="0.16" />
              <stop offset="48%" stopColor="#C12C79" stopOpacity="0.12" />
              <stop offset="80%" stopColor="#406BD6" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#0F0E0E" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* The atmospheric field — the dark near-black wash and its
              subtle plum/coral/indigo tint. Nothing here judges the
              profile; it is the room the measurement is presented in. */}
          <circle cx="0" cy="0" r="168" fill={`url(#atmos-${id})`} />
          <circle cx="0" cy="0" r="156" fill={`url(#tint-${id})`} />

          {/* The measurement grid — concentric reference rings and the
              Focus↔Motivation / Calm↔Balance crosshair. Reference
              geometry only: no target zone, no goal marker, no
              higher-is-better semantics. */}
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
          <line
            x1="0"
            y1="-102"
            x2="0"
            y2="102"
            stroke="rgba(251,251,244,0.2)"
            strokeWidth="0.5"
          />
          <line
            x1="-102"
            y1="0"
            x2="102"
            y2="0"
            stroke="rgba(251,251,244,0.2)"
            strokeWidth="0.5"
          />

          {/* The song's actual geometry. Vertices are the engine's own
              output; the mode drives the fill and stroke colour, so a
              Recover song reads plum, a Ready song reads yellow, and so
              on — no new colour is introduced by the visualization. */}
          <polygon
            points={pts}
            fill={`var(--mode-${m}-fill)`}
            stroke={`var(--mode-${m}-stroke)`}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />

          {/* Colored vertex nodes — one per dimension, in that
              dimension's colour, so the reader can tell which axis a
              node belongs to without following the crosshair. */}
          <circle cx={at.focus.x} cy={at.focus.y} r="3.4" fill={AXIS_COLOR.focus} />
          <circle cx={at.balance.x} cy={at.balance.y} r="3.4" fill={AXIS_COLOR.balance} />
          <circle cx={at.motivation.x} cy={at.motivation.y} r="3.4" fill={AXIS_COLOR.motivation} />
          <circle cx={at.calm.x} cy={at.calm.y} r="3.4" fill={AXIS_COLOR.calm} />

          {/* Dimension labels — set in the small caps stack the rest of
              the report uses, each in its dimension's colour. */}
          <text
            x="0"
            y="-118"
            textAnchor="middle"
            fontFamily="var(--font-lato), sans-serif"
            fontWeight={900}
            fontSize="9"
            letterSpacing="1"
            fill={AXIS_COLOR.focus}
          >
            FOCUS
          </text>
          <text
            x="120"
            y="3"
            textAnchor="start"
            fontFamily="var(--font-lato), sans-serif"
            fontWeight={900}
            fontSize="9"
            letterSpacing="1"
            fill={AXIS_COLOR.balance}
          >
            BALANCE
          </text>
          <text
            x="0"
            y="128"
            textAnchor="middle"
            fontFamily="var(--font-lato), sans-serif"
            fontWeight={900}
            fontSize="9"
            letterSpacing="1"
            fill={AXIS_COLOR.motivation}
          >
            MOTIVATION
          </text>
          <text
            x="-120"
            y="3"
            textAnchor="end"
            fontFamily="var(--font-lato), sans-serif"
            fontWeight={900}
            fontSize="9"
            letterSpacing="1"
            fill={AXIS_COLOR.calm}
          >
            CALM
          </text>
        </svg>
      </div>

      <div className="epi-plate-rule" />
      <div className="epi-plate-read">
        <span className="epi-plate-score font-display">{epiScore}</span>
        <span className="epi-plate-meta font-sans">
          <span className="epi-plate-label">EPI</span>
          <span className="epi-plate-mode">{mode} mode</span>
        </span>
      </div>
    </div>
  );
}
