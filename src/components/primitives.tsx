import { ReactNode } from "react";

export function Label({
  children,
  mono = false,
  accent = false,
  className = "",
}: {
  children: ReactNode;
  mono?: boolean;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`${mono ? "smallcaps-mono" : "smallcaps"} ${
        accent ? "text-accent" : "text-ink-soft"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Rule({ className = "" }: { className?: string }) {
  return <div className={`h-px w-full bg-rule ${className}`} />;
}

export function ModeChip({
  mode,
  className = "",
}: {
  mode: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-block border border-accent text-accent px-2.5 py-1 smallcaps ${className}`}
      style={{ letterSpacing: "0.18em" }}
    >
      {mode} Mode
    </span>
  );
}

export function PullQuote({
  children,
  size = "lg",
}: {
  children: ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  const sizes = {
    md: "text-xl md:text-2xl",
    lg: "text-2xl md:text-[28px] leading-[1.4]",
    xl: "text-3xl md:text-4xl leading-[1.3]",
  };
  return (
    <blockquote
      className={`font-serif italic font-normal text-ink ${sizes[size]}`}
      style={{ fontFeatureSettings: '"liga"' }}
    >
      {children}
    </blockquote>
  );
}

export function SectionHead({
  label,
  accent = true,
}: {
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="mb-5">
      <Label mono accent={accent}>
        {label}
      </Label>
      <Rule className="mt-2" />
    </div>
  );
}
