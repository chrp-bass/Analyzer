import { ScoreRow } from "@/lib/fixtures/tracks";

export interface PolygonVertices {
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
