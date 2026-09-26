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

// Link previews (Instagram, iMessage, Slack, X). The card image, favicon and
// Apple touch icon come from the file conventions in this folder:
// opengraph-image.png, twitter-image.png, icon.png, apple-icon.png, favicon.ico.
const SHARE_TITLE = "Song Analyzer by CHRP";
const SHARE_DESCRIPTION =
  "See what your song does to a listener. Your first full report is free.";

export const metadata: Metadata = {
  metadataBase: new URL("https://scan.chrp.ai"),
  title: "CHRP // Emotional Intelligence",
  description:
    "The objective commercial-creative feedback layer for working musicians.",
  openGraph: {
    type: "website",
    siteName: "CHRP",
    url: "https://scan.chrp.ai",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
  },
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
