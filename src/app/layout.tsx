import type { Metadata } from "next";
import { Cormorant_Garamond, Lato } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Tiempos Fine Light — brand display face for marketing surfaces. Served from
// public/brand/fonts/ via next/font/local so it's pre-bundled (no FOUT).
const tiemposFine = localFont({
  src: "../../public/brand/fonts/TiemposFine-Light.woff2",
  variable: "--font-tiempos",
  weight: "300",
  style: "normal",
  display: "swap",
});

// Cormorant Garamond stays loaded for the V8 report — scope-overridden back
// inside .chrp-report in globals.css so the report keeps its editorial face.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  variable: "--font-lato",
  weight: ["300", "400", "700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CHRP // Emotional Intelligence",
  description:
    "The objective commercial-creative feedback layer for working musicians.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${tiemposFine.variable} ${cormorant.variable} ${lato.variable}`}
    >
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
