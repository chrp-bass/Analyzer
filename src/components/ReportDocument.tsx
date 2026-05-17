"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { Track } from "@/lib/fixtures/tracks";

const FONT_BASE =
  typeof window !== "undefined" ? window.location.origin : "";

Font.register({
  family: "Fraunces",
  fonts: [
    { src: `${FONT_BASE}/fonts/Fraunces-400.ttf`, fontWeight: 400 },
    { src: `${FONT_BASE}/fonts/Fraunces-500.ttf`, fontWeight: 500 },
    { src: `${FONT_BASE}/fonts/Fraunces-700.ttf`, fontWeight: 700 },
    { src: `${FONT_BASE}/fonts/Fraunces-900.ttf`, fontWeight: 900 },
    {
      src: `${FONT_BASE}/fonts/Fraunces-Italic-400.ttf`,
      fontWeight: 400,
      fontStyle: "italic",
    },
    {
      src: `${FONT_BASE}/fonts/Fraunces-Italic-500.ttf`,
      fontWeight: 500,
      fontStyle: "italic",
    },
  ],
});

Font.register({
  family: "SpaceGrotesk",
  fonts: [
    { src: `${FONT_BASE}/fonts/SpaceGrotesk-400.ttf`, fontWeight: 400 },
    { src: `${FONT_BASE}/fonts/SpaceGrotesk-500.ttf`, fontWeight: 500 },
    { src: `${FONT_BASE}/fonts/SpaceGrotesk-600.ttf`, fontWeight: 600 },
  ],
});

Font.register({
  family: "JetBrainsMono",
  fonts: [
    { src: `${FONT_BASE}/fonts/JetBrainsMono-400.ttf`, fontWeight: 400 },
    { src: `${FONT_BASE}/fonts/JetBrainsMono-500.ttf`, fontWeight: 500 },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

const PAPER = "#F1ECE2";
const INK = "#141210";
const INK_SOFT = "#4A4540";
const RULE = "#B8AE9F";
const ACCENT = "#C8412B";

const styles = StyleSheet.create({
  page: {
    backgroundColor: PAPER,
    color: INK,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 48,
    fontFamily: "SpaceGrotesk",
    fontSize: 11,
  },
  headerBand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingBottom: 8,
  },
  headerWordmark: {
    fontFamily: "Fraunces",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 2,
  },
  headerLabel: {
    fontFamily: "SpaceGrotesk",
    fontWeight: 500,
    fontSize: 8,
    letterSpacing: 1.6,
    color: INK_SOFT,
  },
  rule: {
    borderTopWidth: 0.5,
    borderTopColor: RULE,
  },
  hero: {
    marginTop: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroLeft: { flex: 1, paddingRight: 24 },
  heroTitle: {
    fontFamily: "Fraunces",
    fontWeight: 900,
    fontSize: 46,
    lineHeight: 1.02,
    letterSpacing: -1.2,
  },
  heroArtist: {
    fontFamily: "Fraunces",
    fontStyle: "italic",
    fontWeight: 400,
    fontSize: 18,
    color: INK_SOFT,
    marginTop: 8,
  },
  heroMeta: {
    fontFamily: "JetBrainsMono",
    fontSize: 8,
    letterSpacing: 1.4,
    color: INK_SOFT,
    marginTop: 14,
  },
  modeChip: {
    borderWidth: 0.75,
    borderColor: ACCENT,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  modeChipText: {
    fontFamily: "SpaceGrotesk",
    fontWeight: 500,
    color: ACCENT,
    letterSpacing: 1.8,
    fontSize: 8,
  },
  section: {
    marginTop: 24,
  },
  sectionLabel: {
    fontFamily: "SpaceGrotesk",
    fontWeight: 500,
    fontSize: 8,
    letterSpacing: 1.6,
    color: ACCENT,
    marginBottom: 6,
  },
  signature: {
    fontFamily: "Fraunces",
    fontStyle: "italic",
    fontWeight: 400,
    fontSize: 18,
    lineHeight: 1.35,
    color: INK,
    marginTop: 10,
    maxWidth: 470,
  },
  builtForRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 10,
  },
  builtForNum: {
    fontFamily: "JetBrainsMono",
    fontSize: 9,
    color: INK_SOFT,
    width: 24,
    paddingTop: 3,
  },
  builtForTitle: {
    fontFamily: "Fraunces",
    fontWeight: 600,
    fontSize: 13,
    lineHeight: 1.2,
  },
  builtForBody: {
    fontFamily: "SpaceGrotesk",
    fontWeight: 400,
    fontSize: 10,
    color: INK_SOFT,
    lineHeight: 1.4,
    marginTop: 3,
  },
  pitchQuote: {
    fontFamily: "Fraunces",
    fontStyle: "italic",
    fontWeight: 400,
    fontSize: 16,
    lineHeight: 1.4,
    color: INK,
    marginTop: 10,
    maxWidth: 470,
  },
  comparable: {
    fontFamily: "Fraunces",
    fontWeight: 500,
    fontSize: 13,
    lineHeight: 1.4,
    color: INK,
    marginTop: 8,
    maxWidth: 470,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
  },
  footerMono: {
    fontFamily: "JetBrainsMono",
    fontSize: 7.5,
    letterSpacing: 1.2,
    color: INK_SOFT,
  },
  disclaimer: {
    fontFamily: "SpaceGrotesk",
    fontSize: 7,
    color: INK_SOFT,
    marginTop: 6,
    lineHeight: 1.3,
  },
});

export function ReportDocument({ track }: { track: Track }) {
  const date = formatDateForPDF(new Date());
  return (
    <Document
      title={`CHRP Sync Intelligence Report — ${track.title}`}
      author="CHRP"
      subject="Sync Intelligence Report"
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerBand}>
          <Text style={styles.headerWordmark}>CHRP</Text>
          <Text style={styles.headerLabel}>SYNC INTELLIGENCE REPORT</Text>
        </View>
        <View style={styles.rule} />

        <View style={styles.hero}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroTitle}>{track.title}</Text>
            <Text style={styles.heroArtist}>by {track.artist}</Text>
            <Text style={styles.heroMeta}>SCANNED {date}</Text>
          </View>
          <View style={styles.modeChip}>
            <Text style={styles.modeChipText}>
              {track.mode.toUpperCase()} MODE
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>THE SIGNATURE</Text>
          <View style={styles.rule} />
          <Text style={styles.signature}>&ldquo;{track.signature}&rdquo;</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>WHAT IT&rsquo;S BUILT FOR</Text>
          <View style={styles.rule} />
          {track.builtFor.map((b, i) => (
            <View key={i} style={styles.builtForRow} wrap={false}>
              <Text style={styles.builtForNum}>
                {String(i + 1).padStart(2, "0")}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.builtForTitle}>{b.title}</Text>
                <Text style={styles.builtForBody}>{b.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>THE PITCH LINE</Text>
          <View style={styles.rule} />
          <Text style={styles.pitchQuote}>
            &ldquo;{track.pitchLine}&rdquo;
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>THE COMPARABLE</Text>
          <View style={styles.rule} />
          <Text style={styles.comparable}>{track.comparable}</Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.rule} />
          <View style={styles.footerRow}>
            <Text style={styles.footerMono}>
              Scored by CHRP // scan.chrp.ai
            </Text>
            <Text style={styles.footerMono}>
              CHRP-{track.id.toUpperCase().slice(0, 4)}-2026
            </Text>
          </View>
          <Text style={styles.disclaimer}>
            CHRP scores reflect behavioral resonance, not commercial guarantee.
            Methodology at scan.chrp.ai/methodology.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

function formatDateForPDF(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}
