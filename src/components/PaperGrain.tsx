export function PaperGrain() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 pointer-events-none opacity-[0.06] mix-blend-multiply z-0"
    >
      <svg width="100%" height="100%">
        <filter id="paperNoise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.8 0"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#paperNoise)" />
      </svg>
    </div>
  );
}
