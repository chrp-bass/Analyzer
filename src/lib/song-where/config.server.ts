import "server-only";

export function songWhereEnabled(): boolean {
  return process.env.SONG_WHERE_ENABLED === "true";
}

export function songWhereJobSecret(): string | undefined {
  return process.env.SONG_WHERE_JOB_SECRET;
}
