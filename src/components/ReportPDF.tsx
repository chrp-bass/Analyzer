import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Svg,
  Circle,
  Line,
  Polygon,
  G,
  Text as SvgText,
} from "@react-pdf/renderer";
import { ReportPayload, Mode } from "@/lib/fixtures/tracks";
import { polygonFromChrpScores, polygonPoints } from "@/lib/polygon";

const PAPER = "#FBFBF4";
const INK = "#0F0E0E";
const INK_SOFT = "#4A4540";
const INK_LIGHT = "#8A8278";
const YELLOW = "#E6D74F";
const PLUM = "#591739";
const PISTACHIO = "#BEE2A8";
const FRENCH_BLUE = "#406BD6";
const KELLY = "#008054";
const OAT = "#F7F3EA";
const RULE = "rgba(15, 14, 14, 0.18)";
const BAR_BG = "rgba(15, 14, 14, 0.08)";

const MODE_FILL: Record<Mode, string> = {
  Ready: "rgba(230,215,79,0.55)",
  Recover: "rgba(89,23,57,0.45)",
  Recharge: "rgba(190,226,168,0.65)",
  Flow: "rgba(64,107,214,0.45)",
};

const MODE_CHIP: Record<Mode, { bg: string; text: string }> = {
  Ready: { bg: YELLOW, text: INK },
  Recover: { bg: PLUM, text: PAPER },
  Recharge: { bg: PISTACHIO, text: INK },
  Flow: { bg: FRENCH_BLUE, text: PAPER },
};


let fontsRegistered = false;
export function registerFonts(fonts: Record<string, Buffer>) {
  if (fontsRegistered) return;
  const dataUrl = (b: Buffer) =>
    `data:font/ttf;base64,${b.toString("base64")}`;
  Font.register({
    family: "Cormorant",
    fonts: [
      { src: dataUrl(fonts["CormorantGaramond-400.ttf"]), fontWeight: 400 },
      { src: dataUrl(fonts["CormorantGaramond-700.ttf"]), fontWeight: 700 },
      {
        src: dataUrl(fonts["CormorantGaramond-Italic-400.ttf"]),
        fontWeight: 400,
        fontStyle: "italic",
      },
    ],
  });
  Font.register({
    family: "Lato",
    fonts: [
      { src: dataUrl(fonts["Lato-400.ttf"]), fontWeight: 400 },
      { src: dataUrl(fonts["Lato-700.ttf"]), fontWeight: 700 },
      { src: dataUrl(fonts["Lato-900.ttf"]), fontWeight: 900 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
  fontsRegistered = true;
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: PAPER,
    color: INK,
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 28,
    fontFamily: "Lato",
    fontSize: 9,
  },
  headerBand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingBottom: 6,
  },
  wordmark: { fontFamily: "Lato", fontWeight: 900, fontSize: 11, letterSpacing: 1 },
  headerRight: {
    fontFamily: "Lato",
    fontWeight: 400,
    fontSize: 8,
    color: INK_SOFT,
  },
  rule: { borderTopWidth: 0.5, borderTopColor: RULE, marginTop: 2 },
  ruleStrong: {
    borderTopWidth: 0.5,
    borderTopColor: INK,
    marginTop: 2,
  },
  hero: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 8,
  },
  heroLeft: { flex: 1, paddingRight: 14 },
  title: {
    fontFamily: "Cormorant",
    fontWeight: 700,
    fontSize: 34,
    lineHeight: 1,
    letterSpacing: -0.4,
  },
  artist: {
    fontFamily: "Cormorant",
    fontStyle: "italic",
    fontWeight: 400,
    fontSize: 14,
    color: INK_SOFT,
    marginTop: 4,
  },
  meta: {
    fontFamily: "Lato",
    fontWeight: 400,
    fontSize: 7.5,
    color: INK_LIGHT,
    marginTop: 6,
  },
  heroRight: { alignItems: "center", width: 170 },
  modeChip: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  modeChipText: {
    fontFamily: "Lato",
    fontWeight: 700,
    fontSize: 9,
  },
  rankUnder: {
    fontFamily: "Lato",
    fontWeight: 400,
    fontSize: 8,
    color: INK_SOFT,
    marginTop: 5,
  },
  rankUnderHi: { fontWeight: 700, color: KELLY },

  twoCol: {
    flexDirection: "row",
    marginTop: 8,
    gap: 16,
  },
  col: { flex: 1 },
  colHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 3,
  },
  colHeader: {
    fontFamily: "Lato",
    fontWeight: 700,
    fontSize: 7.5,
    letterSpacing: 0.5,
    color: INK_SOFT,
    textTransform: "uppercase",
  },
  colCaption: {
    fontFamily: "Cormorant",
    fontStyle: "italic",
    fontSize: 9,
    color: INK_SOFT,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 5,
  },
  scoreName: {
    fontFamily: "Lato",
    fontWeight: 700,
    fontSize: 9,
    width: 48,
  },
  scoreBarTrack: {
    flex: 1,
    height: 5,
    backgroundColor: BAR_BG,
  },
  scoreBarFill: { height: 5, backgroundColor: INK },
  scoreNum: {
    fontFamily: "Cormorant",
    fontWeight: 700,
    fontSize: 12,
    width: 22,
    textAlign: "right",
  },
  scoreRankBox: { width: 110 },
  scoreRank: { fontFamily: "Lato", fontWeight: 700, fontSize: 7 },
  scoreAnchor: {
    fontFamily: "Lato",
    fontWeight: 400,
    fontSize: 7,
    color: INK_SOFT,
  },

  section: { marginTop: 6 },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  sectionHeader: {
    fontFamily: "Lato",
    fontWeight: 700,
    fontSize: 7.5,
    letterSpacing: 0.5,
    color: INK_SOFT,
    textTransform: "uppercase",
  },
  sectionMeta: {
    fontFamily: "Lato",
    fontWeight: 400,
    fontSize: 7.5,
    color: INK_SOFT,
  },

  rhodesBlock: {
    backgroundColor: OAT,
    borderLeftWidth: 3,
    borderLeftColor: INK,
    paddingVertical: 5,
    paddingRight: 10,
    paddingLeft: 12,
    marginTop: 3,
  },
  rhodesText: {
    fontFamily: "Cormorant",
    fontStyle: "italic",
    fontWeight: 400,
    fontSize: 9.5,
    lineHeight: 1.28,
    color: INK,
  },

  signature: {
    fontFamily: "Cormorant",
    fontStyle: "italic",
    fontWeight: 400,
    fontSize: 12.5,
    lineHeight: 1.28,
    color: INK,
    marginTop: 3,
    maxWidth: 470,
  },

  placement: { flexDirection: "row", gap: 8, marginTop: 4 },
  placementNum: {
    fontFamily: "Lato",
    fontWeight: 900,
    fontSize: 8.5,
    color: YELLOW,
    width: 14,
  },
  placementBody: { flex: 1 },
  placementTitle: {
    fontFamily: "Cormorant",
    fontWeight: 700,
    fontSize: 11.5,
    lineHeight: 1.1,
  },
  placementText: {
    fontFamily: "Lato",
    fontWeight: 400,
    fontSize: 7.5,
    lineHeight: 1.28,
    color: INK_SOFT,
    marginTop: 1,
    maxWidth: 470,
  },

  throughComp: { flexDirection: "row", gap: 16, marginTop: 3 },
  throughText: {
    fontFamily: "Cormorant",
    fontStyle: "italic",
    fontSize: 10,
    lineHeight: 1.28,
  },
  compText: {
    fontFamily: "Cormorant",
    fontWeight: 400,
    fontSize: 10,
    lineHeight: 1.28,
  },
  bigQuote: {
    fontFamily: "Cormorant",
    fontWeight: 700,
    fontSize: 18,
    color: YELLOW,
    lineHeight: 1,
    marginBottom: -3,
  },

  livesBlock: {
    backgroundColor: OAT,
    borderLeftWidth: 3,
    borderLeftColor: YELLOW,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 3,
  },
  vertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  vertName: { fontFamily: "Lato", fontWeight: 700, fontSize: 8.5, width: 120 },
  vertTrack: { flex: 1, height: 5, backgroundColor: BAR_BG },
  vertFill: { height: 5, backgroundColor: INK },
  vertPct: {
    fontFamily: "Lato",
    fontWeight: 700,
    fontSize: 8.5,
    width: 28,
    textAlign: "right",
  },
  sampleRow: { marginTop: 6, paddingTop: 5, borderTopWidth: 0.5, borderTopColor: RULE },
  sampleText: { fontFamily: "Lato", fontSize: 8, color: INK_SOFT, lineHeight: 1.3 },
  sampleLabel: { fontWeight: 700, color: INK },

  creatorBand: {
    backgroundColor: INK,
    color: PAPER,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  creatorText: {
    fontFamily: "Lato",
    fontWeight: 400,
    fontSize: 7.5,
    color: PAPER,
    lineHeight: 1.35,
  },
  creatorName: { fontWeight: 700, color: YELLOW },

  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 5,
    borderTopWidth: 0.5,
    borderTopColor: RULE,
  },
  footerText: { fontFamily: "Lato", fontSize: 7.5, color: INK_SOFT },
  footerDisclaimer: {
    fontFamily: "Lato",
    fontSize: 7.5,
    color: INK_LIGHT,
  },
});

function PdfPolygon({ report }: { report: ReportPayload }) {
  const v = polygonFromChrpScores(report.chrp_scores);
  const points = polygonPoints(v);
  const fill = MODE_FILL[report.epi.mode];
  return (
    <Svg viewBox="-128 -120 256 240" width="130" height="130">
      <G>
        <Circle cx="0" cy="0" r="25" stroke="rgba(15,14,14,0.18)" strokeWidth={0.4} fill="none" />
        <Circle cx="0" cy="0" r="50" stroke="rgba(15,14,14,0.18)" strokeWidth={0.4} fill="none" />
        <Circle cx="0" cy="0" r="75" stroke="rgba(15,14,14,0.18)" strokeWidth={0.4} fill="none" />
        <Circle cx="0" cy="0" r="90" stroke="rgba(15,14,14,0.3)" strokeWidth={0.7} fill="none" />
        <Line x1="0" y1="-90" x2="0" y2="90" stroke="rgba(15,14,14,0.1)" strokeWidth={0.4} />
        <Line x1="-90" y1="0" x2="90" y2="0" stroke="rgba(15,14,14,0.1)" strokeWidth={0.4} />
        <Polygon points={points} fill={fill} stroke={INK} strokeWidth={1.2} />
        <Circle cx="0" cy={-v.focus * 0.9} r="2.6" fill={INK} />
        <Circle cx={v.balance * 0.9} cy="0" r="2.6" fill={INK} />
        <Circle cx="0" cy={v.motivation * 0.9} r="2.6" fill={INK} />
        <Circle cx={-v.calm * 0.9} cy="0" r="2.6" fill={INK} />
        <SvgText
          x="0"
          y="-100"
          textAnchor="middle"
          fill={INK_SOFT}
          style={{ fontFamily: "Lato", fontSize: 8, fontWeight: 700 }}
        >
          Focus
        </SvgText>
        <SvgText
          x="104"
          y="3"
          textAnchor="start"
          fill={INK_SOFT}
          style={{ fontFamily: "Lato", fontSize: 8, fontWeight: 700 }}
        >
          Balance
        </SvgText>
        <SvgText
          x="0"
          y="110"
          textAnchor="middle"
          fill={INK_SOFT}
          style={{ fontFamily: "Lato", fontSize: 8, fontWeight: 700 }}
        >
          Motivation
        </SvgText>
        <SvgText
          x="-104"
          y="3"
          textAnchor="end"
          fill={INK_SOFT}
          style={{ fontFamily: "Lato", fontSize: 8, fontWeight: 700 }}
        >
          Calm
        </SvgText>
        <SvgText
          x="0"
          y="-4"
          textAnchor="middle"
          fill={INK_SOFT}
          style={{ fontFamily: "Lato", fontSize: 6, fontWeight: 700 }}
        >
          EPI SCORE
        </SvgText>
        <SvgText
          x="0"
          y="26"
          textAnchor="middle"
          fill={INK}
          style={{ fontFamily: "Cormorant", fontSize: 38, fontWeight: 700 }}
        >
          {String(report.epi.score)}
        </SvgText>
      </G>
    </Svg>
  );
}

function ScoreRowView({
  row,
}: {
  row: ReportPayload["chrp_scores"][number];
}) {
  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreName}>{row.name}</Text>
      <View style={styles.scoreBarTrack}>
        <View style={[styles.scoreBarFill, { width: `${row.score}%` }]} />
      </View>
      <Text style={styles.scoreNum}>{row.score}</Text>
      <View style={styles.scoreRankBox}>
        {/* row.rank is an unsupported percentile claim and is not rendered.
            The anchor is descriptive, so it stays. */}
        <Text style={styles.scoreAnchor}>{row.anchor}</Text>
      </View>
    </View>
  );
}

export function ReportPDF({
  report,
  fonts,
}: {
  report: ReportPayload;
  fonts: Record<string, Buffer>;
}) {
  registerFonts(fonts);

  const chip = MODE_CHIP[report.epi.mode];

  return (
    <Document
      title={`CHRP Song Intelligence Report — ${report.track.title}`}
      author="CHRP"
    >
      <Page size="LETTER" style={styles.page}>
        {/* 1. Header band */}
        <View style={styles.headerBand}>
          <Text style={styles.wordmark}>CHRP</Text>
          <Text style={styles.headerRight}>
            {`Song Intelligence report  //  No. ${report.report_meta.id}  //  ${report.report_meta.version}`}
          </Text>
        </View>
        <View style={styles.rule} />

        {/* 2. Hero */}
        <View style={styles.hero}>
          <View style={styles.heroLeft}>
            <Text style={styles.title}>{report.track.title}</Text>
            <Text style={styles.artist}>by {report.track.artist}</Text>
            <Text style={styles.meta}>
              {`${report.report_meta.scanned_at_display}  //  ISRC ${report.track.isrc}`}
            </Text>

          </View>

          <View style={styles.heroRight}>
            <PdfPolygon report={report} />
            <View style={[styles.modeChip, { backgroundColor: chip.bg }]}>
              <Text style={[styles.modeChipText, { color: chip.text }]}>
                {report.epi.mode} mode
              </Text>
            </View>
          </View>
        </View>

        {/* 01 — Emotional signature. What the song is doing. */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>01 &middot; Emotional signature</Text>
          <View style={styles.rule} />
          <Text style={styles.signature}>{report.signature}</Text>
        </View>

        {/* The CHRP reading — the interpretation, after the position.
            CHRP is the voice; the named-analyst treatment is retired. */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>The CHRP reading</Text>
            <Text style={styles.sectionMeta}>interpretation</Text>
          </View>
          <View style={styles.rule} />
          <View style={styles.rhodesBlock}>
            <Text style={styles.rhodesText}>{report.rhodes}</Text>
          </View>
        </View>

        {/* 02 — EPI profile. */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>02 &middot; EPI profile</Text>
          <View style={styles.rule} />
        </View>
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <View style={styles.colHeaderRow}>
              <Text style={styles.colHeader}>The four dimensions</Text>
              <Text style={styles.colCaption}>the song&rsquo;s signature</Text>
            </View>
            <View style={styles.rule} />
            {report.chrp_scores.map((r) => (
              <ScoreRowView key={r.name} row={r} />
            ))}
          </View>
          {/* The engine computes no human performance variables today, so
              this is empty for every real song. A captioned column over
              nothing is a promise the report cannot keep. */}
          {report.hpv.length > 0 ? (
            <View style={styles.col}>
              <View style={styles.colHeaderRow}>
                <Text style={styles.colHeader}>Human Performance Variables</Text>
                <Text style={styles.colCaption}>
                  the states this music supports
                </Text>
              </View>
              <View style={styles.rule} />
              {report.hpv.map((r) => (
                <ScoreRowView key={r.name} row={r} />
              ))}
            </View>
          ) : null}
        </View>

        {/* 03 — What it's built for. */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>03 &middot; What it&rsquo;s built for</Text>
          <View style={styles.rule} />
          {report.placements.map((p, i) => (
            <View key={i} style={styles.placement} wrap={false}>
              <Text style={styles.placementNum}>
                {String(i + 1).padStart(2, "0")}
              </Text>
              <View style={styles.placementBody}>
                <Text style={styles.placementTitle}>{p.title}</Text>
                <Text style={styles.placementText}>{p.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* 04 — Pitch throughline. */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>04 &middot; Pitch throughline</Text>
          <View style={styles.rule} />
          <Text style={[styles.throughText, { marginTop: 4 }]}>
            <Text style={styles.bigQuote}>&ldquo;</Text>
            {report.throughline}
          </Text>
        </View>

        {/* 05 — Comparable context. */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>05 &middot; Comparable context</Text>
          <View style={styles.rule} />
          <Text style={[styles.compText, { marginTop: 4 }]}>
            {report.comparable}
          </Text>
        </View>

        {/* 06 — the decision advantage. Absent on reports persisted before
            the Rhodes v2 contract; those still render. */}
        {report.consider ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>06 &middot; Worth considering</Text>
            <View style={styles.rule} />
            <Text style={[styles.compText, { marginTop: 4 }]}>
              {report.consider}
            </Text>
          </View>
        ) : null}

        {/* The brief-signal block ("Where this music lives") is removed until
            verified data exists. It rested on brief counts and demand
            percentages the product cannot currently source. */}

        {/* 9. Creator tease */}
        <View style={styles.creatorBand}>
          <Text style={styles.creatorText}>
            <Text style={styles.creatorName}>{report.creator.name}</Text>
            {"  //  "}
            {report.creator.tracks_scored} track
            {report.creator.tracks_scored === 1 ? "" : "s"} scored. Scan your
            full catalog to unlock {report.creator.tease}
          </Text>
        </View>

        {/* 10. Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Scored by CHRP  //  scan.chrp.ai
            <Text style={styles.footerDisclaimer}>
              {"     "}Behavioural scoring only. Methodology at
              scan.chrp.ai/methodology.
            </Text>
          </Text>
          <Text style={styles.footerText}>
            Report ID: {report.report_meta.id}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
