"use client";

import { ReactNode, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export function PaymentDialog({
  trigger,
  label,
  price,
  body,
}: {
  trigger: ReactNode;
  label: string;
  price: string;
  body: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-block">
        {trigger}
      </span>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <div className="absolute inset-0 bg-ink/60" />
            <motion.div
              className="relative bg-paper border border-rule max-w-md w-full p-8 md:p-10"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="smallcaps-mono text-accent mb-2">{label}</div>
              <div
                className="font-serif font-black text-[40px] md:text-[52px] display-tight mb-4"
                style={{ fontVariationSettings: '"opsz" 96' }}
              >
                {price}
              </div>
              <p className="text-ink-soft leading-relaxed mb-8">{body}</p>
              <div className="smallcaps-mono text-ink-soft mb-6 text-[11px]">
                Payment in v2. This is a preview build — your first scan is on
                us.
              </div>
              <button
                onClick={() => setOpen(false)}
                className="smallcaps text-ink hover:text-accent transition-colors"
              >
                ← Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
