"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

export function AnimatedWaveform({
  bars = 56,
  height = 220,
  width = 320,
}: {
  bars?: number;
  height?: number;
  width?: number;
}) {
  const data = useMemo(() => {
    return Array.from({ length: bars }, (_, i) => {
      const wave =
        Math.sin(i * 0.42) * 0.4 +
        Math.sin(i * 0.18 + 1.1) * 0.35 +
        Math.sin(i * 0.95) * 0.2;
      return Math.max(0.08, Math.abs(wave));
    });
  }, [bars]);

  const barWidth = width / bars;

  return (
    <div className="w-full" style={{ maxWidth: width }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        <g>
          {data.map((v, i) => {
            const h = v * height * 0.9;
            const y = (height - h) / 2;
            return (
              <motion.rect
                key={i}
                x={i * barWidth + 0.5}
                width={Math.max(1.2, barWidth - 1.2)}
                y={y}
                height={h}
                fill="var(--ink)"
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{
                  opacity: 1,
                  scaleY: [1, 1.06, 0.94, 1],
                }}
                transition={{
                  opacity: { delay: i * 0.012, duration: 0.4 },
                  scaleY: {
                    duration: 2 + (i % 5) * 0.3,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: (i % 7) * 0.08,
                  },
                }}
                style={{ transformOrigin: `center ${height / 2}px` }}
              />
            );
          })}
        </g>
      </svg>
      <div className="mt-3 flex justify-between smallcaps-mono text-ink-soft">
        <span>00:00</span>
        <span>—</span>
        <span>03:42</span>
      </div>
    </div>
  );
}
