export type FitBand = "strong" | "moderate" | "worth_exploring";
export type Trust = "verified" | "curated" | "scraped";

export type SongWhereMatch = {
  matchId: string;
  title: string;
  sourceName: string;
  trust: Trust;
  fit: FitBand;
  deadline: string | null;
  goHref: string;
};

export type SongWhereResponse = { matches: SongWhereMatch[] };
