import { Mode, MODE_COLORS, ScoreRow } from "@/lib/fixtures/tracks";

interface PolygonVertices {
  focus: number;
  balance: number;
  motivation: number;
  calm: number;
}

export function polygonFromChrpScores(
  chrpScores: ScoreRow[],
): PolygonVertices {
  const find = (name: string) =>
    chrpScores.find((s) => s.name.toLowerCase() === name)?.score ?? 0;
  return {
    focus: find("focus"),
    balance: find("balance"),
    motivation: find("motivation"),
    calm: find("calm"),
  };
}

export function polygonPoints(v: PolygonVertices): string {
  const k = 0.9;
  const focusY = -v.focus * k;
  const balanceX = v.balance * k;
  const motivationY = v.motivation * k;
  const calmX = -v.calm * k;
  return `0,${focusY} ${balanceX},0 0,${motivationY} ${calmX},0`;
}

export interface PolygonRadarProps {
  chrpScores: ScoreRow[];
  mode: Mode;
  epiScore: number;
  size?: number;
}

export function PolygonRadar({
  chrpScores,
  mode,
  epiScore,
  size = 150,
}: PolygonRadarProps) {
  const v = polygonFromChrpScores(chrpScores);
  const points = polygonPoints(v);
  const fill = MODE_COLORS[mode].polygonFill;

  const axisStroke = "rgba(15,14,14,0.1)";
  const ringStroke = "rgba(15,14,14,0.18)";
  const ringStrokeOuter = "rgba(15,14,14,0.3)";

  return (
    <svg
      viewBox="-128 -120 256 240"
      width={size}
      height={size}
      aria-label={`Emotional fingerprint, EPI ${epiScore}, ${mode} mode`}
    >
      <circle cx="0" cy="0" r="25" fill="none" stroke={ringStroke} strokeWidth="0.4" />
      <circle cx="0" cy="0" r="50" fill="none" stroke={ringStroke} strokeWidth="0.4" />
      <circle cx="0" cy="0" r="75" fill="none" stroke={ringStroke} strokeWidth="0.4" />
      <circle cx="0" cy="0" r="90" fill="none" stroke={ringStrokeOuter} strokeWidth="0.7" />
      <line x1="0" y1="-90" x2="0" y2="90" stroke={axisStroke} strokeWidth="0.4" />
      <line x1="-90" y1="0" x2="90" y2="0" stroke={axisStroke} strokeWidth="0.4" />

      <polygon
        points={points}
        fill={fill}
        stroke="var(--chrp-black)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      <circle cx="0" cy={-v.focus * 0.9} r="2.6" fill="var(--chrp-black)" />
      <circle cx={v.balance * 0.9} cy="0" r="2.6" fill="var(--chrp-black)" />
      <circle cx="0" cy={v.motivation * 0.9} r="2.6" fill="var(--chrp-black)" />
      <circle cx={-v.calm * 0.9} cy="0" r="2.6" fill="var(--chrp-black)" />

      <text
        x="0"
        y="-100"
        textAnchor="middle"
        fontFamily="var(--font-lato), sans-serif"
        fontWeight={700}
        fontSize="8"
        fill="var(--ink-soft)"
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
        fill="var(--ink-soft)"
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
        fill="var(--ink-soft)"
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
        fill="var(--ink-soft)"
      >
        Calm
      </text>

      <text
        x="0"
        y="-4"
        textAnchor="middle"
        fontFamily="var(--font-lato), sans-serif"
        fontWeight={700}
        fontSize="6"
        fill="var(--ink-soft)"
        letterSpacing="0.5"
      >
        EPI SCORE
      </text>
      <text
        x="0"
        y="26"
        textAnchor="middle"
        fontFamily="var(--font-cormorant), Georgia, serif"
        fontWeight={700}
        fontSize="38"
        fill="var(--chrp-black)"
      >
        {epiScore}
      </text>
    </svg>
  );
}
