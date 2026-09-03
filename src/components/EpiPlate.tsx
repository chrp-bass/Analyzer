import { Mode } from "@/lib/fixtures/tracks";
import { PolygonVertices } from "@/lib/polygon";
import { PolygonRadar } from "@/components/PolygonRadar";

/**
 * THE EPI PLATE — the one thing in CHRP that has to be recognisable before
 * the logo is.
 *
 * Everywhere else in the product the polygon is an instrument: it carries
 * its measurement grid because it is teaching someone that the shape was
 * plotted. In the report hero it stops teaching and starts signing, so
 * three things change and nothing else does.
 *
 *   1. The grid comes off. Concentric rings and a crosshair are what make a
 *      reader parse a shape as a chart. Without them the same coordinates
 *      read as a mark — and the mark is different for every song, which a
 *      fill level or a ring never is. The shape IS the song's portrait;
 *      that is why this product does not need borrowed cover art to make a
 *      single track feel like an object.
 *
 *   2. The score leaves the shape. Inside the polygon the number was
 *      geometry-bound: CenterReadout scales it down to fit the widest span
 *      of the shape, so a narrow kite shrank the score to a speck and a
 *      wide one let it collide with its own outline. A signature number
 *      cannot be sized by the song it is measuring. Out here it is fixed,
 *      and it is the largest numeral in the document — which is the point,
 *      in a product whose measurement was previously its smallest element.
 *
 *   3. The mode stops being a pill. It is set as type on the same flush
 *      left edge as the score, because a 999px-radius chip was the only
 *      soft object in a hard-edged printed document.
 *
 * The lockup — shape above, score below, both flush left, rule between —
 * is fixed. It is meant to be repeated at any size on any surface without
 * being re-composed, so that the relationship itself becomes the memory.
 */
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
  return (
    <div className="epi-plate" style={{ width: size }}>
      <PolygonRadar
        vertices={vertices}
        mode={mode}
        epiScore={epiScore}
        size={size}
        showGrid={false}
        showCenter={false}
      />
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
