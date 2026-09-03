"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Mode, MODE_COLORS } from "@/lib/fixtures/tracks";
import { PolygonVertices } from "@/lib/polygon";

export interface PolygonRadarProps {
  vertices: PolygonVertices;
  mode: Mode;
  epiScore: number;
  size?: number;
  animated?: boolean;
  showLabels?: boolean;
  showCenter?: boolean;
  /**
   * The measurement grid — concentric rings and the axis crosshair.
   *
   * On every teaching surface this stays on: it is what tells a first-time
   * reader that the shape is plotted rather than drawn. In the report hero
   * it comes off. There the shape is not explaining itself, it is being
   * the song's signature, and the grid is the difference between a chart
   * and a mark. See EpiPlate.
   */
  showGrid?: boolean;
}

// Colors come from CSS variables so the radar adapts to its container.
// Inside .chrp-report (cream paper) the variables resolve to dark strokes;
// elsewhere (dark theme) they resolve to translucent light strokes.
const AXIS = "var(--polygon-axis)";
const RING = "var(--polygon-ring)";
const RING_OUTER = "var(--polygon-ring-outer)";
const POLYGON_LABEL = "var(--polygon-label)";
const POLYGON_TEXT = "var(--polygon-text)";

export function PolygonRadar({
  vertices,
  mode,
  epiScore,
  size = 150,
  animated = false,
  showLabels = true,
  showCenter = true,
  showGrid = true,
}: PolygonRadarProps) {
  const v = vertices;
  // The drawing is choreography, never the only way the shape is stated.
  // Under reduced motion the polygon is painted whole and immediately —
  // callers may still pass `animated`, and this is the last word on it.
  const prefersReduced = useReducedMotion();
  const animate = animated && !prefersReduced;
  const fill = MODE_COLORS[mode].polygonFill;
  // The polygon outline and vertex dots pick up a per-mode stroke so the
  // shape reads as one color. Inside .chrp-report this variable scope-
  // restores to var(--chrp-black) so the cream-paper report stays in ink.
  const stroke = `var(--mode-${mode.toLowerCase()}-stroke)`;

  const k = 0.9;
  const top = { x: 0, y: -v.focus * k };
  const right = { x: v.balance * k, y: 0 };
  const bottom = { x: 0, y: v.motivation * k };
  const left = { x: -v.calm * k, y: 0 };
  // Vertical midpoint of the polygon shape (halfway between the top and
  // bottom vertices). Shifts the EPI readout so it sits centered on the
  // actual polygon rather than on the underlying circle.
  const shapeMidY = (top.y + bottom.y) / 2;
  // Horizontal width of the polygon at a given y — used by the readout
  // to scale its font so the label + number fit inside the shape without
  // being cut by the outline on narrow kite polygons.
  const halfHeightUp = v.focus * k;
  const halfHeightDown = v.motivation * k;
  const halfWidth = (v.calm + v.balance) * k / 2;
  function widthAt(y: number): number {
    if (y <= 0) {
      return halfWidth * 2 * Math.max(0, (halfHeightUp + y) / halfHeightUp);
    }
    return halfWidth * 2 * Math.max(0, (halfHeightDown - y) / halfHeightDown);
  }
  const availableWidth = widthAt(shapeMidY) * 0.86;

  return (
    <svg
      viewBox="-132 -120 270 240"
      width={size}
      height={size}
      overflow="visible"
      aria-label={`Emotional fingerprint, EPI ${epiScore}, ${mode} mode`}
    >
      {showGrid && (
        <g>
          <circle cx="0" cy="0" r="25" fill="none" stroke={RING} strokeWidth="0.4" />
          <circle cx="0" cy="0" r="50" fill="none" stroke={RING} strokeWidth="0.4" />
          <circle cx="0" cy="0" r="75" fill="none" stroke={RING} strokeWidth="0.4" />
          <circle cx="0" cy="0" r="90" fill="none" stroke={RING_OUTER} strokeWidth="0.7" />
          <line x1="0" y1="-90" x2="0" y2="90" stroke={AXIS} strokeWidth="0.4" />
          <line x1="-90" y1="0" x2="90" y2="0" stroke={AXIS} strokeWidth="0.4" />
        </g>
      )}

      {animate ? (
        <AnimatedShape
          top={top}
          right={right}
          bottom={bottom}
          left={left}
          fill={fill}
          stroke={stroke}
        />
      ) : (
        <StaticShape
          top={top}
          right={right}
          bottom={bottom}
          left={left}
          fill={fill}
          stroke={stroke}
        />
      )}

      {showLabels && <AxisLabels />}
      {showCenter && (
        <CenterReadout
          epiScore={epiScore}
          animated={animate}
          yOffset={shapeMidY}
          availableWidth={availableWidth}
        />
      )}
    </svg>
  );
}

function StaticShape({
  top,
  right,
  bottom,
  left,
  fill,
  stroke,
}: {
  top: { x: number; y: number };
  right: { x: number; y: number };
  bottom: { x: number; y: number };
  left: { x: number; y: number };
  fill: string;
  stroke: string;
}) {
  const points = `${top.x},${top.y} ${right.x},${right.y} ${bottom.x},${bottom.y} ${left.x},${left.y}`;
  return (
    <g>
      <polygon
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx={top.x} cy={top.y} r="2.6" fill={stroke} />
      <circle cx={right.x} cy={right.y} r="2.6" fill={stroke} />
      <circle cx={bottom.x} cy={bottom.y} r="2.6" fill={stroke} />
      <circle cx={left.x} cy={left.y} r="2.6" fill={stroke} />
    </g>
  );
}

function AnimatedShape({
  top,
  right,
  bottom,
  left,
  fill,
  stroke,
}: {
  top: { x: number; y: number };
  right: { x: number; y: number };
  bottom: { x: number; y: number };
  left: { x: number; y: number };
  fill: string;
  stroke: string;
}) {
  // Reveal timing inside the 3.5s back-half of the 10s sequence:
  //  6.0-7.0 Focus appears        → t=0.0-1.0 here
  //  7.0-7.5 Balance + line       → t=1.0-1.5
  //  7.5-8.0 Motivation + line    → t=1.5-2.0
  //  8.0-8.5 Calm + line          → t=2.0-2.5
  //  8.5-9.0 Fill in              → t=2.5-3.0
  const dotDelays = [0.0, 1.0, 1.5, 2.0];
  const edgeDelays = [1.0, 1.5, 2.0, 2.5];
  const points = [top, right, bottom, left];

  return (
    <g>
      {[
        [top, right],
        [right, bottom],
        [bottom, left],
        [left, top],
      ].map(([a, b], i) => (
        <motion.line
          key={i}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={stroke}
          strokeWidth="1.2"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            delay: edgeDelays[i],
            duration: 0.5,
            ease: "easeOut",
          }}
        />
      ))}
      <motion.polygon
        points={`${top.x},${top.y} ${right.x},${right.y} ${bottom.x},${bottom.y} ${left.x},${left.y}`}
        fill={fill}
        stroke="none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.5, duration: 0.5, ease: "easeIn" }}
      />
      {points.map((p, i) => (
        <motion.circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="2.6"
          fill={stroke}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: dotDelays[i],
            duration: 0.35,
            ease: "easeOut",
          }}
        />
      ))}
    </g>
  );
}

function AxisLabels() {
  return (
    <g>
      <text
        x="0"
        y="-100"
        textAnchor="middle"
        fontFamily="var(--font-lato), sans-serif"
        fontWeight={700}
        fontSize="8"
        fill={POLYGON_LABEL}
      >
        Focus
      </text>
      <text
        x="104"
        y="3"
        textAnchor="start"
        fontFamily="var(--font-lato), sans-serif"
        fontWeight={700}
        fontSize="8"
        fill={POLYGON_LABEL}
      >
        Balance
      </text>
      <text
        x="0"
        y="110"
        textAnchor="middle"
        fontFamily="var(--font-lato), sans-serif"
        fontWeight={700}
        fontSize="8"
        fill={POLYGON_LABEL}
      >
        Motivation
      </text>
      <text
        x="-104"
        y="3"
        textAnchor="end"
        fontFamily="var(--font-lato), sans-serif"
        fontWeight={700}
        fontSize="8"
        fill={POLYGON_LABEL}
      >
        Calm
      </text>
    </g>
  );
}

function CenterReadout({
  epiScore,
  animated,
  yOffset = 0,
  availableWidth = Infinity,
}: {
  epiScore: number;
  animated: boolean;
  yOffset?: number;
  availableWidth?: number;
}) {
  // Font sizing: the readout defaults to 38 for the number and 6 for
  // the label. If the polygon at yOffset is narrower than those default
  // widths, scale both fonts together so the pair keeps its proportions.
  const numberStr = String(epiScore);
  // Cormorant Bold roughly renders each glyph at ~0.55 * fontSize wide.
  // Lato Bold uppercase at ~0.60 * fontSize wide.
  const naturalNumberWidth = numberStr.length * 38 * 0.55;
  const naturalLabelWidth = "EPI SCORE".length * 6 * 0.60;
  const naturalMax = Math.max(naturalNumberWidth, naturalLabelWidth);
  // Never scale UP (would look weird), only down. Clamp to a min of 0.35
  // so tiny polygons don't reduce the readout to unreadable specks.
  const scale = Math.max(
    0.35,
    Math.min(1, availableWidth / Math.max(1, naturalMax)),
  );
  const numberFontSize = 38 * scale;
  const labelFontSize = Math.max(5, 6 * scale);
  // Baseline positions scale with font size so the label-above / number-
  // below stack stays visually balanced at any scale, and both center
  // vertically on yOffset (the polygon's midpoint).
  const labelY = yOffset - 4 * scale;
  const numberY = yOffset + 26 * scale;
  // Cream halo painted BEHIND each glyph via paint-order:stroke:fill —
  // catches any residual polygon-outline crossings at the glyph edges
  // where the scaling can't perfectly guarantee zero overlap.
  const halo = "var(--chrp-white)";
  return (
    <g>
      <motion.text
        x="0"
        y={labelY}
        textAnchor="middle"
        fontFamily="var(--font-lato), sans-serif"
        fontWeight={700}
        fontSize={labelFontSize}
        fill={POLYGON_LABEL}
        stroke={halo}
        strokeWidth={0.8 * scale}
        strokeLinejoin="round"
        style={{ paintOrder: "stroke fill" }}
        letterSpacing="0.5"
        initial={animated ? { opacity: 0 } : false}
        animate={animated ? { opacity: 1 } : undefined}
        transition={animated ? { delay: 3.0, duration: 0.3 } : undefined}
      >
        EPI SCORE
      </motion.text>
      <motion.text
        x="0"
        y={numberY}
        textAnchor="middle"
        fontFamily="var(--font-cormorant), Georgia, serif"
        fontWeight={700}
        fontSize={numberFontSize}
        fill={POLYGON_TEXT}
        stroke={halo}
        strokeWidth={4 * scale}
        strokeLinejoin="round"
        style={{ paintOrder: "stroke fill" }}
        initial={animated ? { opacity: 0 } : false}
        animate={animated ? { opacity: 1 } : undefined}
        transition={animated ? { delay: 3.0, duration: 0.5 } : undefined}
      >
        {epiScore}
      </motion.text>
    </g>
  );
}
